// N50.2.1 full-migration PGlite envelope validation (no live DB).
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,a=[])=>(await db.query(s,a)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const id='33333333-3333-4333-8333-333333333333';
let n=0;
const req=(operation,patch,extra={})=>({
 operationId:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(++n).padStart(12,'0'),
 schemaVersion:1,resource:'study_events',operation,patch,...extra
});
const call=async p=>(await q('select public.study_events_validate_envelope($1::jsonb) value',
 [JSON.stringify(p)]))[0].value;
const bad=(p,re)=>assert.rejects(call(p),re);
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key);");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select nullif(current_setting('test.uid',true),'')::uuid $auth$;");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(names.includes('20261107120117_study_events_envelope.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 const acl=(await q("select has_function_privilege('anon','public.study_events_validate_envelope(jsonb)','execute') anon,has_function_privilege('authenticated','public.study_events_validate_envelope(jsonb)','execute') member"))[0];
 assert.deepEqual(acl,{anon:false,member:true});
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const record=req('record',{entry_id:id,kind:'drift',duration_minutes:17,
  occurred_at:'2026-11-07T10:00:00Z',note:'Observed drift'});
 assert.deepEqual(await call(record),record);
 const notice=req('record',{entry_id:id,kind:'notice',note:null});
 assert.deepEqual(await call(notice),notice);
 const edit=req('edit',{note:'Reflection'},{target:{id},expectedVersion:1});
 assert.deepEqual(await call(edit),edit);
 const partial=req('edit',{duration_minutes:21},{target:{id},expectedVersion:2});
 assert.deepEqual(await call(partial),partial);
 for(const op of ['void','restore']){
  const v=req(op,{}, {target:{id},expectedVersion:2});
  assert.deepEqual(await call(v),v);
 }
 await bad({...record,user_id:owner},/Unknown command field/);
 await bad({...record,patch:{...record.patch,user_id:owner}},/Unknown event patch field/);
 await bad({...record,operation:'delete'},/Unsupported event operation/);
 await bad({...record,schemaVersion:2},/schemaVersion/);
 await bad({...record,operationId:'no-uuid'},/uuid/i);
 await bad({...record,target:{id:null}},/target.id must be a UUID/);
 await bad({...record,target:{id:''}},/target.id must be a UUID/);
 await bad({...record,target:{id:'bad'}},/uuid/i);
 await bad({...edit,target:{}},/target.id required/);
 await bad({...edit,expectedVersion:0},/positive integer/);
 await bad({...edit,expectedVersion:2147483648},/int4/);
 await bad({...edit,patch:{}},/edit patch must not be empty/);
 await bad({...record,patch:{kind:'drift'}},/record requires/);
 await bad({...record,patch:{entry_id:id}},/record requires/);
 await bad({...record,patch:{entry_id:id,kind:'oops'}},/Invalid event kind/);
 await bad({...record,patch:{entry_id:77,kind:'drift'}},/entry_id must be/);
 for(const value of [0,-1,1.5,'12']){
  await bad({...record,patch:{...record.patch,duration_minutes:value}},
   /duration_minutes must be/);
 }
 await bad({...record,patch:{...record.patch,duration_minutes:100001}},
  /duration_minutes exceeds/);
 await bad({...record,patch:{entry_id:id,kind:'notice',duration_minutes:10}},
  /Only drift/);
 await bad({...record,patch:{entry_id:id,kind:'urge',duration_minutes:10}},
  /Only drift/);
 await bad({...record,patch:{...record.patch,note:'x'.repeat(2001)}},/note must be/);
 await bad({...record,patch:{...record.patch,occurred_at:'2026-11-07T10:00:00'}},
  /timezone-aware ISO/);
 await bad({...edit,patch:{kind:'notice',duration_minutes:5}},/Only drift/);
 await bad({...edit,operation:'void',patch:{note:'forged'}},/Unknown event patch field/);
 await db.exec('set role anon');
 await bad(record,/permission denied|Authentication required/);
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from public.study_events'))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='study_events'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='study_events'"))[0].n,0);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='study_events'"))[0].n,0);
 // N50.2.2.1: retain all prior envelope/empty-registry assertions above,
 // then check owner-bound related links as privileged fixture writes.
 const other='22222222-2222-2222-2222-222222222222';
 const entry='44444444-4444-4444-4444-444444444444';
 const otherEntry='55555555-5555-5555-5555-555555555555';
 const task='66666666-6666-4666-8666-666666666666';
 const otherTask='77777777-7777-4777-8777-777777777777';
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Owner focus')",[entry,owner]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Other focus')",[otherEntry,other]);
 await q("insert into public.tasks(id,user_id,title) values($1,$2,'Owner task')",[task,owner]);
 await q("insert into public.tasks(id,user_id,title) values($1,$2,'Other task')",[otherTask,other]);
 const linked=(await q("insert into public.study_events(user_id,entry_id,kind,related_kind,related_id) values($1,$2,'notice','task',$3) returning *",[owner,entry,task]))[0];
 assert.equal(linked.related_kind,'task');assert.equal(linked.related_id,task);
 assert.equal(linked.version,1);
 const nowLinked=(await q("update public.study_events set related_kind='study_entry',related_id=$1 where id=$2 returning *",[entry,linked.id]))[0];
 assert.equal(nowLinked.related_id,entry);assert.equal(nowLinked.version,2);
 const denied=async(s,args=[])=>assert.rejects(q(s,args),/related|constraint|violates/i);
 await denied("update public.study_events set related_kind='task',related_id=$1 where id=$2",[otherTask,linked.id]);
 await denied("update public.study_events set related_kind='study_entry',related_id=$1 where id=$2",[otherEntry,linked.id]);
 await denied("update public.study_events set related_kind='calendar_block',related_id=$1 where id=$2",[task,linked.id]);
 await denied("update public.study_events set related_kind='not-a-kind',related_id=$1 where id=$2",[task,linked.id]);
 await denied("update public.study_events set related_kind='task',related_id=null where id=$1",[linked.id]);
 await denied("update public.study_events set related_kind=null,related_id=$1 where id=$2",[task,linked.id]);
 assert.equal((await q('select related_id from public.study_events where id=$1',[linked.id]))[0].related_id,entry,
   'failed changes must preserve original link and audit version');
 const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/study_events.json',import.meta.url),'utf8'));
 const cols=(await q("select attname from pg_attribute where attrelid='public.study_events'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname);
 assert.deepEqual(Object.keys(docs.columns).sort(),cols.sort(),'all related columns inventoried');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='study_events'"))[0].n,0,
   'no premature write routing in first related-link slice');
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='study_events'"))[0].n,0);

 console.log('PASS N50.2.1 and N50.2.2.1 authenticated envelopes, drift-only minutes and immutable stage');
}finally{await db.close()}
