// N195 must install before N191 without changing the existing review API or data.
// Exercise the actual old queue, upgrade the same database, and compare results.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=async(sql,args=[])=>(await q(sql,args))[0];
const owner=randomUUID(),other=randomUUID();
const auth=async uid=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[uid]);
 await db.exec('set role authenticated');
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(name=>name.endsWith('.sql')&&!name.includes('_storage')).sort();
 const feature=migrations.filter(name=>name.includes('_n195_'));
 assert.equal(feature.length,2,'both N195 production migrations must be exercised');
 for(const name of migrations.filter(name=>!name.includes('_n195_')))
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 for(const [uid,secret] of [[owner,'a'],[other,'b']]){
  await q('insert into auth.users(id) values($1)',[uid]);
  await q('insert into public.settings(user_id,connector_secret,new_per_day,reviews_per_day) values($1,$2,3,6)',[uid,secret.repeat(48)]);
 }
 const paths=[];
 for(const [index,uid] of [owner,owner,owner,other].entries()){
  const subject=await one("insert into public.subjects(user_id,name,glyph,hue) values($1,$2,'A','amber') returning id",[uid,'Subject '+index]);
  const project=await one("insert into public.projects(user_id,subject_id,slug,title,goal,status) values($1,$2,$3,$4,'Review','active') returning id,slug",[uid,subject.id,'path-'+index,'Path '+index]);
  const checkpoint=await one("insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,'CP1',1,'Checkpoint','Recall','Explain','[\"Explain\"]') returning id",[uid,project.id]);
  const concept=await one("insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,'shared-name','Concept') returning id",[uid,subject.id]);
  const session=await one("insert into public.sessions(user_id,project_id,number,goal,style) values($1,$2,1,'Recall','socratic') returning id",[uid,project.id]);
  const cards=[];
  for(const [position,state] of [0,0,1,2,3,2].entries()){
   const note=await one("insert into public.notes(user_id,project_id,checkpoint_id,concept_id,session_id,front,back) values($1,$2,$3,$4,$5,$6,'Answer') returning id",[uid,project.id,checkpoint.id,concept.id,session.id,'Question '+position]);
   cards.push((await one("insert into public.cards(user_id,note_id,ord,state,due) values($1,$2,1,$3,now()+$4::interval) returning id",[uid,note.id,state,position===5?'90 days':'-1 day'])).id);
   if(position===0)await q("insert into public.cards(user_id,note_id,ord,state,due) values($1,$2,2,2,now()-interval '2 days')",[uid,note.id]);
   if(position===1&&index===1)await q("update public.notes set status='suspended' where id=$1",[note.id]);
  }
  if(index===2)await q("update public.projects set status='archived' where id=$1",[project.id]);
  paths.push({...project,checkpoint:checkpoint.id,session:session.id,cards});
 }
 await q("insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) values($1,$2,3,0,500,'{}')",[owner,paths[0].cards[0]]);
 const args=[
  [[],null,null,true,false],
  [['project:path-0'],null,null,true,false],
  [['cp:path-1:CP1'],null,null,true,false],
  [[],paths[0].session,null,true,false],
  [[],null,'shared-name',true,false],
  [[],null,null,false,false],
  [[],null,null,true,true],
  [[],null,null,null,null],
  [['project:path-2'],null,null,true,false],
 ];
 const queue=async()=>{
  const results=[];
  for(const params of args)results.push(await q('select public.review_items($1,$2,$3,$4,$5) item',params));
  return results;
 };
 const signature=()=>one(`select proargtypes::text,proargnames,pronargdefaults,
  pg_get_expr(proargdefaults,0) as defaults,prorettype::text,proretset,prosecdef,provolatile,proconfig,proacl::text
  from pg_proc where oid='public.review_items(text[],uuid,text,boolean,boolean)'::regprocedure`);
 const saved=async()=>{
  const snapshot={};
  for(const table of ['projects','notes','cards','reviews','review_runs','review_run_items','command_receipts'])
   snapshot[table]=(await q('select to_jsonb(t) row from public.'+table+' t order by to_jsonb(t)::text')).map(row=>row.row);
  return snapshot;
 };
 const beforeSignature=await signature(),beforeData=await saved();
 await auth(owner);
 const before=await queue();
 assert.ok(before[0].length>0,'legacy comparison must have a nonempty due queue');
 assert.equal(before[0].length,5,'existing daily review quota accounts for the saved review');
 assert.equal(before[6].length,2,'existing new-card quota accounts for the saved new-card review');
 assert.deepEqual(before[8],[],'archived path is excluded');
 await auth(other);
 const beforeOther=await queue();
 await db.exec('reset role');
 for(const name of feature)await db.exec(await readFile(new URL(name,dir),'utf8'));
 assert.deepEqual(await signature(),beforeSignature,'review_items retains exact arguments, defaults, return type, security and grants');
 assert.deepEqual(await saved(),beforeData,'upgrade must not rewrite existing rows, cards, schedules, runs or receipts');
 await auth(owner);
 assert.deepEqual(await queue(),before,'legacy filter, quota, variant, ordering and payload behavior survives upgrade');
 assert.equal((await one('select public.lemma_study_ui_released() released')).released,false);
 const noWrites=async()=>{
  await assert.rejects(q('select public.create_first_study_card($1,$2,$3,$4,$5)',[randomUUID(),owner,JSON.stringify({kind:'new',title:'Unavailable'}),'Question','Answer']),{code:'55000'});
  await assert.rejects(q('select public.start_study_target($1,$2,$3)',[randomUUID(),'path',paths[0].id]),{code:'55000'});
  await assert.rejects(q('select public.set_study_weekday_minutes($1,$2,$3,$4)',[randomUUID(),owner,null,[30,30,30,30,30,30,30]]),{code:'55000'});
  assert.equal((await one('select public.study_target_due_count($1,$2) n',['path',paths[0].id])).n,0);
  assert.equal((await one('select public.next_study_due() due')).due,null);
 };
 await noWrites();
 await auth(other);
 assert.deepEqual(await queue(),beforeOther,'other owner retains its own legacy queue and never sees the first owner');
 await db.exec('reset role');
 assert.deepEqual(await saved(),beforeData,'blocked calls do not write data or create receipts');
 // Installing only the shared switch must not activate writes without receipts.
 await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select true'");
 await auth(owner);
 assert.equal((await one('select public.lemma_study_ui_released() released')).released,false);
 await noWrites();
 assert.deepEqual(await queue(),before,'a partially installed dependency cannot alter the old queue');
 console.log('PASS N195 upgrade: legacy signature, grants, ordered queues and data preserved; absent/partial foundation fails closed');
}finally{await db.close();}
