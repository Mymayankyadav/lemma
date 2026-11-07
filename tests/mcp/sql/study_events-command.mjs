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
 console.log('PASS N50.2.1 authenticated envelopes, drift-only minutes and immutable stage');
}finally{await db.close()}
