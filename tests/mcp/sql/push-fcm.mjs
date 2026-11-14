// N163: the phone's FCM token and the push outbox. PGlite only (no pg_net, vault or pg_cron: the kick is skipped).
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
const token=char=>char.repeat(40);
const register=async(key,value,version='2.0.1')=>(await q('select public.register_push_token($1,$2,$3) r',[key,value,version]))[0].r;
let serial=0;
const cmd=async(op,id=null,version=null,patch=null)=>{
 const p={schemaVersion:1,resource:'study_entries',operation:op,
  operationId:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(++serial).padStart(12,'0'),
  ...(id?{target:{id}}:{}),...(version?{expectedVersion:version}:{}),
  patch:patch??(op==='create'?{source:'manual',intent:'Algebra'}:{})};
 return (await q('select public.study_command($1::jsonb) receipt',[JSON.stringify(p)]))[0].receipt;
};
// The test role service_role has no BYPASSRLS (the platform's does), so read the table as the superuser.
const outbox=async()=>{await db.exec('reset role');return q("select kind,entry_id,entry_version,attempts,sent_at,failed_at from public.push_outbox order by id");};
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
 assert.ok(files.some(x=>x.endsWith('_n163_fcm_timer.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [user,secret] of [[owner,'1'.repeat(48)],[other,'2'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[user,secret]);

 // Tokens: written only through the function, owner-scoped, one row per device.
 await as(owner);
 await assert.rejects(q("insert into public.device_push_tokens(device_key,token) values('abcdefgh1',$1)",[token('a')]),/permission denied/);
 await assert.rejects(register('phone-key-0001','x'.repeat(10)),/token must be/);
 await assert.rejects(register('k',token('x')),/device key must be/);
 assert.deepEqual(await register('phone-key-0001',token('a')),{registered:true});
 await register('phone-key-0001',token('b'),'2.0.2');
 let rows=await q('select device_key,token,app_version from public.device_push_tokens');
 assert.deepEqual(rows,[{device_key:'phone-key-0001',token:token('b'),app_version:'2.0.2'}],'a new token replaces the old one for the same device');
 await register('tablet-key-001',token('c'));
 assert.equal((await q('select count(*)::int n from public.device_push_tokens'))[0].n,2);
 await as(other);
 assert.equal((await q('select count(*)::int n from public.device_push_tokens'))[0].n,0,'another owner sees none');
 // The phone changed hands: the same token registered by another account leaves the first owner.
 await register('other-phone-01',token('b'));
 await as(owner);
 assert.deepEqual((await q('select device_key from public.device_push_tokens order by device_key')).map(x=>x.device_key),['tablet-key-001']);
 assert.deepEqual(await q("select public.unregister_push_token('tablet-key-001') r").then(x=>x[0].r),{removed:1});
 assert.equal((await q('select count(*)::int n from public.device_push_tokens'))[0].n,0);
 await role('anon');
 await assert.rejects(register('anon-key-0001',token('d')),/permission denied|Authenticated owner required/);
 await role('service_role');
 await assert.rejects(register('svc-key-00001',token('d')),/permission denied|Authenticated owner required/);

 // The outbox is not readable or writable by browsers.
 await as(owner);
 await assert.rejects(q("insert into public.push_outbox(user_id,kind) values($1,'timer')",[owner]),/permission denied/);
 // Reading it is refused (no grant) or shows nothing (RLS without a policy): never another owner's rows.
 const visible=await q('select count(*)::int n from public.push_outbox').then(x=>x[0].n,()=>0);
 assert.equal(visible,0);
 await assert.rejects(q('select * from public.push_claim(5)'),/permission denied|Service role required/);

 // Every change of a running or paused entry queues one row; a draft does not.
 const created=await cmd('create');
 assert.equal(created.status,'ok');
 const id=created.changed[0].id;
 await role('service_role');
 assert.equal((await outbox()).length,0,'a draft is not announced');
 await as(owner);
 let version=created.changed[0].version;
 const started=await cmd('start',id,version);
 assert.equal(started.status,'ok',JSON.stringify(started));
 version=started.changed[0].version;
 const paused=await cmd('pause',id,version);
 assert.equal(paused.status,'ok',JSON.stringify(paused));
 version=paused.changed[0].version;
 const resumed=await cmd('resume',id,version);
 assert.equal(resumed.status,'ok',JSON.stringify(resumed));
 version=resumed.changed[0].version;
 const saved=await cmd('save',id,version);
 assert.equal(saved.status,'ok',JSON.stringify(saved));
 await role('service_role');
 const queued=await outbox();
 assert.equal(queued.length,4,'start, pause, resume and save each queue one row: '+JSON.stringify(queued));
 assert.ok(queued.every(x=>x.kind==='timer'&&x.entry_id===id&&x.attempts===0&&x.sent_at===null&&x.failed_at===null));
 assert.deepEqual(queued.map(x=>x.entry_version),[...queued.map(x=>x.entry_version)].sort((a,b)=>a-b),'versions only go up');

 // Claiming: service role only, a batch at a time, each row tried at most three times, a claimed row waits two minutes.
 await role('service_role');
 const first=await q('select * from public.push_claim(3)');
 assert.equal(first.length,3);
 assert.ok(first.every(x=>x.attempts===1));
 const second=await q('select * from public.push_claim(10)');
 assert.equal(second.length,1,'only the unclaimed row is left');
 assert.equal((await q('select * from public.push_claim(10)')).length,0,'claimed rows are left alone for two minutes');
 await db.exec('reset role');
 await q("update public.push_outbox set claimed_at=now()-interval '3 minutes' where id=$1",[first[0].id]);
 await role('service_role');
 assert.equal((await q('select * from public.push_claim(10)')).length,1,'an unanswered claim is retried');
 await db.exec('reset role');
 await q("update public.push_outbox set attempts=3,claimed_at=now()-interval '3 minutes' where id=$1",[first[1].id]);
 await role('service_role');
 assert.equal((await q('select * from public.push_claim(10)')).length,0,'after three attempts a row is not claimed again');

 // The retry job gives up on rows older than ten minutes and forgets finished rows after a week.
 await db.exec('reset role');
 await q("update public.push_outbox set created_at=now()-interval '11 minutes' where id=$1",[first[1].id]);
 await q("update public.push_outbox set sent_at=now(),created_at=now()-interval '8 days' where id=$1",[first[0].id]);
 await q('select public.push_retry()');
 const left=await q('select id,failed_at,note from public.push_outbox order by id');
 assert.ok(!left.some(x=>x.id===first[0].id),'finished rows older than a week are pruned');
 assert.equal(left.find(x=>x.id===first[1].id).note,'too old');

 // A deleted running entry is announced too, and discarding a paused one.
 await db.exec('reset role');
 await q('delete from public.push_outbox');
 await as(owner);
 const c2=await cmd('create');
 const s2=await cmd('start',c2.changed[0].id,c2.changed[0].version);
 const d2=await cmd('discard',c2.changed[0].id,s2.changed[0].version);
 assert.equal(d2.status,'ok',JSON.stringify(d2));
 assert.equal((await outbox()).length,2,'start and discard');

 // A failure to queue never fails the study command (the trigger swallows it).
 await db.exec('alter table public.push_outbox rename to push_outbox_gone');
 await as(owner);
 const c3=await cmd('create');
 const s3=await cmd('start',c3.changed[0].id,c3.changed[0].version);
 assert.equal(s3.status,'ok','study commands do not depend on the outbox');
 console.log('PASS N163 push tokens, outbox, trigger, claim and retry');
}finally{await db.close()}
