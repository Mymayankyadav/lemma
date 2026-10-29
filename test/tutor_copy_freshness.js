'use strict';
// TUTOR-01 T3g: a student must not copy a stale frozen proof packet to another
// tutor after another device changes the accepted plan/proof/session. Synthetic
// VM only; this is not an authenticated production or cross-model T4 test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const planId = '00000000-0000-4000-8000-000000000001';
const ownerId = '00000000-0000-4000-8000-000000000002';
const contextId = '00000000-0000-4000-8000-000000000003';
const attemptId = '00000000-0000-4000-8000-000000000004';
const sessionId = '00000000-0000-4000-8000-000000000005';
const changedId = '00000000-0000-4000-8000-000000000006';
const hintId = '00000000-0000-4000-8000-000000000007';
const cp = 'compactness-open-cover-proof';
let dialog, onRead, failRead = false, copyAvailable = true;
let identityChanged, reads = 0;
const copies = [];
const app = {workspaceRevision:1,workspaceBlocked:false};
const account = {
  user:{id:ownerId},client:{},
  onIdentityChange(fn){identityChanged=fn;}
};
const online = {onLine:true};
let state;
function reset(){
  state = {planId,planRevision:3,contextId,contextRevision:2,
    checkpoint:{id:cp,objective:'Prove the compact Hausdorff theorem',status:'in_progress'},
    sessionId,hintLevel:1,lastHint:{eventId:hintId,level:1},
    lastAttempt:{eventId:attemptId,text:'I can separate x from one point, not all of K.'},
    sourceRefs:['topology-notes:section-3.2']};
  app.workspaceRevision=1;app.workspaceBlocked=false;
  account.user={id:ownerId};account.client={};
  online.onLine=true;onRead=null;failRead=false;copyAvailable=true;
  copies.length=0;reads=0;
}
function h(tag,attrs,...kids){
  const obj={tag,attrs:attrs||{},kids,children:[],textContent:attrs?.text||'',
    value:'',disabled:!!attrs?.disabled,checked:!!attrs?.checked,events:{},
    addEventListener(name,fn){this.events[name]=fn;},
    append(...els){this.children.push(...els);},
    replaceChildren(...els){this.children=els;}};
  if(attrs?.onclick)obj.events.click=attrs.onclick;
  return obj;
}
const plan={
  async activeContext(selection){
    assert.equal(selection?.planId,planId);
    assert.equal(selection?.checkpointId,cp,'reads must retain the selected nondefault checkpoint');
    reads++;
    if(failRead)throw Error('Cloud read unavailable');
    const snapshot=JSON.parse(JSON.stringify(state));
    if(onRead){const fn=onRead;onRead=null;await Promise.resolve();fn();}
    return snapshot;
  }
};
const scope=vm.createContext({TextEncoder,h,App:app,LemmaAccount:account,
  StudyPlan:plan,navigator:online,
  Sheets:{open(options){dialog=options;return {close(){}};}},
  copyText:async (text,element)=>{
    copies.push({text,element});
    return copyAvailable;
  }});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+
  '\nglobalThis.Handoff=TutorHandoff;',scope);
function walk(node,out=[]){
  if(!node||typeof node!=='object')return out;
  out.push(node);
  for(const item of [...(node.kids||[]),...(node.children||[])])
    walk(item,out);
  return out;
}
async function open(){
  await scope.Handoff.open({planId,checkpointId:cp});
  const nodes=walk(dialog.body);
  const get=name=>nodes.find(n=>n.attrs?.class===name);
  const button=nodes.find(n=>n.attrs?.text==='Copy packet');
  assert.ok(button,'missing explicit copy action');
  return {button,packet:get('tutor-handoff-packet'),
    status:get('tutor-handoff-status')};
}
async function rejectCopy(label,change,pattern){
  reset();
  const ui=await open();
  assert.match(ui.packet.value,/separate x from one point/);
  change();
  await ui.button.events.click();
  assert.equal(copies.length,0,label+': stale packet must never reach clipboard');
  assert.equal(ui.packet.value,'',label+': invalidate manually selectable old packet');
  assert.equal(ui.button.disabled,true,label+': require a fresh handoff');
  assert.match(ui.status.textContent,pattern,label+': explain failure');
}
(async()=>{
  reset();
  assert.equal(scope.Handoff.ready,false,'real T4 remains unaccepted');
  let ui=await open();
  const original=ui.packet.value;
  await ui.button.events.click();
  assert.equal(copies.length,1);
  assert.equal(copies[0].text,original,'copy the exact approved packet');
  assert.match(ui.status.textContent,/Copied the verified current/);
  assert.equal(ui.button.disabled,false);
  assert.equal(reads,2,'one read to open and a fresh read before copy');

  await rejectCopy('plan revision',()=>{state.planRevision++;},/stale_plan_revision/);
  await rejectCopy('new approved plan',()=>{state.planId=changedId;},/stale_plan_revision/);
  await rejectCopy('checkpoint focus',()=>{state.checkpoint.id='new-proof';},/stale_plan_revision/);
  await rejectCopy('new attempt',()=>{state.lastAttempt.eventId=changedId;},/stale_study_context/);
  await rejectCopy('new hint',()=>{state.hintLevel=2;},/stale_study_context/);
  await rejectCopy('different hint at same level',()=>{state.lastHint.eventId=changedId;},
    /stale_study_context/);
  await rejectCopy('new session',()=>{state.sessionId=changedId;},/stale_study_context/);
  await rejectCopy('context revision',()=>{state.contextRevision++;},/stale_study_context/);
  await rejectCopy('new source',()=>{state.sourceRefs.push('new-source');},/stale_study_context/);
  await rejectCopy('checkpoint completed',()=>{state.checkpoint.status='demonstrated';},/stale_study_context/);
  await rejectCopy('same owner relogin',()=>identityChanged(),/account or workspace changed/);
  await rejectCopy('client replacement',()=>{account.client={};},/account or workspace changed/);
  await rejectCopy('owner switch during read',()=>{onRead=()=>{account.user={id:changedId};};},
    /account or workspace changed/);
  await rejectCopy('workspace switch during read',()=>{onRead=()=>{app.workspaceRevision++;};},
    /account or workspace changed/);
  await rejectCopy('workspace blocked',()=>{app.workspaceBlocked=true;},/account or workspace changed/);
  await rejectCopy('offline',()=>{online.onLine=false;},/Offline/);
  await rejectCopy('unavailable context',()=>{failRead=true;},/Cloud read unavailable/);

  reset();
  ui=await open();
  copyAvailable=false;
  await ui.button.events.click();
  assert.equal(copies.length,1,'validated fallback may select current text');
  assert.equal(ui.packet.value.length>0,true,'retain current packet for manual copy');
  assert.equal(ui.button.disabled,false);
  assert.match(ui.status.textContent,/clipboard unavailable/i);
  console.log('PASS TUTOR-01 T3g: fresh packet copy, stale/no-copy, identity, offline and fallback');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
