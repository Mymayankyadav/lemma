// N160 (areas 26, 29): test notifications, connection health and the account
// controls that need a confirmation token. PGlite only: never production.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const role=async(name)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await q("select set_config('request.jwt.claims','',false)");
 if(name)await db.exec('set role '+name);
};
const as=async(id)=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','',false)");
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
let n=0;
const env=(operation,patch={})=>({operationId:'dddddddd-dddd-4ddd-8ddd-'+String(++n).padStart(12,'0'),schemaVersion:1,resource:'account_controls',operation,patch});
const run=async(payload)=>(await q('select public.account_controls_command($1::jsonb) r',[JSON.stringify(payload)]))[0].r;
const viaMcp=async(user,payload)=>{await role('service_role');try{return (await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) r',[user,'claude',JSON.stringify(payload)]))[0].r}finally{await role(null)}};
const read=async(user,what)=>{await role('service_role');try{return (await q('select public.mcp_read($1::uuid,$2::text,$3::jsonb) r',[user,what,'{}']))[0].r}finally{await role(null)}};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(
    nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid)
  $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('ab',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.some(x=>x.endsWith('_n160_account_controls.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 const dev=async(user,label)=>(await q("insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,$2,'k','a',$3,'desktop') returning id",[user,'https://push.example/'+label+user,label]))[0].id;
 const d1=await dev(owner,'Phone'),d2=await dev(owner,'Laptop'),dOther=await dev(other,'Theirs');

 // Browsers cannot read confirmation tokens.
 await as(owner);
 await assert.rejects(q('select * from public.account_confirmations'),/permission denied/);

 // A test notification is queued for one of the owner's live devices, never another owner's.
 const test=await run(env('test_notification',{device_id:d1}));
 assert.equal(test.status,'ok');
 const queued=(await q('select kind,status,facts,title from public.notifications where id=$1',[test.notification_id]))[0];
 assert.equal(queued.kind,'test');assert.equal(queued.status,'queued');assert.equal(queued.facts.device_id,d1);
 await assert.rejects(run(env('test_notification',{device_id:dOther})),/Device not found/);
 const noDevice=await run(env('test_notification'));assert.equal(noDevice.status,'ok');

 // Connection health reads no secret.
 await role(null);
 await q("update public.push_devices set last_ok_at=now(),failures=2 where id=$1",[d2]);
 const health=await read(owner,'connection');
 assert.equal(health.devices.length,2);
 assert.equal(health.notifications.queued,2);
 assert.ok(!JSON.stringify(health).includes('endpoint')&&!JSON.stringify(health).includes('1111'),'no endpoint or secret in the health read');
 assert.equal(health.connector.last_client,null);

 // Disable devices: a token is needed, single-use, owner- and action-bound, and expires.
 await as(owner);
 await assert.rejects(run(env('confirm',{action:'disable_devices',token:'00000000-0000-4000-8000-000000000000'})),/missing, used, expired/);
 const req=await run(env('request',{action:'disable_devices'}));
 assert.equal(req.status,'ok');assert.equal(req.actionNo,null);assert.ok(req.confirm.token);
 assert.match(req.confirm.effect,/stops receiving notifications/);
 await assert.rejects(run(env('confirm',{action:'disconnect_connector',token:req.confirm.token})),/missing, used, expired/);
 await assert.rejects(run(env('confirm',{action:'disable_devices',token:'00000000-0000-4000-8000-000000000000'})),/missing, used, expired/);
 await as(other);
 await assert.rejects(run(env('confirm',{action:'disable_devices',token:req.confirm.token})),/missing, used, expired/);
 await as(owner);
 const confirmPayload=env('confirm',{action:'disable_devices',token:req.confirm.token});
 const done=await run(confirmPayload);
 assert.equal(done.affected,2);assert.equal(done.done,'disable_devices');
 assert.deepEqual(await run(confirmPayload),done,'receipt replay');
 await assert.rejects(run(env('confirm',{action:'disable_devices',token:req.confirm.token})),/missing, used, expired/);
 await role(null);
 assert.equal((await q('select count(*)::int n from public.push_devices where user_id=$1 and disabled_at is not null',[owner]))[0].n,2);
 assert.equal((await q('select count(*)::int n from public.push_devices where user_id=$1 and disabled_at is not null',[other]))[0].n,0);
 // Expiry.
 await as(owner);
 const req2=await run(env('request',{action:'disable_devices'}));
 await role(null);
 await q("update public.account_confirmations set expires_at=now()-interval '1 minute' where user_id=$1",[owner]);
 await as(owner);
 await assert.rejects(run(env('confirm',{action:'disable_devices',token:req2.confirm.token})),/missing, used, expired/);

 // Disconnect the connector through the MCP bridge: the link changes and is never returned.
 const reqD=await viaMcp(owner,env('request',{action:'disconnect_connector'}));
 assert.equal(reqD.status,'ok');
 const before=(await q('select connector_secret from public.settings where user_id=$1',[owner]))[0].connector_secret;
 assert.equal(before,'1'.repeat(48));
 const disc=await viaMcp(owner,env('confirm',{action:'disconnect_connector',token:reqD.confirm.token}));
 assert.equal(disc.status,'ok');assert.equal(disc.done,'disconnect_connector');
 assert.ok(!JSON.stringify(disc).includes('ab'.repeat(24)),'the new link is not in the receipt');
 const afterSecret=(await q('select connector_secret from public.settings where user_id=$1',[owner]))[0].connector_secret;
 assert.notEqual(afterSecret,before);
 assert.equal((await q('select connector_secret from public.settings where user_id=$1',[other]))[0].connector_secret,'2'.repeat(48));
 assert.ok(disc.actionNo>0,'the rotation is a journal action the owner can see in History');
 await as(owner);
 await assert.rejects(run(env('request',{action:'delete_account'})),/action must be/);
 console.log('N160 account controls: test notification, health, confirmation tokens, disable devices and disconnect passed');
}finally{await db.close()}
