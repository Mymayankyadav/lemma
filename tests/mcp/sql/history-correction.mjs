// N91 full-migration history corrections, owner evidence re-derivation, explicit review schedule replacement, undo and MCP.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const param='33333333-3333-4333-8333-333333333333';
const subject='44444444-4444-4444-8444-444444444444';
const project='55555555-5555-4555-8555-555555555555';
const checkpoint='66666666-6666-4666-8666-666666666666';
const session='77777777-7777-4777-8777-777777777777';
const noteId='88888888-8888-4888-8888-888888888888';
const card='99999999-9999-4999-8999-999999999999';
const command=(resource,operation,id,patch)=>({schemaVersion:1,resource,
 operationId:randomUUID(),operation,target:{id:String(id)},patch});
const invoke=async(name,p)=>(await q('select public.'+name+'($1::jsonb) result',[JSON.stringify(p)]))[0].result;
const as=async who=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[who]);
 await db.exec('set role authenticated');
};
try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions; create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select nullif(current_setting('test.uid',true),'')::uuid $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(names.includes('20261116010000_n91_history_correction.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 const columns=async table=>(await q("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",['public.'+table])).map(x=>x.attname);
 for(const field of ['occurred_at','superseded_by','voided_at','correction_reason','actor'])
  assert((await columns('session_events')).includes(field),'missing event field '+field);
 for(const field of ['scheduler_version','params_id','operation_id'])
  assert((await columns('reviews')).includes(field),'missing review field '+field);
 const privileges=(await q("select has_table_privilege('authenticated','public.review_parameter_sets','SELECT') read,has_table_privilege('authenticated','public.review_parameter_sets','INSERT') write,has_table_privilege('authenticated','public.review_parameter_sets','TRUNCATE') truncate"))[0];
 assert.equal(privileges.read,true);
 assert.equal(privileges.write,false);
 assert.equal(privileges.truncate,false);
 await q('insert into public.review_parameter_sets(id,user_id,scheduler_version,params) values($1,$2,$3,$4::jsonb)',[param,owner,'fsrs-v1',JSON.stringify({weights:Array(21).fill(1)})]);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[other]);
 assert.equal((await q('select count(*)::int n from public.review_parameter_sets'))[0].n,0);
 await assert.rejects(q("insert into public.review_parameter_sets(scheduler_version,params) values('forged','{}')"),/permission denied|row.level security/i);
 await q("select set_config('test.uid',$1,false)",[owner]);
 assert.equal((await q('select count(*)::int n from public.review_parameter_sets'))[0].n,1);

 await db.exec('reset role');
 const registry=(await q("select count(*)::int n from public.lemma_undo_tables where table_name='review_parameter_sets'"))[0].n;
 assert.equal(registry,1);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[owner,'a'.repeat(48)]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[other,'b'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proof','Proofs','Study')",[project,owner,subject]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion) values($1,$2,$3,'CP1',1,'Proof','Prove','Proof accepted')",[checkpoint,owner,project]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'Proof metric','socratic',$4)",[session,owner,project,checkpoint]);
 const originalEvent=(await q("insert into public.session_events(user_id,session_id,checkpoint_id,kind,body,outcome) values($1,$2,$3,'evidence','Original evidence','demonstrated') returning id",[owner,session,checkpoint]))[0].id;
 await as(owner);
 const eventPatch={reason:'Correct transcription',body:'Corrected proof',
  occurredAt:'2026-11-06T12:00:00Z'};
 const eventReq=command('session_event_corrections','correct',originalEvent,eventPatch);
 const eventReceipt=await invoke('correct_session_event',eventReq);
 assert.equal(eventReceipt.status,'ok');
 const repeated=await invoke('correct_session_event',eventReq);
 assert.equal(repeated.revisedEventId,eventReceipt.revisedEventId,'exact retry has one successor');
 assert.equal((await invoke('correct_session_event',{...eventReq,patch:{...eventPatch,body:'Different'}})).status,'conflict');
 assert.equal((await q('select superseded_by from public.session_events where id=$1',[originalEvent]))[0].superseded_by,
  Number(eventReceipt.revisedEventId));
 assert.equal((await q('select status from public.checkpoints where id=$1',[checkpoint]))[0].status,'demonstrated');
 const voidReq=command('session_event_corrections','void',eventReceipt.revisedEventId,{reason:'Evidence disproven'});
 const voided=await invoke('void_session_event',voidReq);
 assert.equal(voided.status,'ok');
 assert.equal((await q('select status from public.checkpoints where id=$1',[checkpoint]))[0].status,'not_started',
  'voiding sole demonstrated evidence removes demonstrated checkpoint state');
 await as(other);
 await assert.rejects(invoke('correct_session_event',
  command('session_event_corrections','void',originalEvent,{reason:'Not mine'})),/not found for owner/);
 await as(owner);
 // Undo restores the voided event and its checkpoint state atomically.
 const undid=(await q('select public.undo_action($1,$2,false) result',[owner,voided.actionNo]))[0].result;
 assert.equal(Number(undid.undone),Number(voided.actionNo));
 assert.equal((await q('select status from public.checkpoints where id=$1',[checkpoint]))[0].status,'demonstrated');
 assert.equal((await q('select voided_at from public.session_events where id=$1',
  [eventReceipt.revisedEventId]))[0].voided_at,null);

 // Explicit replacement, rather than replaying historic grades with today's
 // unrecorded weights, is stored with the precise owner-scoped parameters.
 await db.exec('reset role');
 await q("insert into public.notes(id,user_id,project_id,front,back) values($1,$2,$3,'Q','A')",[noteId,owner,project]);
 await q("insert into public.cards(id,user_id,note_id,ord,state,stability,difficulty,reps) values($1,$2,$3,1,1,2,5,1)",[card,owner,noteId]);
 const reviewId=(await q("insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) values($1,$2,3,0,6000,'{}'::jsonb) returning id",[owner,card]))[0].id;
 const replacement={state:2,due:'2026-12-01T00:00:00Z',stability:8,
  difficulty:4,last_review:'2026-11-06T09:00:00Z',step:0,reps:2,lapses:0};
 await as(owner);
 const gradeRequest=command('review_corrections','correct',reviewId,{reason:'Misgraded answer',
  rating:4,replacementState:replacement,schedulerParams:{method:'manual audit'}});
 const graded=await invoke('correct_review',gradeRequest);
 assert.equal(graded.status,'ok');assert.equal(graded.method,'disclosed_replacement');
 assert.equal((await q('select rating from public.reviews where id=$1',[reviewId]))[0].rating,4);
 assert.equal((await q('select stability from public.cards where id=$1',[card]))[0].stability,8);
 const snapshot=(await q('select params from public.review_parameter_sets where id=$1',
  [graded.parameterSnapshotId]))[0].params;
 assert.equal(snapshot.method,'disclosed_replacement');
 assert.equal(snapshot.reason,'Misgraded answer');
 assert.deepEqual(snapshot.replacementState,replacement);
 assert.equal((await invoke('correct_review',gradeRequest)).parameterSnapshotId,graded.parameterSnapshotId);
 const voidReview=await invoke('void_review',command('review_corrections','void',reviewId,{
  reason:'Review never occurred',replacementState:{...replacement,reps:1,stability:2}}));
 assert.equal(voidReview.status,'ok');
 assert.ok((await q('select undone_at from public.reviews where id=$1',[reviewId]))[0].undone_at);
 await q('select public.undo_action($1,$2,false)',[owner,voidReview.actionNo]);
 assert.equal((await q('select undone_at from public.reviews where id=$1',[reviewId]))[0].undone_at,null);
 assert.equal((await q('select stability from public.cards where id=$1',[card]))[0].stability,8);
 await as(other);
 await assert.rejects(invoke('correct_review',
  command('review_corrections','void',reviewId,{reason:'Foreign',replacementState:replacement})),
  /not found for owner/);
 await db.exec('reset role');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource in ('session_event_corrections','review_corrections')"))[0].n,2);
 console.log('PASS N91 owner correction receipts, checkpoint re-derivation, explicit reviewed schedule, undo and isolation');
}finally{await db.close()}
