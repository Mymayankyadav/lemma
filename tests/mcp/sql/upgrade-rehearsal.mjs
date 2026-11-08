// N97: pre-v6 account -> every migration -> legacy/new export and reversible writes.
// Offline PGlite only: never reaches a Supabase project or changes production data.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111';
const project='33333333-3333-4333-8333-333333333333';
const note='88888888-8888-4888-8888-888888888888';
const cut='20261105141000_v6_study.sql';
const dir=new URL('../../../supabase/migrations/',import.meta.url);
const fixture=new URL('./fixtures/pre-v6-account.sql',import.meta.url);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const as=async id=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
const take=async()=>{
 // Only pre-v6 fields are compared. New additive columns are allowed.
 // Each snapshot includes links and scheduling, not only row counts.
 const selections={
  subjects:['id,user_id,name,glyph,hue','id'],
  projects:['id,user_id,subject_id,slug,title,goal,status,next_session_number','id'],
  concepts:['id,user_id,subject_id,slug,name','id'],
  concept_links:['user_id,from_id,to_id,kind','from_id,to_id'],
  sources:['id,user_id,project_id,title,short,status,page_count','id'],
  source_pages:['user_id,source_id,page,label,body','source_id,page'],
  checkpoints:['id,user_id,project_id,code,position,title,objective,criterion,steps,source_id,status,current_step,demonstrated_at,recheck_due','id'],
  checkpoint_prereqs:['user_id,checkpoint_id,prereq_id','checkpoint_id,prereq_id'],
  checkpoint_concepts:['user_id,checkpoint_id,concept_id','checkpoint_id,concept_id'],
  sessions:['id,user_id,project_id,number,goal,style,checkpoint_id,state,minutes,started_at,ended_at','id'],
  session_events:['id,user_id,session_id,checkpoint_id,kind,body,outcome','id'],
  notes:['id,user_id,project_id,checkpoint_id,session_id,concept_id,source_id,front,back,kind,page_label','id'],
  cards:['id,user_id,note_id,ord,state,due,stability,difficulty,last_review,reps,lapses','id'],
  reviews:['id,user_id,card_id,reviewed_at,rating,state_before,confidence,duration_ms,prev,undone_at','id'],
  proposals:['id,user_id,project_id,session_id,kind,payload,origin,status','id'],
 };
 const result={};
 for(const [table,[fields,order]] of Object.entries(selections)){
  result[table]=await q('select '+fields+' from public.'+table+' order by '+order);
  assert.ok(result[table].length>0,'fixture must actually cover '+table);
 }
 return result;
};
const command=async(functionName,payload)=>(await q(
 'select public.'+functionName+'($1::jsonb) result',[JSON.stringify(payload)]
))[0].result;
const undo=async no=>(await q('select public.undo_action($1::uuid,$2::bigint,false) result',[owner,no]))[0].result;
const exportPage=async table=>(await q(
 'select public.lemma_export_page($1::text,null,100) result',[table]
))[0].result;
const requireOk=(reply,label)=>{
 assert.equal(reply?.status,'ok',label);
 assert.ok(Number.isSafeInteger(reply.actionNo)&&reply.actionNo>0,label+' must journal an undoable action');
 assert.ok(reply.changed?.length>0,label+' must return the changed row');
 return reply;
};
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
  "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
  "create function auth.uid() returns uuid language sql as $auth$ "+
  "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,"+
  "nullif(current_setting('test.uid',true),'')::uuid) $auth$;"+
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$"+
  "select decode(repeat('00',n),'hex') $bytes$;"+
  "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const migrations=(await readdir(dir)).filter(name=>name.endsWith('.sql')&&!name.includes('_storage')).sort();
 const boundary=migrations.indexOf(cut);
 assert.ok(boundary>0,'N10 pre-v6 migration boundary is present');
 for(const name of migrations.slice(0,boundary))
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 await db.exec(await readFile(fixture,'utf8'));
 const before=await take();
 assert.equal(before.concepts.length,2);
 assert.equal(before.checkpoints.length,2);
 assert.equal(before.source_pages.length,2);
 assert.equal(before.reviews.length,1);
 for(const name of migrations.slice(boundary))
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 assert.deepEqual(await take(),before,
  'applying every v6 and later migration must not rewrite old rows, links, history or schedules');
 assert.equal((await q('select count(*)::int n from public.study_entries'))[0].n,0,
  'legacy session minutes must not be silently converted to measured study intervals');
 assert.equal((await q('select count(*)::int n from public.study_intervals'))[0].n,0);
 assert.equal(before.sessions[0].minutes,42,
  'historical session effort remains a legacy estimate, not newly measured time');
 const legacyReview=(await q('select scheduler_version,params_id from public.reviews'))[0];
 assert.equal(legacyReview.params_id,null,
  'unknown historical FSRS parameters must not be filled from current defaults');
 assert.equal(legacyReview.scheduler_version,null,
  'historical scheduler provenance must remain unknown');
 console.log('PASS N97 complete upgrade preserves legacy paths, evidence, sources, history and review schedules');

 await as(owner);
 const legacyTables=['projects','sources','source_pages','sessions','notes','cards','reviews','proposals'];
 for(const table of legacyTables){
  const page=await exportPage(table);
  assert.ok(page.rows.length>0,'old '+table+' must be owner-exportable after upgrade');
  assert.ok(page.rows.every(row=>row.user_id===owner));
 }
 const beforeAction=Number((await q(
  'select coalesce(max(no),0)::int n from public.actions where user_id=$1',[owner]))[0].n);
 await q("update public.notes set front='Revised old question' where id=$1",[note]);
 assert.equal((await q('select front from public.notes where id=$1',[note]))[0].front,
  'Revised old question');
 const oldAction=Number((await q(
  'select max(no)::int n from public.actions where user_id=$1',[owner]))[0].n);
 assert.ok(oldAction>beforeAction,'post-upgrade edit to legacy record is audited');
 assert.equal(Number((await undo(oldAction)).undone),oldAction);
 assert.equal((await q('select front from public.notes where id=$1',[note]))[0].front,
  before.notes[0].front,'undo restores historical note content');
 assert.equal((await exportPage('notes')).rows[0].front,before.notes[0].front);
 console.log('PASS N97 owner export and undo of a post-upgrade legacy edit');

 const entry=requireOk(await command('study_command',{
  schemaVersion:1,operationId:'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
  resource:'study_entries',operation:'create',
  patch:{source:'manual',intent:'Prove continuity'}
 }),'new study entry');
 const entryId=entry.changed[0].id;
 const task=requireOk(await command('task_command',{
  schemaVersion:1,operationId:'dddddddd-dddd-4ddd-8ddd-dddddddddd02',
  resource:'tasks',operation:'create',patch:{title:'Finish continuity proof'}
 }),'new task');
 const taskId=task.changed[0].id;
 assert.equal((await q('select count(*)::int n from public.study_entries where id=$1',[entryId]))[0].n,1);
 assert.equal((await q('select count(*)::int n from public.tasks where id=$1',[taskId]))[0].n,1);
 assert.equal((await exportPage('study_entries')).rows[0].id,entryId,
  'new study record exports through the same owner API');
 assert.equal((await exportPage('tasks')).rows[0].id,taskId,
  'new task exports through the same owner API');
 assert.equal(Number((await undo(task.actionNo)).undone),task.actionNo);
 assert.equal(Number((await undo(entry.actionNo)).undone),entry.actionNo);
 assert.equal((await exportPage('study_entries')).rows.length,0,
  'new study record disappears from export after undo');
 assert.equal((await exportPage('tasks')).rows.length,0,
  'new task disappears from export after undo');
 assert.equal((await q('select count(*)::int n from public.projects where id=$1',[project]))[0].n,1,
  'undo of new records cannot damage the upgraded legacy path');
 await as('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal((await exportPage('projects')).rows.length,0,
  'another authenticated owner cannot export upgraded account records');
 console.log('PASS N97 new study/task creation, owner export, undo and owner isolation');
}finally{
 await db.close();
}
