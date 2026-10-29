'use strict';
// TUTOR-01 T3a: no implicit writes, account/revision guards and retry IDs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const A='00000000-0000-4000-8000-000000000001';
const E1='00000000-0000-4000-8000-000000000002';
const E2='00000000-0000-4000-8000-000000000003';
const C1='00000000-0000-4000-8000-000000000004';
const owner='00000000-0000-4000-8000-000000000005';
const cp='compactness-open-cover-proof';
let dialog, revision=3, activeCheckpoint=cp, failSecond=false, afterContextRead=null;
let hintLevel=1, attemptId=E1, sessionId=owner, checkpointStatus='in_progress';
let contextId=null, contextRevision=null, lastFeedbackId=null, sourceRefs=[];
let reflectOwnWrites=false,externalAfterFirst=false;
const calls=[];
const app={workspaceRevision:1,workspaceBlocked:false};
let signalIdentityChange=null;
const account={user:{id:owner},client:null,
 onIdentityChange(fn){signalIdentityChange=fn;}};
const client={rpc(name,args){
 calls.push({name,args:JSON.parse(JSON.stringify(args))});
 return {setHeader:async(header,auth)=>{
  assert.equal(header,'Authorization');
  assert.equal(auth,'Bearer mock-token');
  if(failSecond && args.p_event_id===E2) {
   failSecond=false;
   if(reflectOwnWrites)hintLevel=args.p_payload.level;
   throw Error('Network interrupted after a possible server write');
  }
  if(reflectOwnWrites){
   if(sessionId===null)sessionId=owner;
   if(['attempt','proof_step'].includes(args.p_event_type))attemptId=args.p_event_id;
   if(args.p_event_type==='hint')hintLevel=args.p_payload.level;
   if(externalAfterFirst && args.p_event_id===E1)
    attemptId='00000000-0000-4000-8000-000000000007';
  }
  return {data:{event:{eventId:args.p_event_id,sessionId:owner,
    seq:calls.length,planRevision:3},audit:{
    receiptId:args.p_event_id,planRevision:3,createdAt:'2026-10-28T17:00:00Z'}}};
 }};
}};
account.client=client;
const plan={
 async activeContext(selection){
  assert.equal(selection?.planId,A);assert.equal(selection?.checkpointId,cp);
  const snapshot={planId:A,planRevision:revision,contextId,contextRevision,
   checkpoint:{id:activeCheckpoint,objective:'Show compactness',status:checkpointStatus},
   sessionId,hintLevel,sourceRefs:[...sourceRefs],
   lastAttempt:attemptId ? {eventId:attemptId,text:'Partial proof'} : null,
   lastFeedback:lastFeedbackId ? {eventId:lastFeedbackId} : null};
  if(afterContextRead){
   const change=afterContextRead;afterContextRead=null;
   await Promise.resolve();
   change();
  }
  return snapshot;
 },
 async recordEvent(){throw Error('Unpaired StudyPlan.recordEvent must never be used');}
};
function h(tag,attrs,...kids){
 const obj={tag,attrs:attrs||{},kids,children:[],textContent:attrs?.text||'',
  value:'',disabled:!!attrs?.disabled,checked:!!attrs?.checked,events:{},
  addEventListener(k,fn){this.events[k]=fn;},
  append(...els){this.children.push(...els);},
  replaceChildren(...els){this.children=els;}};
 if(attrs?.onclick)obj.events.click=attrs.onclick;
 return obj;
}
const scope=vm.createContext({TextEncoder,h,App:app,LemmaAccount:account,StudyPlan:plan,
 LemmaCloud:{accountToken:async(c,u)=>{assert.equal(c,client);assert.equal(u,owner);return 'mock-token';}},
 Sheets:{open(options){dialog=options;return {close(){}};}},copyText:async()=>true});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+
 '\nglobalThis.Handoff = TutorHandoff;',scope);
function walk(n, acc=[]){
 if(!n||typeof n!=='object')return acc;
 acc.push(n);
 for(const item of [...(n.kids||[]),...(n.children||[])])
  Array.isArray(item)?item.forEach(x=>walk(x,acc)):walk(item,acc);
 return acc;
}
function ui(){
 const nodes=walk(dialog.body);
 const get=text=>nodes.find(n=>n.attrs?.text===text);
 const getClass=name=>nodes.find(n=>n.attrs?.class===name);
 return {input:getClass('tutor-handoff-reply'),
  parse:get('Review pasted reply'),save:get('Save selected study events'),
  status:getClass('tutor-handoff-status'),review:getClass('tutor-handoff-review')};
}
const payload=()=>JSON.stringify({
 schema:'lemma.tutor_reply.v1',contract_version:1,plan_id:A,checkpoint_id:cp,
 expected_plan_revision:3,
 events:[{event_id:E1,type:'attempt',source:'student',payload:{text:'The current proof stops here'}},
         {event_id:E2,type:'hint',payload:{level:2,text:'Try a finite subcover'}}],
 card_proposals:[{proposal_id:C1,type:'basic',title:'Compactness',
   front:'What is a compact set?',back:'Every open cover has a finite subcover.',
   tags:['topology'],requires:[],source_refs:[]}],amendment_proposal:null
});
function select(index){
 const checkbox=walk(dialog.body).filter(x=>x.tag==='input'&&x.attrs.type==='checkbox')[index];
 assert.ok(checkbox,'missing proposal checkbox '+index);
 checkbox.checked=true;
 checkbox.events.change();
 return checkbox;
}
async function open(){
 await scope.Handoff.open({planId:A,checkpointId:cp});
 const x=ui();
 x.input.value=payload();
 x.parse.events.click();
 return x;
}
(async()=>{
 assert.equal(scope.Handoff.ready,false,'still hidden until full tutor gate');
 let x=await open();
 assert.match(x.status.textContent,/None recorded/);
 assert.equal(x.save.disabled,true,'no consent, no save');
 assert.equal(calls.length,0);
 const cardOnly=select(2);
 assert.equal(x.save.disabled,true,'card consent must not enable evidence save');
 assert.equal(calls.length,0);
 cardOnly.checked=false;cardOnly.events.change();
 const first=select(0);
 assert.equal(x.save.disabled,false);
 await x.save.events.click();
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'record_tutor_evidence_with_receipt');
 assert.equal(calls[0].args.p_event_id,E1);
 assert.equal(calls[0].args.p_expected_plan_revision,3);
 assert.deepEqual(calls[0].args.p_payload,{text:'The current proof stops here'});
 assert.equal(Object.hasOwn(calls[0].args,'p_source'),false,
  'RPC hard-codes tutor provenance; no untrusted actor/source string is sent');
 assert.equal(first.disabled,true,'acknowledged event cannot be written twice');
 assert.equal(x.save.disabled,true);
 assert.equal(cardOnly.disabled,false,'no card silently approved');
 assert.match(x.status.textContent,/Recorded 1 selected study event/);

 // Ambiguous partial failure retains precisely the original UUID on retry.
 x=await open();
 select(0);select(1);
 failSecond=true;
 await x.save.events.click();
 assert.equal(calls.length,3);
 assert.equal(calls[1].args.p_event_id,E1);
 assert.equal(calls[2].args.p_event_id,E2);
 assert.match(x.status.textContent,/Recorded 1 event\(s\) so far/);
 assert.equal(x.save.disabled,false,'failed event still selectable');
 await x.save.events.click();
 assert.equal(calls.length,4);
 assert.equal(calls[3].args.p_event_id,E2,'retry original event ID, no new UUID');
 assert.deepEqual(calls[3].args,calls[2].args,'retry original RPC arguments');
 assert.equal(x.save.disabled,true);
 assert.match(x.status.textContent,/Recorded 1 selected/);

 // Active plan must be freshly inspected before each event write.
 x=await open();select(0);
 revision=4;
 await x.save.events.click();
 assert.equal(calls.length,4,'revision mismatch must block write');
 assert.match(x.status.textContent,/stale_plan_revision/);
 revision=3;

 x=await open();select(0);
 activeCheckpoint='a-different-checkpoint';
 await x.save.events.click();
 assert.equal(calls.length,4,'checkpoint mismatch must block write');
 activeCheckpoint=cp;

 x=await open();select(0);
 account.user={id:'00000000-0000-4000-8000-000000000006'};
 await x.save.events.click();
 assert.equal(calls.length,4,'account switch must block write');
 assert.match(x.status.textContent,/account or workspace changed/);
 account.user={id:owner};

 x=await open();select(0);
 app.workspaceRevision=2;
 await x.save.events.click();
 assert.equal(calls.length,4,'workspace switch must block write');
 app.workspaceRevision=1;

 x=await open();select(0);
 assert.equal(typeof signalIdentityChange,'function');
 signalIdentityChange(); // same owner logged out and back in, old consent expires
 await x.save.events.click();
 assert.equal(calls.length,4,'same-owner relogin cannot reuse old sheet selection');
 assert.match(x.status.textContent,/account or workspace changed/);

 // T3e: same-owner relogin DURING the asynchronous plan read must not
 // reuse the old sheet's selected-event consent with the new identity epoch.
 x=await open();select(0);
 afterContextRead=()=>{signalIdentityChange();};
 await x.save.events.click();
 assert.equal(calls.length,4,'post-read relogin cannot submit old tutor consent');
 assert.match(x.status.textContent,/account or workspace changed/);
 assert.equal(x.save.disabled,false,'failed selection retains its original event ID');

 // A workspace rotation during the same await must also fail before RPC.
 x=await open();select(0);
 afterContextRead=()=>{app.workspaceRevision=2;};
 await x.save.events.click();
 assert.equal(calls.length,4,'post-read workspace switch cannot submit old tutor consent');
 assert.match(x.status.textContent,/account or workspace changed/);
 app.workspaceRevision=1;

 // A changed account during the await must never submit the event either.
 x=await open();select(0);
 afterContextRead=()=>{account.user={id:'00000000-0000-4000-8000-000000000006'};};
 await x.save.events.click();
 assert.equal(calls.length,4,'post-read account switch cannot submit old tutor consent');
 assert.match(x.status.textContent,/account or workspace changed/);
 account.user={id:owner};

 // T3f: a stable plan ID/revision does not guarantee that the student is
 // still working on the same proof, hint, active session or accepted context.
 const changedStudyStates=[
  ['hint level',()=>{hintLevel=2;},()=>{hintLevel=1;}],
  ['new proof attempt',()=>{attemptId=E2;},()=>{attemptId=E1;}],
  ['new active session',()=>{sessionId=C1;},()=>{sessionId=owner;}],
  ['checkpoint completion',()=>{checkpointStatus='demonstrated';},
   ()=>{checkpointStatus='in_progress';}],
  ['accepted context',()=>{contextId=C1;contextRevision=2;},
   ()=>{contextId=null;contextRevision=null;}],
  ['new feedback',()=>{lastFeedbackId=E2;},()=>{lastFeedbackId=null;}],
  ['changed citations',()=>{sourceRefs=['new-accepted-section'];},
   ()=>{sourceRefs=[];}]
 ];
 for(const [label,change,reset] of changedStudyStates) {
  x=await open();const checkbox=select(0);change();
  await x.save.events.click();
  assert.equal(calls.length,4,label+' cannot reuse consent or send RPC');
  assert.match(x.status.textContent,/stale_study_context/,label);
  assert.equal(checkbox.checked,true,'unsaved event selection retained for '+label);
  assert.equal(x.save.disabled,false,'same event ID remains available for '+label);
  reset();
 }

 // Editing the reply invalidates review/consent and cannot keep old IDs.
 x=await open();select(0);
 x.input.value='{}';
 x.input.events.input();
 assert.equal(x.save.disabled,true);
 assert.equal(x.review.children.length,0);
 assert.equal(calls.length,4);

 // Stale reply ID/revision rejected before user could approve any item.
 x=await open();
 x.input.value=x.input.value.replace('"expected_plan_revision":3','"expected_plan_revision":2');
 x.parse.events.click();
 assert.equal(x.review.children.length,0);
 assert.equal(x.save.disabled,true);
 assert.equal(calls.length,4);
 // The first selected event may itself create a session and advance the
 // proof. Its original UUID is allowed as self-caused context, so the second
 // selected event must still be saved in the same deliberate action.
 sessionId=null;attemptId=C1;hintLevel=1;reflectOwnWrites=true;
 x=await open();select(0);select(1);
 const beforeBatch=calls.length;
 await x.save.events.click();
 assert.equal(calls.length,beforeBatch+2,'both explicitly selected events persist');
 assert.match(x.status.textContent,/Recorded 2 selected study event/);
 assert.equal(x.save.disabled,true);
 assert.equal(attemptId,E1);
 assert.equal(hintLevel,2);

 // A lost response may follow a server commit of the second event. The
 // retry must accept only this sheet's attempted IDs and reuse E2 unchanged.
 sessionId=null;attemptId=C1;hintLevel=1;
 x=await open();select(0);select(1);failSecond=true;
 const beforeRetry=calls.length;
 await x.save.events.click();
 assert.equal(calls.length,beforeRetry+2);
 assert.equal(hintLevel,2,'server committed the hint before response loss');
 assert.equal(x.save.disabled,false,'uncertain event remains selected');
 await x.save.events.click();
 assert.equal(calls.length,beforeRetry+3);
 assert.equal(calls.at(-1).args.p_event_id,E2);
 assert.deepEqual(calls.at(-1).args,calls.at(-2).args,'exact retry of uncertain hint');
 assert.equal(x.save.disabled,true);
 // Self-progress is not blanket permission for another device's new proof.
 // An unrelated event ID after the first save must stop the remaining batch.
 sessionId=null;attemptId=C1;hintLevel=1;externalAfterFirst=true;
 x=await open();select(0);const pendingSecond=select(1);
 const beforeExternal=calls.length;
 await x.save.events.click();
 assert.equal(calls.length,beforeExternal+1,'foreign proof event blocks second RPC');
 assert.match(x.status.textContent,/stale_study_context/);
 assert.equal(pendingSecond.checked,true,'uncommitted second selection retained');
 externalAfterFirst=false;
 reflectOwnWrites=false;sessionId=owner;attemptId=E1;hintLevel=1;
 console.log('PASS TUTOR-01 T3f: stale proof guards, own-batch retry, external interleaving rejection, no implicit approvals');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
