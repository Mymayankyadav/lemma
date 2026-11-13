// N160 (area 28): chat sends one short-lived command to one registered app
// device; the device reports delivered, then applied or rejected. PGlite only.
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
const env=(operation,extra={})=>({operationId:'abababab-abab-4bab-8bab-'+String(++n).padStart(12,'0'),schemaVersion:1,resource:'device_commands',operation,...extra});
const run=async(payload)=>(await q('select public.device_commands_command($1::jsonb) r',[JSON.stringify(payload)]))[0].r;
const viaMcp=async(user,payload)=>{await role('service_role');try{return (await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) r',[user,'claude',JSON.stringify(payload)]))[0].r}finally{await role(null)}};
const register=async(key,label,platform='web')=>(await q('select public.register_app_device($1,$2,$3) r',[key,label,platform]))[0].r;
const forDevice=async(id)=>(await q('select * from public.device_commands_for($1)',[id]));
const report=async(id,stage,reason=null)=>(await q('select public.device_command_report($1,$2,$3) r',[id,stage,reason]))[0].r;
const row=async(id)=>(await q('select * from public.device_commands where id=$1',[id]))[0];
const send=(device,kind,payload,extra={})=>env('send',{patch:{device_id:device,kind,payload,...extra}});
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
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.some(x=>x.endsWith('_n160_device_commands.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);

 // Registration is idempotent per device key and owner-only; browsers have no direct write.
 await as(owner);
 await assert.rejects(q("insert into public.app_devices(device_key,label,platform) values('abcdefgh1','x','web')"),/permission denied/);
 await assert.rejects(q("insert into public.device_commands(device_id,kind,payload,expires_at) values(gen_random_uuid(),'open','{}',now())"),/permission denied/);
 const phone=await register('phone-key-0001','Pixel','android');
 assert.equal((await register('phone-key-0001','Pixel','android')).id,phone.id);
 const laptop=await register('laptop-key-001','Laptop');
 assert.notEqual(laptop.id,phone.id);
 await as(other);
 const theirs=await register('phone-key-0001','Their phone');
 assert.notEqual(theirs.id,phone.id,'device keys are per owner');
 await as(owner);

 // Chat reads the devices, then sends. The MCP bridge reaches the same command.
 const devices=await (async()=>{await role('service_role');try{return (await q("select public.mcp_read($1::uuid,'devices','{}') r",[owner]))[0].r}finally{await role(null)}})();
 assert.deepEqual(devices.devices.map(d=>d.label).sort(),['Laptop','Pixel']);
 assert.ok(!JSON.stringify(devices).includes('Their phone'));
 const open=send(phone.id,'open',{screen:'review'});
 const sent=await viaMcp(owner,open);
 assert.equal(sent.status,'ok');assert.equal(sent.actionNo,null);
 assert.deepEqual(await viaMcp(owner,open),sent,'replay');
 assert.equal((await viaMcp(owner,{...open,patch:{...open.patch,payload:{screen:'today'}}})).status,'conflict');
 await role(null);
 assert.equal((await row(sent.command_id)).source,'claude');
 await as(owner);

 // Validation.
 const bad=async(payload,re)=>assert.rejects(run(payload),re);
 await bad(send(phone.id,'open',{screen:'secrets'}),/Unknown screen/);
 await bad(send(phone.id,'open',{}),/exactly one of screen or record/);
 await bad(send(phone.id,'open',{screen:'today',record:{type:'task',id:'11111111-1111-1111-1111-111111111111'}}),/exactly one/);
 await bad(send(phone.id,'open',{record:{type:'user',id:'11111111-1111-1111-1111-111111111111'}}),/record needs/);
 await bad(send(phone.id,'open',{record:{type:'task',id:'nope'}}),/record needs/);
 await bad(send(phone.id,'timer',{action:'format_disk'}),/timer action/);
 await bad(send(phone.id,'timer',{action:'pause',intent:'x'}),/intent is only for start/);
 await bad(send(phone.id,'shell',{}),/kind must be/);
 await bad(send(theirs.id,'open',{screen:'today'}),/Device not found/);
 await bad(send(phone.id,'open',{screen:'today'},{expires_in_minutes:60}),/1\.\.10/);
 await bad(env('send',{patch:{device_id:phone.id,kind:'open',payload:{screen:'today'},user_id:other}}),/Unknown device command patch field/);
 const record=await run(send(laptop.id,'open',{record:{type:'task',id:'22222222-2222-4222-8222-222222222222'}}));
 assert.equal(record.status,'ok');

 // The device fetches, reports delivered then applied; each stage is visible to the owner.
 await as(owner);
 const mine=await forDevice(phone.id);
 assert.deepEqual(mine.map(c=>c.id),[sent.command_id]);
 assert.equal((await forDevice(laptop.id)).length,1);
 assert.deepEqual((await report(sent.command_id,'delivered')),{status:'delivered',accepted:true});
 assert.equal((await forDevice(phone.id)).length,0,'a delivered command is not handed out twice');
 assert.deepEqual((await report(sent.command_id,'applied')),{status:'applied',accepted:true});
 const done=await row(sent.command_id);
 assert.equal(done.status,'applied');assert.ok(done.delivered_at&&done.applied_at);
 assert.deepEqual(await report(sent.command_id,'rejected','too late'),{status:'applied',accepted:false});
 await assert.rejects(report(sent.command_id,'done'),/stage must be/);
 await as(other);
 await assert.rejects(report(sent.command_id,'applied'),/not found/);
 assert.equal((await q('select count(*)::int n from public.device_commands'))[0].n,0);
 await as(owner);

 // A rejection carries its reason back to chat.
 const timer=await run(send(phone.id,'timer',{action:'pause'}));
 await report(timer.command_id,'delivered');
 await report(timer.command_id,'rejected','No timer is running');
 const rej=await row(timer.command_id);
 assert.equal(rej.status,'rejected');assert.equal(rej.reason,'No timer is running');

 // Commands expire and are never run late.
 const late=await run(send(phone.id,'open',{screen:'calendar'},{expires_in_minutes:1}));
 await role(null);
 await q("update public.device_commands set expires_at=now()-interval '1 second' where id=$1",[late.command_id]);
 await as(owner);
 assert.equal((await forDevice(phone.id)).length,0);
 assert.equal((await row(late.command_id)).status,'expired');
 assert.deepEqual(await report(late.command_id,'applied'),{status:'expired',accepted:false});

 // Cancel needs the current version; a stale one conflicts; a finished one cannot be cancelled.
 const waiting=await run(send(phone.id,'open',{screen:'tasks'}));
 assert.equal((await run(env('cancel',{target:{id:waiting.command_id},expectedVersion:9}))).status,'conflict');
 const cancelled=await run(env('cancel',{target:{id:waiting.command_id},expectedVersion:1}));
 assert.equal(cancelled.status,'ok');assert.equal((await row(waiting.command_id)).status,'cancelled');
 await assert.rejects(run(env('cancel',{target:{id:sent.command_id},expectedVersion:(await row(sent.command_id)).version})),/Only a waiting command/);
 assert.equal((await forDevice(phone.id)).length,0,'a cancelled command is not handed out');

 // At most 20 waiting commands per device.
 for(let i=0;i<19;i++)await run(send(laptop.id,'open',{screen:'today'}));
 await assert.rejects(run(send(laptop.id,'open',{screen:'today'})),/20 commands waiting/);
 console.log('N160 device commands: register, send, deliver, apply, reject, expire, cancel and owner boundary passed');
}finally{await db.close()}
