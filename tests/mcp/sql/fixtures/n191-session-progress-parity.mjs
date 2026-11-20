import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Command-only resource: verify the actual session/event rows, not an invented
// session_progress table. The rollout/ACL changes below exist only in this DB.
export async function checkSessionProgressParity(db,{owner,other}) {
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async(role,id='')=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  if(role)await db.exec('set role '+role);
 };
 const call=async(request,user=owner)=>(await q(
  "select public.mcp_command($1,'chatgpt',$2::jsonb) result",[user,JSON.stringify(request)]))[0].result;
 const count=async(session)=>(await q('select count(*)::int n from public.session_events where session_id=$1',[session]))[0].n;
 await as();
 const original=(await q("select pg_get_functiondef('public.lemma_plan_released()'::regprocedure) definition"))[0].definition;
 const release=async()=> (await q('select public.lemma_plan_released() released'))[0].released;
 assert.equal(await release(),false,'N191 must preserve the disabled production release');
 const project=(await q("insert into public.projects(user_id,slug,title) values($1,'n191-parity','Session parity') returning id",[owner]))[0].id;
 const checkpoint=(await q(`insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps)
  values($1,$2,'CP191',1,'Proof','Explain','Saved evidence','["State","Explain"]') returning id`,[owner,project]))[0].id;
 const session=(await q(`insert into public.sessions(user_id,project_id,checkpoint_id,number,goal,style)
  values($1,$2,$3,191,'Proof','socratic') returning id`,[owner,project,checkpoint]))[0].id;
 await q("insert into public.misconceptions(user_id,project_id,label) values($1,$2,'Prior gap')",[owner,project]);
 const read=async()=>(await q('select resume_step,resume_question,progress_version from public.sessions where id=$1',[session]))[0];
 const request={schemaVersion:1,resource:'session_progress',operation:'save',operationId:randomUUID(),
  target:{id:session},expectedVersion:1,patch:{step:2,events:[{kind:'note',text:'Private proof note'}],
   misconception:'New gap',resolved:'Prior gap',next_question:'Why does the converse hold?'}};
 const registration=(await q("select command_fn,\"schema\" from public.lemma_command_resources where resource='session_progress'"))[0];
 assert.equal(registration.command_fn,'lemma_session_progress_command');
 assert.deepEqual(registration.schema.operations,['save']);
 assert.deepEqual([...registration.schema.fields].sort(),Object.keys(request.patch).sort(),
  'Every declared session-progress field must be exercised');
 try {
  for(const role of ['anon','authenticated']){
   await as(role,role==='authenticated'?owner:'');
   await assert.rejects(q('select public.lemma_session_progress_command($1::jsonb)',[JSON.stringify(request)]),
    error=>error.code==='42501','Raw clients cannot invoke the trusted writer');
  }
  await as('service_role');
  await assert.rejects(call(request,other),error=>error.code==='42501');
  await assert.rejects(call(request),error=>error.code==='55000','Unqualified receipt authority must fail closed');
  await as();
  assert.equal(await count(session),0);
  await db.exec('revoke insert,update,delete,truncate,references,trigger on public.command_receipts from public,anon,authenticated');
  const hasProvenance=(await q(`select exists(select 1 from pg_attribute where attrelid='public.command_receipts'::regclass
   and attname='trusted_writer_version' and not attisdropped) present`))[0].present;
  if(!hasProvenance)await db.exec('alter table public.command_receipts add column trusted_writer_version smallint');
  await as('service_role');
  await assert.rejects(call(request),error=>error.code==='55000','Receipt cutover alone must not activate the release');
  await as();
  await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select true'");
  await as('service_role');
  const first=await call(request);
  assert.equal(first.status,'ok');assert.equal(first.version,2);assert.equal(first.events,2);assert.equal(first.step,2);
  assert.equal(first.sessionId,session);assert.equal(first.projectId,project);assert.ok(first.actionNo>0);
  assert.equal(JSON.stringify(first).includes('Private proof note'),false,'Receipt must not copy submitted text');
  assert.deepEqual(await call(request),first,'Duplicate delivery returns exactly the original acknowledgement');
  assert.equal((await call({...request,patch:{...request.patch,next_question:'Different'}})).status,'conflict');
  assert.equal((await call({...request,operationId:randomUUID()})).status,'conflict','New writes reject stale session versions');
  await as('authenticated',owner);
  assert.deepEqual(await read(),{resume_step:2,resume_question:request.patch.next_question,progress_version:2});
  assert.equal(await count(session),2);
  assert.equal((await q('select current_step from public.checkpoints where id=$1',[checkpoint]))[0].current_step,2);
  const misconceptions=await q('select label,resolved_at is not null resolved from public.misconceptions where project_id=$1 order by label',[project]);
  assert.deepEqual(misconceptions,[{label:'New gap',resolved:false},{label:'Prior gap',resolved:true}]);
  await as('authenticated',other);
  assert.equal(await read(),undefined);assert.equal(await count(session),0);
  await as();
  const stored=(await q('select result from public.command_receipts where user_id=$1 and operation_id=$2',[owner,request.operationId]))[0].result;
  assert.ok(stored._request_sha256);assert.equal(stored._request,null);
  assert.equal(JSON.stringify(stored).includes('Private proof note'),false);
  const beforeSecond=await read();
  const secondRequest={...request,operationId:randomUUID(),expectedVersion:2,
   patch:{events:[{kind:'note',text:'Second proof note'}],next_question:'Next proof'}};
  await as('service_role');
  const second=await call(secondRequest);
  assert.equal(second.status,'ok');assert.equal(second.version,3);
  assert.deepEqual(await call(request),first,'A delayed acknowledgement survives a later committed save');
  await as('authenticated',owner);
  assert.equal(await count(session),3);
  const undone=(await q('select public.undo_action($1,$2,false) result',[owner,second.actionNo]))[0].result;
  assert.equal(Number(undone.undone),Number(second.actionNo));
  const afterUndo=await read();
  assert.equal(afterUndo.resume_step,beforeSecond.resume_step);
  assert.equal(afterUndo.resume_question,beforeSecond.resume_question);
  assert.ok(afterUndo.progress_version>second.version,'Undo advances the concurrency token');
  assert.equal(await count(session),2,'Undo removes the second save event');
  await as('service_role');
  assert.deepEqual(await call(secondRequest),second,'Retry after undo returns the old receipt without reapplying');
  await as('authenticated',owner);assert.equal(await count(session),2);
  const rollbackRequest={...secondRequest,operationId:randomUUID(),expectedVersion:afterUndo.progress_version};
  await db.exec('begin');
  try {
   await as('service_role');assert.equal((await call(rollbackRequest)).status,'ok');
  } finally {await db.exec('rollback');}
  await as();
  assert.deepEqual(await read(),afterUndo,'Rollback preserves the session and concurrency token');
  assert.equal(await count(session),2);
  assert.equal((await q('select count(*)::int n from public.command_receipts where user_id=$1 and operation_id=$2',
   [owner,rollbackRequest.operationId]))[0].n,0,'Rollback removes the provisional receipt');
  await db.exec(original);
  await as('service_role');
  assert.deepEqual(await call(request),first,'A release hold still permits an accepted acknowledgement replay');
  await assert.rejects(call(rollbackRequest),error=>error.code==='55000','A release hold rejects new writes');
  // The legacy save_progress RPC is also a service-only connector writer.
  // Keep that existing boundary while verifying it works during a release hold.
  // Only this call needs Supabase's real service-role BYPASSRLS attribute:
  // the historical harness otherwise keeps its service role unprivileged.
  await as();
  const bypass=(await q("select rolbypassrls from pg_roles where rolname='service_role'"))[0].rolbypassrls;
  let legacy;
  try {
   if(!bypass)await db.exec('alter role service_role bypassrls');
   await as('service_role',owner);
   legacy=(await q('select public.save_progress($1,$2,$3,$4::jsonb) result',
    [owner,project,session,JSON.stringify({events:[{kind:'note',text:'Legacy path remains available'}]})]))[0].result;
  } finally {
   await as();if(!bypass)await db.exec('alter role service_role nobypassrls');
  }
  assert.equal(legacy.events,1);
  await as('authenticated',owner);
  assert.ok((await read()).progress_version>afterUndo.progress_version,'Legacy writes invalidate stale new-writer versions');
  assert.equal(await count(session),3);
  console.log('PASS N191 session_progress owner/MCP lifecycle, all fields, gates, receipts, delayed acknowledgements, rollback and undo');
 } finally {
  await as();await db.exec(original);assert.equal(await release(),false);
 }
}
