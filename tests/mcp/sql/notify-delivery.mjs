// N164.1: the reminder tick's database operations (owners, queue, claim, record). PGlite only.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const third='55555555-5555-5555-5555-555555555555';
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
const rows=(...items)=>JSON.stringify(items);
const item=(key,over={})=>({kind:'due',key,title:'34 cards due',body:'About 12 min. Start with 5?',url:'#/review',...over});
// The test role service_role has no BYPASSRLS (the platform's does), so read tables as the superuser.
const notifications=async user=>{await db.exec('reset role');return q('select id,kind,key,status,reason,sent_at is not null as sent,due_at<=now() as due from public.notifications where user_id=$1 order by id',[user]);};
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
 assert.ok(files.some(x=>x.endsWith('_n164_notify_delivery.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2),($3)',[owner,other,third]);
 for(const [user,secret] of [[owner,'1'.repeat(48)],[other,'2'.repeat(48)],[third,'3'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[user,secret]);
 const token='t'.repeat(40);

 // Owners: reminders on AND somewhere to deliver them.
 await db.exec('reset role');
 // The journal allows one owner per statement.
 for(const [user,enabled] of [[owner,true],[other,true],[third,false]])
  await q("update public.settings set notify=$2::jsonb where user_id=$1",[user,JSON.stringify({enabled})]);
 await q('insert into public.device_push_tokens(user_id,device_key,token) values($1,$2,$3)',[owner,'phone-key-0001',token]);
 await q('insert into public.device_push_tokens(user_id,device_key,token) values($1,$2,$3)',[third,'phone-key-0002','u'.repeat(40)]);
 await role('service_role');
 assert.deepEqual((await q('select * from public.notify_enabled_owners(10)')).map(x=>x.notify_enabled_owners),[owner],
  'enabled with a phone: listed; enabled without a device: not; a device but switched off: not');
 await db.exec('reset role');
 await q("insert into public.push_devices(user_id,endpoint,p256dh,auth,label,platform) values($1,'https://push.example/abc','AAAA','BBBB','Browser','desktop')",[other]);
 await role('service_role');
 assert.deepEqual((await q('select * from public.notify_enabled_owners(10)')).map(x=>x.notify_enabled_owners).sort(),[owner,other].sort(),'a browser counts');
 await as(owner);
 for(const call of ['select * from public.notify_enabled_owners(10)','select public.notify_queue($1,\'[]\')','select * from public.notify_claim($1,5)','select public.notify_record($1,1,\'no_device\')'])
  await assert.rejects(q(call,call.includes('$1')?[owner]:[]),/permission denied|Service role required/);

 // Queue: one row per (owner, key); a used key is not queued again; bad input is refused.
 await role('service_role');
 assert.equal((await q('select public.notify_queue($1,$2::jsonb) n',[owner,rows(item('due:2026-11-14'),item('tutor:2026-11-14T13:00:00Z',{kind:'tutor',title:'Claude left 4 proposals',url:'#/proposals'}))]))[0].n,2);
 assert.equal((await q('select public.notify_queue($1,$2::jsonb) n',[owner,rows(item('due:2026-11-14'),item('due:2026-11-15'))]))[0].n,1,'the used key is ignored');
 assert.equal((await q('select public.notify_queue($1,$2::jsonb) n',[other,rows(item('due:2026-11-14'))]))[0].n,1,'another owner has its own keys');
 await assert.rejects(q('select public.notify_queue($1,$2::jsonb)',[owner,JSON.stringify({kind:'due'})]),/array/);
 await assert.rejects(q('select public.notify_queue($1,$2::jsonb)',[owner,rows(item('bad',{kind:'nonsense'}))]),/check|violates/);
 await assert.rejects(q('select public.notify_queue($1,$2::jsonb)',[owner,rows(item('long',{title:'x'.repeat(49)}))]),/check|violates/);
 await assert.rejects(q('select public.notify_queue($1,$2::jsonb)',[owner,JSON.stringify(Array.from({length:51},(_,i)=>item('k'+i)))]),/at most 50/);
 let list=await notifications(owner);
 assert.deepEqual(list.map(x=>[x.key,x.status]),[['due:2026-11-14','queued'],['tutor:2026-11-14T13:00:00Z','queued'],['due:2026-11-15','queued']]);

 // Claim: due queued rows of one owner, leased while queued; never concurrently claimed twice; a test row queued elsewhere counts.
 await db.exec('reset role');
 await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at) values($1,'test','test:1','Reminders are on','Lemma will write at most 3 times a day.','#/settings',now()-interval '1 minute')",[owner]);
 await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at) values($1,'due','due:later','later','later','#/review',now()+interval '1 hour')",[owner]);
 await role('service_role');
 const first=await q('select * from public.notify_claim($1,2)',[owner]);
 assert.equal(first.length,2);
 assert.ok(first.every(x=>x.status==='queued'&&x.sent_at===null));
 const second=await q('select * from public.notify_claim($1,10)',[owner]);
 assert.equal(second.length,2,'the rest that are due: '+JSON.stringify(second.map(x=>x.key)));
 assert.deepEqual([...first,...second].map(x=>x.key).sort(),['due:2026-11-14','due:2026-11-15','test:1','tutor:2026-11-14T13:00:00Z'].sort());
 assert.equal((await q('select * from public.notify_claim($1,10)',[owner])).length,0,'a claimed row is never claimed again, and a future row waits');
 assert.equal((await q('select * from public.notify_claim($1,10)',[other])).length,1,'another owner is unaffected');
 list=await notifications(owner);
 assert.equal(list.find(x=>x.key==='due:later').status,'queued');

 // Record: a row nothing could deliver becomes failed, with a reason; only a claimed row can fail.
 await role('service_role');
 const target=first[0].id;
 await q("select public.notify_record($1,$2,'no_device')",[owner,target]);
 await assert.rejects(q("select public.notify_record($1,$2,'because')",[owner,target]),/Invalid delivery result/);
 await q("select public.notify_record($1,$2,'push_error')",[owner,second[0].id]);
 await q("select public.notify_record($1,$2,'push_error')",[other,second[1].id]); // another owner's id: nothing changes
 list=await notifications(owner);
 assert.deepEqual(list.find(x=>x.id===target),{id:target,kind:first[0].kind,key:first[0].key,status:'queued',reason:'no_device',sent:false,due:false});
 assert.equal(list.find(x=>x.id===second[0].id).reason,'push_error');
 assert.equal(list.find(x=>x.id===second[1].id).status,'queued','the wrong owner cannot change it');
 await role('service_role');await q("select public.notify_record($1,$2,'sent')",[owner,second[1].id]);
 const delivered=await notifications(owner);assert.equal(delivered.find(x=>x.id===second[1].id).status,'sent');assert.equal(delivered.find(x=>x.id===second[1].id).sent,true);
 console.log('PASS N164.1 owners, queue, claim and record');
}finally{await db.close()}
