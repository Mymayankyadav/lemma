'use strict';
// TUTOR-01 T3b2: selected tutor amendment may become a local draft only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ID='00000000-0000-4000-8000-000000000001';
const PROPOSAL='00000000-0000-4000-8000-000000000002';
const OWNER='00000000-0000-4000-8000-000000000003';
const CONTEXT='00000000-0000-4000-8000-000000000004';
const CP='compactness-proof';
const otherOwner='00000000-0000-4000-8000-000000000005';
let dialog,revision=3,checkpoint=CP,contextRevision=2,failOnce=false;
let hintLevel=1,sessionId=OWNER,attemptId=null;
const staged=[],approvals=[],published=[],events=[];
let notifyIdentityChange=null;
const account={user:{id:OWNER},onIdentityChange(fn){notifyIdentityChange=fn;}};
const app={workspaceRevision:1,workspaceBlocked:false};
const plan={
 async activeContext(){return {planId:ID,planRevision:revision,
   contextId:CONTEXT,contextRevision,
   checkpoint:{id:checkpoint,objective:'Show compactness',status:'in_progress'},
   sessionId,hintLevel,sourceRefs:[],
   lastAttempt:attemptId ? {eventId:attemptId} : null};},
 async proposeAmendment(input){
   staged.push(JSON.parse(JSON.stringify(input)));
   if(failOnce){failOnce=false;throw Error('Draft response lost');}
   return input.proposalId;
 },
 async approvePlanDraft(...args){approvals.push(args);},
 async submitApprovedPlanDraft(...args){published.push(args);},
 async recordEvent(...args){events.push(args);}
};
function h(tag,attrs,...kids) {
 const obj={tag,attrs:attrs||{},kids,children:[],checked:!!attrs?.checked,
  disabled:!!attrs?.disabled,value:'',textContent:attrs?.text||'',events:{},
  append(...els){this.children.push(...els);},
  replaceChildren(...els){this.children=els;},
  addEventListener(name,fn){this.events[name]=fn;}};
 if(attrs?.onclick)obj.events.click=attrs.onclick;
 return obj;
}
const scope=vm.createContext({TextEncoder,h,StudyPlan:plan,LemmaAccount:account,App:app,
 Sheets:{open(opts){dialog=opts;return {close(){}};}},copyText:async()=>true});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+
 '\nglobalThis.Tutor=TutorHandoff;',scope);
function walk(node,out=[]) {
 if(!node || typeof node!=='object')return out;
 out.push(node);
 for(const item of [...(node.kids||[]),...(node.children||[])]) {
  if(Array.isArray(item))for(const v of item)walk(v,out);
  else walk(item,out);
 }
 return out;
}
function ui() {
 const nodes=walk(dialog.body);
 const byClass=cls=>nodes.find(x=>x.attrs?.class===cls);
 const byText=text=>nodes.find(x=>x.attrs?.text===text);
 return {input:byClass('tutor-handoff-reply'),parse:byText('Review pasted reply'),
   status:byClass('tutor-handoff-status'),
   stage:byText('Stage unapproved amendment draft'),
   checkbox:nodes.find(x=>x.tag==='input'&&x.attrs?.type==='checkbox'),
   save:byText('Save selected study events'),review:byClass('tutor-handoff-review')};
}
const snapshot={title:'Topology proof plan',objective:'Prove the separation lemma',
  checkpoints:[{checkpoint_id:CP,title:'Compactness',
    objective:'Finish the proof',prerequisite_checkpoint_ids:[],
    source_refs:[],mastery_criterion:'Write the complete argument'}]};
function reply(){
 return JSON.stringify({schema:'lemma.tutor_reply.v1',contract_version:1,
  plan_id:ID,checkpoint_id:CP,expected_plan_revision:3,
  events:[],card_proposals:[],amendment_proposal:{
    proposal_id:PROPOSAL,expected_revision:3,snapshot,
    change_summary:'Add a separation prerequisite',source:'student'}});
}
async function open(){
 await scope.Tutor.open({planId:ID,checkpointId:CP});
 const u=ui();
 u.input.value=reply();
 u.parse.events.click();
 return ui(); // parser dynamically adds the amendment action
}
function select(u){u.checkbox.checked=true;u.checkbox.events.change();}
async function attempt(u){return u.stage.events.click();}
(async()=>{
 assert.equal(scope.Tutor.ready,false);
 let u=await open();
 assert.equal(u.stage.disabled,true,'proposal is not staged merely by parsing');
 assert.equal(staged.length,0);
 select(u);
 assert.equal(u.stage.disabled,false);
 assert.equal(u.save.disabled,true,'amendment selection must not enable event saving');
 assert.equal(staged.length,0,'selection is not student approval');
 await attempt(u);
 assert.equal(staged.length,1,'explicit stage action delegates only to StudyPlan');
 assert.equal(staged[0].proposalId,PROPOSAL,'original proposal ID survives stage');
 assert.equal(staged[0].planId,ID);
 assert.equal(staged[0].expectedRevision,3);
 assert.equal(staged[0].contextId,CONTEXT);
 assert.equal(staged[0].contextRevision,2);
 assert.equal(staged[0].source,'tutor_handoff.v1',
   'untrusted tutor source may not impersonate the student');
 assert.equal(staged[0].title,'Topology proof plan');
 assert.deepEqual(staged[0].snapshot,snapshot);
 assert.equal(u.checkbox.disabled,true,'confirmed proposal cannot restage in same sheet');
 assert.equal(u.stage.disabled,true);
 assert.match(u.status.textContent,/No plan was approved or published/);
 assert.equal(approvals.length,0);
 assert.equal(published.length,0);
 assert.equal(events.length,0);

 // Ambiguous local write response retains the same UUID and complete payload.
 u=await open();select(u);failOnce=true;
 await attempt(u);
 assert.equal(staged.length,2);
 assert.match(u.status.textContent,/NOT confirmed/);
 assert.equal(u.stage.disabled,false);
 await attempt(u);
 assert.equal(staged.length,3);
 assert.equal(staged[2].proposalId,staged[1].proposalId);
 assert.deepEqual(staged[2],staged[1],'retry never changes student-reviewed payload');
 assert.match(u.status.textContent,/unapproved amendment draft/);

 // T3f: a new hint or attempt changes the consented proof packet even when
 // the plan and accepted context revisions remain identical.
 const changedStates=[
  ['hint',()=>{hintLevel=2;},()=>{hintLevel=1;}],
  ['session',()=>{sessionId=PROPOSAL;},()=>{sessionId=OWNER;}],
  ['attempt',()=>{attemptId=PROPOSAL;},()=>{attemptId=null;}]
 ];
 for(const [label,change,reset] of changedStates){
  u=await open();select(u);change();
  await attempt(u);
  assert.equal(staged.length,3,'stale '+label+' must not stage an amendment');
  assert.match(u.status.textContent,/stale_study_context/);
  assert.equal(u.checkbox.checked,true,'failed selection remains for explicit re-review');
  reset();
 }

 u=await open();select(u);
 revision=4;await attempt(u);
 assert.equal(staged.length,3);
 assert.match(u.status.textContent,/stale_plan_revision/);
 revision=3;

 u=await open();select(u);
 contextRevision=3;await attempt(u);
 assert.equal(staged.length,3,'accepted context revision mismatch blocks draft');
 contextRevision=2;

 u=await open();select(u);
 checkpoint='different-proof';await attempt(u);
 assert.equal(staged.length,3);
 checkpoint=CP;

 u=await open();select(u);
 account.user={id:otherOwner};await attempt(u);
 assert.equal(staged.length,3,'owner switch blocks draft');
 account.user={id:OWNER};

 u=await open();select(u);
 app.workspaceRevision=2;await attempt(u);
 assert.equal(staged.length,3,'workspace switch blocks draft');
 app.workspaceRevision=1;

 u=await open();select(u);
 app.workspaceBlocked=true;await attempt(u);
 assert.equal(staged.length,3,'blocked workspace cannot stage draft');
 app.workspaceBlocked=false;

 u=await open();select(u);
 assert.equal(typeof notifyIdentityChange,'function');
 notifyIdentityChange();
 await attempt(u);
 assert.equal(staged.length,3,'same-user relogin must invalidate draft selection');
 assert.match(u.status.textContent,/account or workspace changed/);

 u=await open();select(u);
 u.input.value='{}';u.input.events.input();
 await attempt(u);
 assert.equal(staged.length,3,'modified tutor reply revokes consent');
 assert.equal(u.review.children.length,0,'edited reply removes every reviewed proposal');

 assert.equal(approvals.length,0,'never invoke student approval API');
 assert.equal(published.length,0,'never publish on behalf of the student');
 assert.equal(events.length,0,'amendment does not automatically record events');
 console.log('PASS TUTOR-01 T3f: explicit amendment staging, proof/hint/session freshness, stable retry and no approval');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
