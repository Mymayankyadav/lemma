import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {openN191Postgres} from './fixtures/n191-pg-fixture.mjs';

const {pgcrypto} = await import('@electric-sql/pglite/contrib/pgcrypto');
const db = process.env.NOTIF_TEST_DATABASE_URL ? await openN191Postgres(process.env.NOTIF_TEST_DATABASE_URL)
 : new (await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')).PGlite({extensions:{pgcrypto}});
const owner=randomUUID(), other=randomUUID(), project=randomUUID(), subject=randomUUID(), session=randomUUID(), checkpoint=randomUUID();
const secret='a'.repeat(48), hash=createHash('sha256').update(secret).digest('hex');
const q=async (sql,args=[])=>(await db.query(sql,args)).rows;
const result=async (sql,args=[])=>(await q(sql,args))[0]?.result;
const as=async (role,user='')=>{
 await q('reset role');
 await q("select set_config('test.uid',$1,false)",[user]);
 if(role) await q('set role '+role);
};
const command=(operation,patch={})=>({operation,operationId:randomUUID(),...patch});
const registered=(resource,op,patch,ref)=>({schemaVersion:1,resource,operation:op,operationId:randomUUID(),patch,
 ...(ref&&{target:{id:ref.id},expectedVersion:ref.version})});
const mcp=(p)=>result("select public.mcp_command($1,'claude',$2) result",[owner,p]);
const ownerCommand=(sitting,p)=>result("select public.exam_tutor_owner_command($1,'exam-path',null,$2,$3) result",[owner,p,sitting]);
const connector=(grant,p,credential=hash)=>result("select public.tutor_connector_command($1,$2,$3,$4) result",[owner,credential,grant,p]);
const threadState=(sitting)=>result("select public.exam_tutor_thread_state($1,'exam-path',null,null,$2) result",[owner,sitting]);

try {
 for(const name of ['anon','authenticated','service_role'])
  if(!(await q('select 1 from pg_roles where rolname=$1',[name])).length)await db.exec('create role '+name);
 await db.exec(`create schema auth;
  create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$
    select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
      nullif(current_setting('test.uid',true),'')::uuid) $$;
  grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
 await db.exec(`create extension pgcrypto with schema extensions;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text,owner_id text,created_at timestamptz default clock_timestamp(),metadata jsonb,
    primary key(bucket_id,name));
  alter table storage.objects enable row level security;
  create function storage.foldername(value text) returns text[] language sql immutable as
    'select (string_to_array(value,''/''))[1:cardinality(string_to_array(value,''/''))-1]';
  create function storage.filename(value text) returns text language sql immutable as
    'select (string_to_array(value,''/''))[cardinality(string_to_array(value,''/''))]';`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort())
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users values($1),($2)',[owner,other]);
 for(const [user,key] of [[owner,secret],[other,'b'.repeat(48)]]) await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[user,key]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,status) values($1,$2,$3,'exam-path','Exam path','active')",[project,owner,subject]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,$3,'CP1',1,'Rank','Compute','Prove','[\"Compute\"]')",[checkpoint,owner,project]);
 await q("insert into public.sessions(id,user_id,project_id,checkpoint_id,number,goal,style) values($1,$2,$3,$4,1,'Review','socratic')",[session,owner,project,checkpoint]);
 await q("insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,'rank','Rank')",[owner,subject]);
 await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable set search_path='' as 'select true'; insert into public.tutor_release_controls values ('manual',true),('mcp',true) on conflict(capability) do update set enabled=true");
 await as('service_role');
 const blueprint=[{key:'rank',title:'Compute a rank',marks:10,concepts:['rank']}];
 const sitting=await mcp(registered('exam_sittings','create',{project_id:project,title:'Linear algebra',blueprint,activate:true}));
 await as('authenticated',owner);
 assert.deepEqual((await threadState(sitting.id)).turns,[]);
 assert.deepEqual((await result("select public.tutor_thread_state($1,'exam-path',$2) result",[owner,checkpoint])).turns,[]);
 const created=await ownerCommand(sitting.id,command('start',{question:'I can practice now.',expectedVersion:0}));
 assert.equal(created.status,'submitted');
 const watcher=await threadState(sitting.id);
 assert.equal(watcher.turns[0].id,created.turnId);
 const operationId=randomUUID();
 await as(null);
 const verifier=await result('select public.tutor_connector_verifier($1,$2,$3) result',[secret,created.turnId,operationId]);
 await as('authenticated',owner);
 const granted=await ownerCommand(sitting.id,{...command('grant',{turnId:created.turnId,expectedVersion:created.version,tokenHash:verifier}),operationId});
 assert.equal(granted.status,'granted');
 assert.equal(await result('select public.tutor_owner_grant_active($1,$2,$3) result',[created.turnId,granted.grantId,operationId]),true);
 await as('service_role');
 assert.equal((await connector(null,null))[0].id,created.turnId+'.'+operationId);
 await assert.rejects(connector(operationId,{operation:'get',turnId:created.turnId},'0'.repeat(64)),/unavailable/i);
 assert.equal(await result('select public.tutor_grant_active($1) result',[verifier]),true);
 assert.equal((await result('select public.tutor_grant_command($1,$2) result',[verifier,{operation:'get',turnId:created.turnId}])).examSittingId,sitting.id);
 const read=await connector(operationId,{operation:'get',turnId:created.turnId});
 assert.deepEqual([read.examSittingId,read.examProjectId,read.sittingStatus],[sitting.id,project,'active']);
 const claim=await connector(operationId,command('claim',{turnId:created.turnId,expectedVersion:created.version}));
 assert.equal(claim.status,'claimed');
 const replyInput=command('reply',{turnId:created.turnId,expectedVersion:claim.version,claimId:claim.claimId,generation:claim.generation,
  messageId:randomUUID(),body:'Rank now?',nextQuestion:'Rank now?',timedSeconds:120});
 const followupId=randomUUID();
 await as('authenticated',owner);
 const added=await result("select public.exam_tutor_followup_add($1,'exam-path',null,$2,$3,'Count pivots?',$4) result",
  [owner,created.turnId,followupId,sitting.id]);
 assert.equal(added.followup.id,followupId);
 await as('service_role');
 await assert.rejects(connector(operationId,replyInput),/posted more messages/i);
 assert.equal((await result('select public.tutor_grant_followups($1,$2) result',[verifier,created.turnId])).unseen,1);
 const answer=await connector(operationId,replyInput);
 assert.equal(answer.status,'completed');
 assert.deepEqual(await connector(operationId,replyInput),answer);
 const questionnaireId=randomUUID();
 const questionnaire={operation:'create',turnId:created.turnId,questionnaireId,title:'Rank check',purpose:'diagnose',
  questions:[{id:'q1',kind:'short',prompt:'What is the rank?'}],
  examRows:[{questionId:'q1',rowKey:'rank',scoringKey:'Two pivots → rank 2',rubricSteps:['Count pivots']}]};
 const attach=(payload)=>result('select public.tutor_questionnaire_connector($1,$2,$3,$4) result',[owner,hash,operationId,payload]);
 await assert.rejects(attach({...questionnaire,examRows:[{...questionnaire.examRows[0],rowKey:'missing'}]}),/blueprint row/i);
 const attached=await attach(questionnaire);
 assert.equal(attached.status,'created');
 assert.deepEqual(await attach(questionnaire),attached);
 const closedQuestionnaireId=randomUUID();
 await attach({...questionnaire,questionnaireId:closedQuestionnaireId,title:'One more rank check'});
 await as('authenticated',owner);
 const state=await result("select public.exam_tutor_questionnaire_state($1,'exam-path',null,$2) result",[owner,sitting.id]);
 assert.equal(state[0].questions[0].prompt,'What is the rank?');
 assert.doesNotMatch(JSON.stringify(state),/scoringKey|rubricSteps|rowKey|Two pivots/);
 const exportId=await result('select public.begin_owner_export() result');
 const exported=await result("select public.owner_export_page($1,'tutor_questionnaire_rows') result",[exportId]);
 assert.equal(exported.rows[0].questionnaire_id,questionnaireId);
 assert.equal(exported.rows[0].sitting_id,sitting.id);
 assert.doesNotMatch(JSON.stringify(exported),/scoring_key|rubric_steps|row_key|Two pivots|Count pivots/);
 for(const table of ['exam_tutor_grants','command_receipts','exam_tutor_questionnaires','exam_tutor_turns']){
  const visible=await result("select public.owner_export_page($1,$2) result",[exportId,table]);
  assert.doesNotMatch(JSON.stringify(visible),/Two pivots|scoringKey|rubricSteps|token_hash/);
 }
 await q('select public.end_owner_export($1)',[exportId]);
 await assert.rejects(q('select * from public.tutor_questionnaire_rows'),/permission denied/i);
 assert.equal((await threadState(sitting.id)).turns[0].finalReply.timedSeconds,120);
 const next=await ownerCommand(sitting.id,command('start',{question:'Rank 2.',expectedVersion:1,answerMeta:{seconds:190,overtime:true}}));
 const nextGrantId=randomUUID();
 await as(null);
 const nextVerifier=await result('select public.tutor_connector_verifier($1,$2,$3) result',[secret,next.turnId,nextGrantId]);
 await as('authenticated',owner);
 await ownerCommand(sitting.id,{...command('grant',{turnId:next.turnId,expectedVersion:next.version,tokenHash:nextVerifier}),operationId:nextGrantId});
 await as('service_role');
 const paused=await mcp(registered('exam_sittings','pause',{},sitting));
 assert.equal(paused.sittingStatus,'paused');
 await as('authenticated',owner);
 const submit=async (id,text)=>result("select public.tutor_questionnaire_save($1,$2,0,$3,true) result",[owner,id,{q1:text}]);
 const lateAnswer=await submit(questionnaireId,'2');
 assert.equal(lateAnswer.status,'submitted');
 assert.deepEqual(lateAnswer.questionnaire.answers,{q1:'2'});
 assert.deepEqual(await submit(questionnaireId,'different retry'),lateAnswer);
 assert.equal((await threadState(sitting.id)).canSubmit,false);
 assert.deepEqual(await q('select id from public.exam_attempts where sitting_id=$1',[sitting.id]),[]);
 await as('service_role');
 assert.equal((await connector(operationId,{operation:'next',turnId:created.turnId})).id,next.turnId+'.'+nextGrantId);
 const nextRead=await connector(nextGrantId,{operation:'get',turnId:next.turnId});
 assert.equal(nextRead.sittingStatus,'paused');
 assert.deepEqual(nextRead.snapshot.answerMeta,{seconds:190,overtime:true});
 assert.deepEqual(nextRead.examQuestionnaireAnswers,[{questionnaireId,questionId:'q1',rowKey:'rank',blueprintVersion:1,
  scoringKey:'Two pivots → rank 2',rubricSteps:['Count pivots'],answer:'2',deliveryRef:questionnaireId+':q1'}]);
 const scoredLate={sitting_id:sitting.id,row_key:'rank',delivery:'questionnaire',delivery_ref:nextRead.examQuestionnaireAnswers[0].deliveryRef,
  outcome:'correct',marks_awarded:2,marks_possible:2};
 const lateAttempt=await mcp(registered('exam_attempts','record',scoredLate));
 const duplicateLate=await mcp(registered('exam_attempts','record',scoredLate));
 assert.deepEqual([lateAttempt.status,duplicateLate.status,duplicateLate.id],['ok','duplicate',lateAttempt.id]);
 const finished=await mcp(registered('exam_sittings','finish',{happened:true},{id:sitting.id,version:paused.version}));
 assert.equal(finished.sittingStatus,'finished');
 await as('authenticated',owner);
 assert.equal((await submit(closedQuestionnaireId,'kept for later')).status,'submitted');
 assert.deepEqual(await q('select outcome,delivery_ref from public.exam_attempts where sitting_id=$1',[sitting.id]),
  [{outcome:'correct',delivery_ref:questionnaireId+':q1'}]);
 await as('service_role');
 const closedHandoff=await connector(nextGrantId,{operation:'get',turnId:next.turnId});
 assert.equal(closedHandoff.sittingStatus,'finished');
 assert.equal(closedHandoff.examQuestionnaireAnswers.find(response=>response.questionnaireId===closedQuestionnaireId).answer,'kept for later');
 await assert.rejects(mcp(registered('exam_attempts','record',{...scoredLate,delivery_ref:closedQuestionnaireId+':q1'})),/reopen it/);
 const reopened=await mcp(registered('exam_sittings','reopen',{}, {id:sitting.id,version:finished.version}));
 await mcp(registered('exam_sittings','activate',{}, {id:sitting.id,version:reopened.version}));
 await as('authenticated',other);
 await assert.rejects(threadState(sitting.id),/unavailable/i);
 await as('authenticated',owner);
 assert.equal((await result("select public.tutor_thread_state($1,'exam-path',$2) result",[owner,checkpoint])).head.lastSequence,0);
 // Ink uses the same owner object authorization as an ordinary tutor turn.
 const attachmentId=randomUUID();
 await ownerCommand(sitting.id,command('cancel',{turnId:next.turnId,expectedVersion:next.version}));
 await as(null);
 await q("insert into storage.objects(bucket_id,name,owner_id,metadata) values('tutor-ink',$1,$2,$3)",[
  owner+'/'+attachmentId,owner,{mimetype:'image/png',size:128}]);
 await as('authenticated',owner);
 const inkStart=command('start',{question:'Here is the pivot diagram.',expectedVersion:2});
 const ink=()=>result("select public.exam_tutor_owner_ink_command($1,'exam-path',null,$2,$3::jsonb,$4) result",
  [owner,inkStart,JSON.stringify([{id:attachmentId,kind:'drawing',mimeType:'image/png'}]),sitting.id]);
 const inkResult=await ink();
 assert.equal(inkResult.status,'submitted');
 assert.deepEqual(await ink(),inkResult);
 assert.equal((await threadState(sitting.id)).turns.at(-1).snapshot.attachments[0].id,attachmentId);

 const delivery='turn:'+next.turnId;
 const event={kind:'attempt',text:'The learner found the pivot rows.',outcome:'demonstrated',concept:'rank',level:'use',
  exam:{sitting:sitting.id,row:'rank',delivery_ref:delivery}};
 const progress=async (events)=>(await result(
  "select public.mcp_commit($1,'save_progress','claude','Exam evidence',$2::jsonb) result",
  [owner,JSON.stringify([{op:'rpc',fn:'save_progress',args:{p_user_id:owner,p_project_id:project,p_session_id:session,p_payload:{events}}}])])).result;
 await as('service_role',owner);
 await assert.rejects(progress([{...event,exam:{...event.exam,row:'unknown'}}]),/not found/i);
 await assert.rejects(progress([{...event,kind:'evidence'}]),/probe does not demonstrate/i);
 const attempt=await mcp(registered('exam_attempts','record',{sitting_id:sitting.id,row_key:'rank',outcome:'correct',delivery_ref:delivery}));
 assert.deepEqual(await progress([event]),{step:null,events:1});
 await as(null);
 const [first]=await q("select id,ctx from public.evidence where ctx->>'deliveryRef'=$1",[delivery]);
 assert.deepEqual([first.ctx.mode,first.ctx.sittingId,first.ctx.rowKey,first.ctx.deliveryRef],['exam',sitting.id,'rank',delivery]);
 assert.equal((await q('select evidence_id from public.exam_attempts where id=$1',[attempt.id]))[0].evidence_id,first.id);
 // Post-cutover Atlas writes keep typed attempts; the exact exam observation remains available to history.
 await q('update public.settings set atlas_migrated_at=clock_timestamp() where user_id=$1',[owner]);
 await as('service_role',owner);
 await as(null);
 const version=(await q('select progress_version from public.sessions where id=$1',[session]))[0].progress_version;
 await as('service_role',owner);
 const atlas=await mcp(registered('session_progress','save',{events:[{...event,exam:{...event.exam,delivery_ref:'atlas-exam'}}]},
   {id:session,version}));
 assert.equal(atlas.status,'ok');
 await as(null);
 assert.equal((await q("select count(*)::int n from public.evidence where ctx->>'deliveryRef'='atlas-exam'"))[0].n,1);
 assert.equal((await q("select count(*)::int n from public.attempts where user_id=$1",[owner]))[0].n,1);
 await as('authenticated',owner);
 const rolledBack=await result('select public.undo_action($1,$2,false) result',[owner,atlas.actionNo]);
 await as(null);
 assert.equal((await q("select count(*)::int n from public.evidence where ctx->>'deliveryRef'='atlas-exam'"))[0].n,0);
 await as('authenticated',owner);
 assert.equal(Number((await result('select public.undo_action($1,$2,false) result',[owner,rolledBack.as])).undone),Number(rolledBack.as));
 await as('service_role',owner);
 const late=await mcp(registered('exam_attempts','record',{sitting_id:sitting.id,row_key:'rank',outcome:'correct',delivery_ref:'atlas-exam'}));
 await as(null);
 const [linked]=await q('select e.session_event_id,e.id from public.exam_attempts a join public.evidence e on e.id=a.evidence_id where a.id=$1',[late.id]);
 assert.ok(linked.id);
 await as('authenticated',owner);
 const corrected=await result('select public.correct_session_event($1) result',[registered('session_event_corrections','correct',
  {reason:'A hint was needed',hintLevel:1},{id:String(linked.session_event_id)})]);
 await as(null);
 const [replacement]=await q('select e.id,e.ctx,e.hint_level,se.learning_context from public.evidence e join public.session_events se on se.id=e.session_event_id where se.id=$1',[corrected.revisedEventId]);
 assert.equal(replacement.ctx.mode,'exam');
 assert.equal(replacement.learning_context.mode,'exam');
 assert.equal(replacement.hint_level,1);
 assert.equal((await q('select evidence_id from public.exam_attempts where id=$1',[late.id]))[0].evidence_id,replacement.id);
 await as('service_role');
 await progress([{kind:'explanation',text:'Recap the rank theorem.',exam:{sitting:sitting.id,row:'rank',delivery_ref:'recap'}}]);
 await as(null);
 assert.equal((await q("select learning_context->>'mode' mode from public.session_events where learning_context->>'deliveryRef'='recap'"))[0].mode,'exam');
 assert.equal((await q("select count(*)::int n from public.evidence where ctx->>'deliveryRef'='recap'"))[0].n,0);
 console.log('PASS N242 sitting tutor, private rubric and timer; N246 exact exam evidence linkage, correction and ungraded recap');
}catch(error){console.error(error.message, error.where ?? ''); process.exitCode=1;}
finally{await db.close();}
