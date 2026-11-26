import assert from 'node:assert/strict';

const functions = {
 exam_sittings:'exam_sitting_command',
 exam_attempts:'exam_attempt_command',
 card_ideas:'card_idea_command',
};

export async function checkExamParity({q,role,as,owner,other,command,mcp,app,mcpPage,undo,status,mark}) {
 await role(null);
 const [{id:project}] = await q(
  "insert into public.projects(user_id,slug,title,goal,status) values($1,'n240-exam-parity','Exam parity','Review rank','active') returning id",
  [owner]);
 const [{id:checkpoint}] = await q(`insert into public.checkpoints
  (user_id,project_id,code,position,title,objective,criterion,status,steps,current_step)
  values($1,$2,'CP1',1,'Rank','Compute rank','Give a reason','in_progress','["Compute","Explain"]',1) returning id`,
 [owner,project]);
 await q(`insert into public.sessions(user_id,project_id,checkpoint_id,number,goal,style,resume_step,resume_question)
  values($1,$2,$3,1,'Review','socratic',1,'How many pivots?')`,[owner,project,checkpoint]);
 const [note] = await q(
  "insert into public.notes(user_id,project_id,front,back) values($1,$2,'Existing rank card','Count pivots') returning id,no",
  [owner,project]);

 // Each operation must make a fresh write through both entry points. Replay it
 // through the other entry point using the same operation ID and exact payload.
 const completed = [];
 for (const surface of ['app','mcp']) {
  const exercised = [];
  const write = async (channel,fn,input) => {
   if (channel === 'app') {
    await as(owner);
    return app(fn,input);
   }
   await role('service_role');
   return mcp(input);
  };
  const getRow = async (resource,id) => {
   await as(owner);
   return (await q(`select * from public.${resource} where id=$1`,[id]))[0];
  };
  const run = async (resource,operation,patch,previous,expected) => {
   const name = `${surface} ${resource}.${operation}`;
   const fn = functions[resource];
   const input = command(resource,operation,{patch,
    ...(previous && {target:{id:previous.id},expectedVersion:previous.version}),
   });
   const receipt = status(await write(surface,fn,input),resource,operation);
   assert.equal(receipt.operationId,input.operationId,name+': receipt lost operation identity');
   assert.deepEqual(receipt.changed,[{id:receipt.id,version:receipt.version}],name+': changed record');
   assert.equal(receipt.version,previous ? previous.version+1 : 1,name+': persisted version');
   assert.deepEqual(await write(surface === 'app' ? 'mcp' : 'app',fn,input),receipt,name+': cross-surface replay disagrees');
   const row = await getRow(resource,receipt.id);
   assert.equal(row.user_id,owner,name+': no owner app row');
   assert.equal(row.version,receipt.version,name+': app row stale');
   await role(null);
   const page = await mcpPage(resource,receipt.id);
   assert.equal(page.total,1,name+': no registered MCP row');
   const [item] = page.items;
   assert.equal(item.version,receipt.version,name+': MCP row stale');
   assert.ok(!Object.hasOwn(item,'user_id')&&!Object.hasOwn(item,'conversion_key'),name+': leaked private column');
   for (const [field,value] of Object.entries(expected)) {
    assert.deepEqual(row[field],value,name+': app field '+field);
    assert.deepEqual(item[field],value,name+': MCP field '+field);
   }
   assert.deepEqual(await q('select user_id,source,tool from public.actions where no=$1',[receipt.actionNo]),
    [{user_id:owner,source:surface==='app'?'app':'chatgpt',tool:surface==='app'?fn:'study'}],name+': wrong journal attribution');
   exercised.push(resource+'.'+operation);
   return {receipt,row,item};
  };

  const sits = 'exam_sittings', attempts = 'exam_attempts', ideas = 'card_ideas';
  const title = 'Rank exam via '+surface;
  const blueprint = [{key:'rank',title:'Compute the rank of a matrix',marks:12}];
  let sitting = (await run(sits,'create',{project_id:project,title,starts_at:'2030-06-19',time_zone:'UTC',blueprint},
   null,{project_id:project,title,status:'planned',blueprint})).receipt;
  sitting = (await run(sits,'update',{study_minutes:60},sitting,{study_minutes:60})).receipt;
  const setDisposition = await run(sits,'set_disposition',{rows:[{key:'rank',disposition:'defer',reason:'Low priority',reopen:'After proofs'}]},
   sitting,{status:'planned'});
  const ledger = setDisposition.item.ledger;
  assert.deepEqual(ledger,setDisposition.row.ledger);
  assert.equal(ledger.rank.disposition,'defer');
  assert.equal(ledger.rank.reopen,'After proofs');
  const active = await run(sits,'activate',{},setDisposition.receipt,{status:'active'});
  assert.deepEqual(active.row.bookmark,active.item.bookmark);
  assert.equal(active.item.bookmark.checkpoint,'CP1');
  assert.equal(active.item.bookmark.question,'How many pivots?');
  sitting = active.receipt;

  const recorded = (await run(attempts,'record',{sitting_id:sitting.id,row_key:'rank',outcome:'correct',marks_awarded:2,marks_possible:2},
   null,{sitting_id:sitting.id,project_id:project,row_key:'rank',outcome:'correct',marks_awarded:'2',void_reason:null})).receipt;
  const corrected = (await run(attempts,'correct',{outcome:'partial',marks_awarded:1,reason:'Missed a pivot'},recorded,
   {outcome:'partial',marks_awarded:'1',corrected_reason:'Missed a pivot'})).receipt;
  const voided = (await run(attempts,'void',{reason:'Misread the prompt'},corrected,{void_reason:'Misread the prompt'})).receipt;
  const restored = await run(attempts,'restore',{},voided,{void_reason:null,voided_at:null,outcome:'partial'});
  await as(owner);
  assert.equal(Number((await undo(restored.receipt.actionNo)).undone),restored.receipt.actionNo);
  assert.ok((await getRow(attempts,recorded.id)).voided_at,surface+': undo did not re-void the attempt');

  const target = 'Recognize independent rows via '+surface;
  const saved = (await run(ideas,'save',{project_id:project,sitting_id:sitting.id,target},null,
   {project_id:project,sitting_id:sitting.id,target,status:'saved',sightings:1})).receipt;
  const edited = (await run(ideas,'update',{reason:'Confused dependent rows'},saved,{reason:'Confused dependent rows',status:'saved'})).receipt;
  const drafted = await run(ideas,'draft',{front:'Which rows are independent?',back:'Rows supporting distinct pivots.',checkpoint:'CP1'},
   edited,{front:'Which rows are independent?',status:'drafted'});
  const [proposal] = await q('select no,origin,payload from public.proposals where id=$1',[drafted.row.proposal_id]);
  assert.equal(Number(proposal.no),drafted.receipt.proposalNo);
  assert.equal(proposal.origin,surface==='app'?'other':'chatgpt');
  assert.equal(proposal.payload.checkpoint,'CP1');
  assert.equal(proposal.payload.cardIdea,saved.id);
  await as(owner);
  assert.equal(Number((await undo(drafted.receipt.actionNo)).undone),drafted.receipt.actionNo);
  const undrafted = await getRow(ideas,saved.id);
  assert.equal(undrafted.status,'saved');
  assert.equal(undrafted.proposal_id,null);
  assert.deepEqual(await q('select id from public.proposals where id=$1',[drafted.row.proposal_id]),[]);
  const linked = (await run(ideas,'link',{card:'N'+note.no},undrafted,{status:'linked',note_id:note.id})).receipt;
  const dismissed = (await run(ideas,'dismiss',{},linked,{status:'dismissed'})).receipt;
  const restoredIdea = (await run(ideas,'restore',{},dismissed,{status:'saved',note_id:null,proposal_id:null})).receipt;

  sitting = (await run(sits,'pause',{next_question:'Try a new matrix.'},sitting,{status:'paused',next_question:'Try a new matrix.'})).receipt;
  sitting = (await run(sits,'finish',{happened:false,result_note:'Postponed'},sitting,{status:'finished',happened:false,result_note:'Postponed'})).receipt;
  sitting = (await run(sits,'reopen',{starts_at:'2030-07-01'},sitting,{status:'paused',happened:null,finished_at:null,result_note:null})).receipt;
  const cancelled = (await run(sits,'cancel',{},sitting,{status:'cancelled'})).receipt;

  for (const [resource,id] of [[sits,cancelled.id],[attempts,recorded.id],[ideas,restoredIdea.id]]) {
   await as(other);
   assert.deepEqual(await q(`select id from public.${resource} where id=$1`,[id]),[],surface+': app owner isolation');
   await role(null);
   assert.equal((await mcpPage(resource,id,other)).total,0,surface+': MCP owner isolation');
  }
  completed.push(exercised);
 }
 assert.deepEqual(completed[0],completed[1],'N240 commands exercised on only one surface');
 for (const test of completed[0]) mark(...test.split('.'));
}
