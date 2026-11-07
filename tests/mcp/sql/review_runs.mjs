// N48.1 staged durable review-run schema: full-migration isolated PGlite.
// Production project and credentials are never accessed.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const reject=async(sql,args=[])=>assert.rejects(q(sql,args),
  /constraint|violates|permission denied|row.level security|Review receipt|not-null/i);
const noWrite=async(sql,args=[])=>{
  try {assert.deepEqual(await q(sql,args),[],'no unaudited authenticated DML');}
  catch(e){assert.match(String(e),/permission denied|row.level security/i);}
};
const as=async(uid)=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[uid]);
  await db.exec('set role authenticated');
};
try{
 await db.exec([
  'create role anon; create role authenticated; create role service_role;',
  'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const filename='20261107222000_review_runs_base.sql';
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.includes(filename),'N48.1 migration is present');
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 async function cardFor(uid,suffix){
  const s=(await q("insert into public.subjects(user_id,name,glyph,hue) values($1,$2,'☆','amber') returning id",
   [uid,'Review '+suffix]))[0].id;
  const p=(await q("insert into public.projects(user_id,subject_id,slug,title,goal) values($1,$2,$3,$4,'Review') returning id",
   [uid,s,'review-'+suffix,'Review '+suffix]))[0].id;
  const n=(await q("insert into public.notes(user_id,project_id,front,back) values($1,$2,'Q','A') returning id",
   [uid,p]))[0].id;
  return (await q('insert into public.cards(user_id,note_id,ord) values($1,$2,1) returning id',[uid,n]))[0].id;
 }
 const cardA=await cardFor(owner,'a'),cardB=await cardFor(other,'b');
 const runA=(await q("insert into public.review_runs(user_id,selected_deck_ids,card_budget,minute_budget,scheduler_version,settings_version) values($1,ARRAY['project:review-a','cp:review-a:CP1'],8,25,'fsrs-5',1) returning *",[owner]))[0];
 const runB=(await q("insert into public.review_runs(user_id,scheduler_version,settings_version) values($1,'fsrs-5',2) returning *",[other]))[0];
 assert.equal(runA.status,'running');assert.equal(runA.position,0);
 assert.deepEqual(runA.selected_deck_ids,['project:review-a','cp:review-a:CP1']);
 assert.equal(runA.revealed,false);assert.equal(runA.version,1);
 // Positive state transitions are representable at the storage boundary;
 // the future command is responsible for versioned, reversible writes.
 const paused=(await q("update public.review_runs set status='paused',paused_at=started_at where id=$1 returning status,paused_at",[runA.id]))[0];
 assert.equal(paused.status,'paused');assert.ok(paused.paused_at);
 const resumed=(await q("update public.review_runs set status='running',paused_at=null where id=$1 returning status,paused_at",[runA.id]))[0];
 assert.equal(resumed.status,'running');assert.equal(resumed.paused_at,null);
 assert.ok(runA.started_at&&runA.created_at&&runA.updated_at);
 const item=(await q("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version) values($1,$2,0,$3,1) returning *",[owner,runA.id,cardA]))[0];
 assert.equal(item.state,'pending');assert.equal(item.review_id,null);
 await reject("insert into public.review_runs(user_id,filters,scheduler_version,settings_version) values($1,'[]'::jsonb,'fsrs-5',1)",[owner]);
 // N62.1 draft validation must agree with the database for all privileged writers.
 await reject("insert into public.review_runs(user_id,selected_deck_ids,scheduler_version,settings_version) values($1,ARRAY['project:proof','project:proof'],'fsrs-5',1)",[owner]);
 await reject("update public.review_runs set selected_deck_ids=ARRAY['project:proof','project:proof'] where id=$1",[runA.id]);
 const safeFilters={study:{statuses:['running',{category:'proof'}]},limit:20};
 const safeRun=(await q("insert into public.review_runs(user_id,filters,scheduler_version,settings_version) values($1,$2::jsonb,'fsrs-5',1) returning id,filters",[owner,JSON.stringify(safeFilters)]))[0];
 assert.deepEqual(safeRun.filters,safeFilters,'nested, owner-neutral JSON remains valid');
 const invalidFilters=[
  {ownerId:'forged-owner'},
  {safe:{ownerId:'forged-owner'}},
  {nested:[{user_id:'forged-owner'}]},
  {userId:'forged-owner'},{owner:'forged-owner'},{owner_id:'forged-owner'},
  {p_user:'forged-owner'},JSON.parse('{"__proto__":true}'),
  {safe:{constructor:'forged'}},{safe:[{prototype:'forged'}]},
 ];
 for(const filters of invalidFilters){
  await reject("insert into public.review_runs(user_id,filters,scheduler_version,settings_version) values($1,$2::jsonb,'fsrs-5',1)",[owner,JSON.stringify(filters)]);
  await reject("update public.review_runs set filters=$2::jsonb where id=$1",[runA.id,JSON.stringify(filters)]);
 }
 let tooDeep={ok:true}; for(let i=0;i<13;i++)tooDeep={nested:tooDeep};
 await reject("insert into public.review_runs(user_id,filters,scheduler_version,settings_version) values($1,$2::jsonb,'fsrs-5',1)",[owner,JSON.stringify(tooDeep)]);
 await reject("insert into public.review_runs(user_id,selected_deck_ids,scheduler_version,settings_version) values($1,ARRAY[''], 'fsrs-5',1)",[owner]);
 await reject("insert into public.review_runs(user_id,selected_deck_ids,scheduler_version,settings_version) values($1,ARRAY['  '], 'fsrs-5',1)",[owner]);
 await reject("insert into public.review_runs(user_id,selected_deck_ids,scheduler_version,settings_version) values($1,ARRAY[repeat('x',181)], 'fsrs-5',1)",[owner]);
 await reject("insert into public.review_runs(user_id,selected_deck_ids,scheduler_version,settings_version) values($1,ARRAY[NULL]::text[], 'fsrs-5',1)",[owner]);
 for(const [field,value] of [['card_budget',-1],['minute_budget',1441],['position',-1]]){
  await reject("insert into public.review_runs(user_id,scheduler_version,settings_version,"+field+") values($1,'fsrs-5',1,$2)",[owner,value]);
 }
 await reject("insert into public.review_runs(user_id,scheduler_version,settings_version) values($1,'fsrs-5',0)",[owner]);
 await reject("insert into public.review_runs(user_id,scheduler_version,settings_version,status) values($1,'fsrs-5',1,'paused')",[owner]);
 await reject("insert into public.review_runs(user_id,scheduler_version,settings_version,status) values($1,'fsrs-5',1,'completed')",[owner]);
 await reject("insert into public.review_runs(user_id,scheduler_version,settings_version,ended_at) values($1,'fsrs-5',1,now())",[owner]);
 await reject('insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version) values($1,$2,0,$3,1)',[owner,runA.id,cardA]);
 await reject('insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version) values($1,$2,1,$3,1)',[owner,runB.id,cardA]);
 await reject('insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version) values($1,$2,1,$3,1)',[owner,runA.id,cardB]);
 await reject("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state) values($1,$2,1,$3,1,'graded')",[owner,runA.id,cardA]);
 await reject("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state) values($1,$2,1,$3,1,'stale')",[owner,runA.id,cardA]);
 const reviewB=(await q("insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) values($1,$2,3,0,1200,'{}'::jsonb) returning id",[other,cardB]))[0].id;
 await reject("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state,review_id) values($1,$2,1,$3,1,'graded',$4)",[owner,runA.id,cardA,reviewB]);
 const reviewA=(await q("insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) values($1,$2,4,0,500,'{}'::jsonb) returning id",[owner,cardA]))[0].id;
 await reject("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state,review_id) values($1,$2,4,$3,1,'pending',$4)",[owner,runA.id,cardA,reviewA]);
 await reject("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state,stale_reason,review_id) values($1,$2,5,$3,1,'stale','Stale card',$4)",[owner,runA.id,cardA,reviewA]);
 await reject("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state,stale_reason) values($1,$2,6,$3,1,'pending','Invalid stale marker')",[owner,runA.id,cardA]);
 const graded=(await q("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state,review_id) values($1,$2,1,$3,1,'graded',$4) returning *",[owner,runA.id,cardA,reviewA]))[0];
 assert.equal(graded.review_id,reviewA);assert.equal(graded.state,'graded');
 const stale=(await q("insert into public.review_run_items(user_id,run_id,position,card_id,expected_card_version,state,stale_reason) values($1,$2,2,$3,1,'stale','Card version changed') returning *",[owner,runA.id,cardA]))[0];
 assert.equal(stale.state,'stale');
 for(const table of ['review_runs','review_run_items']){
  assert.equal((await q("select relrowsecurity from pg_class where oid=('public.'||$1)::regclass",[table]))[0].relrowsecurity,true);
  const policy=await q('select cmd from pg_policies where tablename=$1',[table]);
  assert.deepEqual(policy.map(x=>x.cmd),['SELECT'],'schema is read-only until command exists');
  const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/'+table+'.json',import.meta.url),'utf8'));
  const cols=(await q("select attname from pg_attribute where attrelid=('public.'||$1)::regclass and attnum>0 and not attisdropped",[table])).map(x=>x.attname).sort();
  assert.deepEqual(Object.keys(doc.columns).sort(),cols,'exact capability registry coverage');
  assert.equal((await q('select count(*)::int n from public.lemma_undo_tables where table_name=$1',[table]))[0].n,0);
 }
 await as(owner);
 const rows=await q('select id from public.review_runs order by id');
 assert.deepEqual(rows.map(x=>x.id),[runA.id,safeRun.id].sort(),
  'owner sees both the original run and the valid nested-filter run');
 const listed=await q('select id from public.review_run_items order by position');
 assert.deepEqual(listed.map(x=>x.id),[item.id,graded.id,stale.id]);
 for(const table of ['review_runs','review_run_items']){
  const id=table==='review_runs'?runA.id:item.id;
  await noWrite('update public.'+table+' set version=999 where id=$1 returning id',[id]);
  await noWrite('delete from public.'+table+' where id=$1 returning id',[id]);
 }
 await reject("insert into public.review_runs(scheduler_version,settings_version) values('fsrs-5',1)");
 await reject("insert into public.review_run_items(run_id,position,card_id,expected_card_version) values($1,3,$2,1)",[runA.id,cardA]);
 await as(other);
 assert.deepEqual((await q('select id from public.review_runs')).map(x=>x.id),[runB.id],
  'a second owner sees only their own run');
 assert.deepEqual(await q('select id from public.review_run_items'),[],
  'a second owner cannot read another owner\'s queued cards');
 await db.exec('reset role');
 await db.exec('set role anon');
 for(const table of ['review_runs','review_run_items']){
  try {assert.deepEqual(await q('select id from public.'+table),[],
    'anonymous users cannot read durable review data');}
  catch(e){assert.match(String(e),/permission denied|row.level security/i);}
 }
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from public.review_runs where id=$1',[runA.id]))[0].n,1);
 assert.equal((await q('select count(*)::int n from public.review_run_items where id=$1',[item.id]))[0].n,1);
 const registered=(await q("select count(*)::int n from public.lemma_command_resources where resource='review_runs'"))[0].n;
 assert.equal(registered,0,'N48.2 registers only after command is implemented');
 const journal=await q("select table_name from public.action_changes where table_name in ('review_runs','review_run_items')");
 assert.deepEqual(journal,[],'staged records are not prematurely journalled');
 console.log('PASS N48.1 durable review run storage, card/review links, owner RLS and immutable staging');
}finally{await db.close();}
