// N43.1 owner practice storage: full additive migration PGlite regression.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111',other='99999999-9999-9999-9999-999999999999';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function as(uid){
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[uid]);
 await db.exec('set role authenticated');
}
async function admin(){await db.exec('reset role');await q("select set_config('test.uid','',false)");}
const rejects=async(sql,args=[])=>assert.rejects(q(sql,args),/check constraint|violates check|null value|not-null constraint/i);
try{
 await db.exec([
  'create role anon;create role authenticated;create role service_role;',
  'create schema auth;create schema extensions;create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert.ok(files.includes('20261107123000_v6_practice_topics_schema.sql'));
 // The full-migration test must cover BOTH stages: before N43.2 there must
 // be no write policies, journal triggers or undo registration; afterwards
 // command-driven writes must be journalled and registered.
 const lifecycle='20261107222020_practice_commands.sql';
 const activated=files.includes(lifecycle);
 const tables=['practice_topics','practice_events'];
 let checkedPreCommand=false;
 for(const f of files){
  await db.exec(await readFile(new URL(f,dir),'utf8'));
  if(f==='20261107123000_v6_practice_topics_schema.sql'){
   checkedPreCommand=true;
   for(const table of tables){
    const policies=await q('select cmd from pg_policies where tablename=$1',[table]);
    assert.deepEqual(policies.map(x=>x.cmd),['SELECT'],
     'N43.1 permits only owner SELECT before receipt-backed commands');
    assert.equal((await q('select count(*)::int n from public.lemma_undo_tables where table_name=$1',[table]))[0].n,0,
     'N43.1 must not register undo before commands exist');
    assert.equal((await q(
     "select count(*)::int n from pg_trigger where tgrelid=('public.'||$1)::regclass and tgname='lemma_log_change'",
     [table]))[0].n,0,'N43.1 must defer command journalling');
   }
   assert.deepEqual(await q(
    "select distinct table_name from public.action_changes where table_name in ('practice_topics','practice_events')"),
    [],'N43.1 has no practice journal entries before command activation');
  }
 }
 assert.ok(checkedPreCommand,'pre-command schema boundary must be exercised');
 for(const table of tables){
  const columns=(await q("select attname from pg_attribute where attrelid=('public.'||$1)::regclass and attnum>0 and not attisdropped",[table])).map(x=>x.attname).sort();
  const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/'+table+'.json',import.meta.url),'utf8'));
  assert.equal(doc.table,table);
  assert.deepEqual(Object.keys(doc.columns).sort(),columns,'exact registry coverage for '+table);
  assert.equal((await q("select relrowsecurity from pg_class where oid=('public.'||$1)::regclass",[table]))[0].relrowsecurity,true);
  const policies=await q("select cmd from pg_policies where tablename=$1",[table]);
  assert.deepEqual(policies.map(x=>x.cmd),['SELECT'],
   'only owner-scoped SELECT RLS is permitted before receipt-backed writes');
  assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name=$1",[table]))[0].n,
   activated?1:0,'undo registration must start only with the N43.2 command');
  assert.equal((await q(
   "select count(*)::int n from pg_trigger where tgrelid=('public.'||$1)::regclass and tgname='lemma_log_change'",
   [table]))[0].n,activated?1:0,
   'command activation must install the reversible journal trigger');
 }
 const constraints=await q("select conname,condeferrable from pg_constraint where conrelid in ('public.practice_topics'::regclass,'public.practice_events'::regclass) and contype='f'");
 for(const name of ['practice_topics_subject_owner_fk','practice_topics_concept_owner_fk','practice_topics_checkpoint_owner_fk','practice_events_topic_owner_fk'])
  assert.equal(constraints.filter(x=>x.conname===name&&x.condeferrable).length,1,name);

 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await as(owner);
 const subject=(await q("insert into public.subjects(name,glyph,hue) values('Analysis','∑','amber') returning id"))[0];
 const project=(await q("insert into public.projects(subject_id,slug,title,goal) values($1,'proof-work','Proof work','Practice proofs') returning id",[subject.id]))[0];
 const concept=(await q("insert into public.concepts(subject_id,slug,name) values($1,'limits','Limits') returning id",[subject.id]))[0];
 const checkpoint=(await q("insert into public.checkpoints(project_id,code,position,title,objective,criterion,steps) values($1,'CP1',1,'Proof','Understand','Show proof',jsonb_build_array('Read')) returning id",[project.id]))[0];
 // N43.1 has owner-read but no unjournaled authenticated DML. Privileged
 // fixtures exercise the schema; N43.2 later exposes receipt-backed writes.
 await db.exec('reset role');
 const topic=(await q("insert into public.practice_topics(title,subject_id,concept_id,checkpoint_id,next_due_date,cadence) values('Daily proofs',$1,$2,$3,'2026-11-10',$4::jsonb) returning *",
  [subject.id,concept.id,checkpoint.id,JSON.stringify({kind:'after_rating',daysByRating:[1,3,7,14]})]))[0];
 assert.equal(topic.user_id,owner);assert.equal(topic.version,1);
 assert.equal(new Date(topic.next_due_date).toISOString().slice(0,10),'2026-11-10');assert.equal(topic.last_practiced_at,null);
 assert.deepEqual(topic.cadence.daysByRating,[1,3,7,14]);
 const fixed=(await q("insert into public.practice_topics(title) values('Weekly drill') returning *"))[0];
 assert.deepEqual(fixed.cadence,{kind:'fixed_days',days:7});
 for(const bad of [
  {kind:'fixed_days',days:0},{kind:'fixed_days',days:3651},{kind:'fixed_days',days:1.5},
  {kind:'fixed_days',days:'7'},{kind:'fixed_days',days:7,extra:1},
  {kind:'after_rating',daysByRating:[1,2,3]},{kind:'after_rating',daysByRating:[1,2,3,0]},
  {kind:'after_rating',daysByRating:[1,2,3,3651]},
  {kind:'after_rating',daysByRating:[1,2,3,3.5]},
  {kind:'after_rating',daysByRating:['1',2,3,4]},
  {kind:'after_rating',daysByRating:[1,2,3,4],extra:true},{kind:'other',days:7},[],null
 ])await rejects('insert into public.practice_topics(title,cadence) values($1,$2::jsonb)',
  ['Invalid cadence',JSON.stringify(bad)]);
 await rejects("insert into public.practice_topics(title) values('')");
 await rejects("insert into public.practice_topics(title) values($1)",['x'.repeat(201)]);
 const event=(await q("insert into public.practice_events(topic_id,occurred_at,rating,response,minutes) values($1,'2026-11-07T10:00:00Z',4,'Completed proof',45) returning *",[topic.id]))[0];
 assert.equal(event.user_id,owner);assert.equal(event.version,1);assert.equal(event.voided_at,null);
 assert.equal(new Date((await q('select next_due_date from public.practice_topics where id=$1',[topic.id]))[0].next_due_date).toISOString().slice(0,10),
  '2026-11-10','N43.1 does not invent N43.2 due-date command');
 await rejects("insert into public.practice_topics(title,version) values('Invalid version',0)");
 await rejects("insert into public.practice_topics(title,source) values('Forged source','invalid')");
 await rejects('insert into public.practice_events(topic_id,occurred_at,rating,version) values($1,now(),2,0)',[topic.id]);
 await rejects("insert into public.practice_events(topic_id,occurred_at,rating,source) values($1,now(),2,'invalid')",[topic.id]);
 for(const rating of [0,5])await rejects("insert into public.practice_events(topic_id,occurred_at,rating) values($1,now(),$2)",[topic.id,rating]);
 for(const minutes of [-1,1441])await rejects("insert into public.practice_events(topic_id,occurred_at,rating,minutes) values($1,now(),2,$2)",[topic.id,minutes]);
 await rejects("insert into public.practice_events(topic_id,occurred_at,rating,response) values($1,now(),2,$2)",[topic.id,'x'.repeat(4001)]);
 await as(other);
 assert.equal((await q('select count(*)::int n from public.practice_topics'))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.practice_events'))[0].n,0);
 // A direct cross-owner UPDATE either affects no RLS-visible rows or is
 // refused by the table ACL: both forbid an unaudited write.
 try {
  assert.equal((await q('update public.practice_topics set title=$1 where id=$2 returning id',
   ['Foreign',topic.id])).length,0);
 } catch(e) {
  assert.match(String(e),/permission denied|row.level security/i);
 }
 await assert.rejects(q('insert into public.practice_events(user_id,topic_id,occurred_at,rating) values($1,$2,now(),2)',[owner,topic.id]),/row-level security|permission denied/i);
 await assert.rejects(q('insert into public.practice_events(topic_id,occurred_at,rating) values($1,now(),2)',[topic.id]),/row-level security|permission denied/i);
 const foreign=(await q("insert into public.subjects(name,glyph,hue) values('Geometry','△','violet') returning id"))[0];
 await as(owner);
 // No write policy: even own-row creation is forbidden before N43.2.
 // An owner must also be denied UPDATE and DELETE on their own records.
 // PostgreSQL can raise a privilege error or return zero policy-visible rows.
 const denied = async (statement,args=[])=>{
  try {assert.deepEqual(await q(statement,args),[],'unaudited owner DML must affect no rows');}
  catch(e){assert.match(String(e),/permission denied|row.level security/i);}
 };
 for(const [table,id,field] of [
  ['practice_topics',topic.id,'title'],
  ['practice_events',event.id,'response']
 ]){
  await denied('update public.'+table+' set '+field+'=$1 where id=$2 returning id',
   ['Unaudited mutation',id]);
  await denied('delete from public.'+table+' where id=$1 returning id',[id]);
 }
 assert.equal((await q('select title from public.practice_topics where id=$1',[topic.id]))[0].title,'Daily proofs');
 assert.equal((await q('select response from public.practice_events where id=$1',[event.id]))[0].response,'Completed proof');
 await assert.rejects(q("insert into public.practice_topics(title) values('Not yet writable')"),
  /row-level security|permission denied/i);
 await assert.rejects(q('insert into public.practice_events(topic_id,occurred_at,rating) values($1,now(),2)',[topic.id]),
  /row-level security|permission denied/i);
 // Privileged fixture still verifies the owner-composite FK on cross-owner links.
 await db.exec('reset role');
 await assert.rejects(q('insert into public.practice_topics(user_id,title,subject_id) values($1,$2,$3)',[owner,'Wrong owner',foreign.id]),/foreign key/i);
 await assert.rejects(q('insert into public.practice_events(user_id,topic_id,occurred_at,rating) values($1,$2,now(),2)',[other,topic.id]),/foreign key/i);
 await admin();
 // Even if an inherited default privilege permits SELECT, an anonymous
 // caller must never observe either table's owner-scoped records.
 await db.exec('set role anon');
 for(const table of tables){
  try {assert.deepEqual(await q('select id from public.'+table),[],
   'anonymous caller cannot read private practice records');}
  catch(e){assert.match(String(e),/permission denied|row.level security/i);}
 }
 await db.exec('reset role');
 const journal=await q("select distinct table_name from public.action_changes where table_name in ('practice_topics','practice_events')");
 if(activated){
  assert.deepEqual(journal.map(x=>x.table_name).sort(),tables.slice().sort(),
   'after N43.2, both practice resources journal privileged fixture writes');
  for(const [table,id] of [['practice_topics',topic.id],['practice_events',event.id]]){
   const changes=await q(
    "select c.op,a.user_id from public.action_changes c join public.actions a on a.no=c.action_no where c.table_name=$1 and c.row_pk->>'id'=$2",
    [table,id]);
   assert.ok(changes.some(c=>c.op==='insert'&&c.user_id===owner),
    'N43.2 must audit the correct owner and row on '+table);
  }
 }else{
  assert.deepEqual(journal,[],
   'N43.1 must defer journal registration until its inverse exists');
 }
 console.log('PASS N43.1 schema/owner isolation and stage-aware N43.2 audit/undo');
}finally{await db.close();}
