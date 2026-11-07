// N43.2.1: full-migration PGlite command-envelope validation, no writes.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const topic='33333333-3333-4333-8333-333333333333';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const input={operationId:'11111111-1111-4111-8111-111111111111',
 schemaVersion:1,resource:'practice_topics',operation:'create',
 patch:{title:'Practice proofs',cadence:{kind:'after_rating',daysByRating:[1,3,7,14]},
  next_due_date:'2026-11-10',subject_id:null}};
const call=async p=>(await q('select public.practice_topics_validate_envelope($1::jsonb) value',
 [JSON.stringify(p)]))[0].value;
try{
 await db.exec([
  'create role anon;create role authenticated;create role service_role;',
  'create schema auth;create schema extensions;create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid() to authenticated;',
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261107123010_practice_topics_envelope.sql'));
 for(const name of migrations)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1)',[owner]);
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 assert.deepEqual(await call(input),input);
 const supplied={...input,target:{id:topic}};
 assert.deepEqual(await call(supplied),supplied);
 for(const bad of [
  {...input,target:{id:'bogus'}},{...input,target:{id:null}},
  {...input,user_id:owner},{...input,source:'mcp'},
  {...input,patch:{...input.patch,user_id:owner}},
  {...input,patch:{...input.patch,version:2}},
  {...input,patch:{...input.patch,title:'  '}},
  {...input,patch:{...input.patch,title:'x'.repeat(201)}},
  {...input,patch:{...input.patch,cadence:{kind:'fixed_days',days:0}}},
  {...input,patch:{...input.patch,cadence:{kind:'after_rating',daysByRating:[1,2,3]}}},
  {...input,patch:{...input.patch,next_due_date:'2026-02-30'}},
  {...input,patch:{...input.patch,concept_id:'bogus'}},
  {...input,patch:{}},{...input,schemaVersion:2},
  {...input,operationId:'not-a-uuid'},{...input,expectedVersion:1},
  {...input,operation:'void'},
 ])await assert.rejects(call(bad),'invalid create envelope rejected');
 const edit={...input,operation:'update',target:{id:topic},expectedVersion:2,
  patch:{title:'Updated proof',next_due_date:null}};
 assert.deepEqual(await call(edit),edit);
 for(const bad of [
  {...edit,patch:{}},{...edit,expectedVersion:0},
  {...edit,expectedVersion:2147483648},{...edit,target:{}},
  {...edit,patch:{owner:owner}},{...edit,patch:{cadence:null}},
 ])await assert.rejects(call(bad),'invalid update envelope rejected');
 for(const operation of ['archive','restore','delete']){
  const envelope={...edit,operation,patch:{}};
  assert.deepEqual(await call(envelope),envelope);
  await assert.rejects(call({...envelope,patch:{title:'forged'}}));
 }
 const record={...edit,operation:'record',patch:{
  rating:4,occurred_at:'2026-11-07T13:30:00+05:30',minutes:0,response:'Good proof'}};
 assert.deepEqual(await call(record),record);
 const noInstant={...record,patch:{rating:1}};
 assert.deepEqual(await call(noInstant),noInstant,'server clock may supply occurred_at');
 for(const bad of [
  {...record,patch:{}},{...record,patch:{rating:0}},
  {...record,patch:{rating:5}},{...record,patch:{rating:2.5}},
  {...record,patch:{rating:'3'}},
  {...record,patch:{rating:1,response:'x'.repeat(4001)}},
  {...record,patch:{rating:1,minutes:-1}},
  {...record,patch:{rating:1,minutes:1441}},
  {...record,patch:{rating:1,minutes:1.5}},
  {...record,patch:{rating:1,occurred_at:'2026-11-07T08:00:00'}},
  {...record,patch:{rating:1,occurred_at:'infinity'}},
  {...record,patch:{rating:1,occurred_at:'2026-11-07T08:00:00+15:00'}},
  {...record,patch:{rating:1,occurred_at:'2026-02-30T08:00:00Z'}},
  {...record,patch:{rating:1,topic_id:topic}},
 ])await assert.rejects(call(bad),'invalid record envelope rejected');
 const voidEvent={...edit,operation:'void_event',patch:{}};
 assert.deepEqual(await call(voidEvent),voidEvent);
 await assert.rejects(call({...voidEvent,patch:{rating:1}}));
 await db.exec('reset role');
 for(const table of ['practice_topics','practice_events']){
  const policies=await q('select cmd from pg_policies where tablename=$1',[table]);
  assert.deepEqual(policies.map(x=>x.cmd),['SELECT'],'no unaudited writes');
  assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name=$1",[table]))[0].n,0);
  assert.equal((await q("select count(*)::int n from public.action_changes where table_name=$1",[table]))[0].n,0);
 }
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='practice_topics'"))[0].n,0,
  'validation must precede command and undo activation');
 await db.exec('set role anon');
 await assert.rejects(call(input),/permission denied|Authentication required/);
 // N43.2.2.1: exactly one finite 1–3650-day delay per 1–4 rating.
 // The actual record transaction must choose the base civil day and keep
 // a reversible due/last-practiced snapshot; this helper makes no writes.
 await db.exec('reset role');
 const cadenceDays=async(c,r)=>(await q(
  'select public.lemma_practice_cadence_days($1::jsonb,$2::integer) n',
  [JSON.stringify(c),r]))[0].n;
 for(const day of [1,7,3650]){
  const fixed={kind:'fixed_days',days:day};
  for(const rating of [1,2,3,4])
   assert.equal(await cadenceDays(fixed,rating),day,
    'fixed delay independent of rating');
 }
 const perRating={kind:'after_rating',daysByRating:[1,3,7,14]};
 for(let rating=1;rating<=4;rating++)
  assert.equal(await cadenceDays(perRating,rating),perRating.daysByRating[rating-1],
   'rating chooses zero-based cadence element');
 for(const cadence of [
  {kind:'fixed_days',days:0},{kind:'fixed_days',days:3651},
  {kind:'fixed_days',days:1.5},{kind:'after_rating',daysByRating:[1,2,3]},
  {kind:'after_rating',daysByRating:[1,2,3,0]},
  {kind:'after_rating',daysByRating:[1,2,3,4],extra:true},
  {kind:'unknown',days:7},null,
 ])await assert.rejects(cadenceDays(cadence,2),/Invalid practice cadence/);
 for(const rating of [0,5,null])
  await assert.rejects(cadenceDays(perRating,rating),/Practice rating/);
 const grants=await q("select has_function_privilege('anon','public.lemma_practice_cadence_days(jsonb,integer)','EXECUTE') anon,has_function_privilege('authenticated','public.lemma_practice_cadence_days(jsonb,integer)','EXECUTE') authenticated");
 assert.deepEqual(grants[0],{anon:false,authenticated:true},
  'delay helper is not accessible to anonymous callers');

 console.log('PASS N43.2.1 practice topic/event envelope, owner auth and read-only stage');
}finally{await db.close()}
