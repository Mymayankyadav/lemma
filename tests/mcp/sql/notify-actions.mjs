// N164: Web Push results and Settings' test reminder. PGlite only (no pg_net: the tick request is skipped).
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const role=async name=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await q("select set_config('request.jwt.claims','',false)");
 if(name)await db.exec('set role '+name);
};
const as=async id=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','',false)");
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid)
  $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  alter default privileges in schema public grant insert,update,delete,truncate on tables to anon,authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.some(x=>x.endsWith('_n164_notify_actions.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [user,secret] of [[owner,'1'.repeat(48)],[other,'2'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[user,secret]);

 // Web Push results.
 await db.exec('reset role');
 const device=async(user,n)=>(await q("insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,$2,'AAAA','BBBB','Browser','desktop') returning id",[user,'https://push.example/'+n]))[0].id;
 const a=await device(owner,'a'),b=await device(owner,'b'),c=await device(owner,'c');
 const state=async id=>{await db.exec('reset role');return (await q('select failures,disabled_reason,disabled_at is not null as disabled,last_ok_at is not null as ok from public.push_devices where id=$1',[id]))[0];};
 await role('service_role');
 await q("select public.notify_web_record($1,$2,'retry')",[owner,a]);
 await q("select public.notify_web_record($1,$2,'failed')",[owner,a]);
 assert.deepEqual(await state(a),{failures:2,disabled_reason:null,disabled:false,ok:false});
 await role('service_role');
 await q("select public.notify_web_record($1,$2,'sent')",[owner,a]);
 assert.deepEqual(await state(a),{failures:0,disabled_reason:null,disabled:false,ok:true},'a success clears the count');
 await role('service_role');
 for(let i=0;i<3;i++)await q("select public.notify_web_record($1,$2,'retry')",[owner,b]);
 assert.deepEqual(await state(b),{failures:3,disabled_reason:'failing',disabled:true,ok:false},'the third failure disables it');
 await role('service_role');
 await q("select public.notify_web_record($1,$2,'gone')",[owner,c]);
 assert.deepEqual(await state(c),{failures:0,disabled_reason:'gone',disabled:true,ok:false});
 await role('service_role');
 await q("select public.notify_web_record($1,$2,'gone')",[other,a]); // another owner's device id: nothing changes
 assert.equal((await state(a)).disabled,false);
 await role('service_role');
 await assert.rejects(q("select public.notify_web_record($1,$2,'because')",[owner,a]),/result must be/);
 await as(owner);
 await assert.rejects(q("select public.notify_web_record($1,$2,'sent')",[owner,a]),/permission denied|Service role required/);

 // The test reminder: the signed-in owner only, queued for now, once a minute, and claimed like any other row.
 await as(owner);
 const requested=(await q('select public.request_notify_test() r'))[0].r;
 assert.ok(Number.isSafeInteger(Number(requested.id)));
 await assert.rejects(q('select public.request_notify_test()'),/a moment ago/);
 await as(other);
 assert.ok((await q('select public.request_notify_test() r'))[0].r.id,'another owner has its own limit');
 await role('anon');
 await assert.rejects(q('select public.request_notify_test()'),/permission denied|Authenticated owner required/);
 await role('service_role');
 await assert.rejects(q('select public.request_notify_test()'),/permission denied|Authenticated owner required/);
 await role('service_role');
 const claimed=await q('select * from public.notify_claim($1,5)',[owner]);
 assert.equal(claimed.length,1);
 assert.deepEqual([claimed[0].kind,claimed[0].title,claimed[0].url,claimed[0].status],['test','Reminders are on','#/settings','sent']);
 assert.ok(claimed[0].body.length<=140);
 console.log('PASS N164 web results and the test reminder');
}finally{await db.close()}
