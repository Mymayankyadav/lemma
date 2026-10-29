'use strict';
// TUTOR-01 T4a: deliberately entered, unready tutor acceptance contract.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const planId = '00000000-0000-4000-8000-000000000001';
const ownerId = '00000000-0000-4000-8000-000000000002';
const checkpointId = 'accepted-checkpoint';
const events = [];
let dialogs = 0, reads = 0, writes = 0, duringRead = null;
const client = {};
const state = {
  planId, planRevision:2, contextId:null,contextRevision:null,sessionId:null,
  checkpoint:{id:checkpointId, objective:'Continue my unfinished proof',status:'in_progress'},
  lastAttempt:{eventId:'00000000-0000-4000-8000-000000000003',text:'An unfinished proof'},
  hintLevel:1, sourceRefs:[],citedExcerpts:[]
};
function h(tag,attrs,...kids) {
  return {tag,attrs:attrs || {},kids,children:[],value:'',disabled:!!attrs?.disabled,
    checked:!!attrs?.checked,textContent:attrs?.text || '',events:{},
    addEventListener(type,fn){this.events[type]=fn;},
    append(...xs){this.children.push(...xs);},
    replaceChildren(...xs){this.children=xs;}};
}
function descendants(node,out=[]) {
  if (!node || typeof node!=='object') return out;
  out.push(node);
  for (const c of [...(node.kids || []),...(node.children || [])])
    descendants(c,out);
  return out;
}
const scope = vm.createContext({TextEncoder,h,
  StudyPlan:{ready:true,async activeContext({planId:p,checkpointId:c}) {
    reads++;
    assert.equal(p,planId);
    assert.equal(c,checkpointId);
    if(duringRead){const f=duringRead;duringRead=null;f();}
    return state;
  },async recordEvent(){writes++;}},
  StudyView:{ready:true},
  App:{workspaceRevision:1,workspaceBlocked:false},
  LemmaAccount:{client,user:{id:ownerId},
    onIdentityChange(callback){events.push(callback);}},
  navigator:{onLine:true},
  Sheets:{open(options){dialogs++;return {body:options.body};}},
  copyText:async()=>true
});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+
  '\nglobalThis.TutorAPI = TutorHandoff;',scope);
const api = scope.TutorAPI;
(async()=>{
  assert.equal(api.ready,false,'acceptance preview does not release tutor to all');
  const invalid = (options,pattern) =>
    assert.rejects(api.openForAcceptance(options),pattern);
  scope.StudyView.ready=false;
  await invalid({planId,checkpointId},/Study acceptance/);
  scope.StudyView.ready=true;
  scope.StudyPlan.ready=false;
  await invalid({planId,checkpointId},/Study acceptance/);
  scope.StudyPlan.ready=true;
  await invalid({planId:'bad',checkpointId},/Select an approved checkpoint/);
  await invalid({planId,checkpointId:'bad\n'},/Select an approved checkpoint/);
  const signedIn = scope.LemmaAccount.user;
  scope.LemmaAccount.user=null;
  await invalid({planId,checkpointId},/Sign in/);
  scope.LemmaAccount.user=signedIn;
  scope.navigator.onLine=false;
  await invalid({planId,checkpointId},/online study state/);
  scope.navigator.onLine=true;
  scope.App.workspaceBlocked=true;
  await invalid({planId,checkpointId},/workspace is unavailable/);
  scope.App.workspaceBlocked=false;
  assert.equal(dialogs,0,'no sheet before eligibility');
  duringRead=()=>{scope.App.workspaceRevision=2;};
  await invalid({planId,checkpointId},/workspace changed/);
  assert.equal(dialogs,0,'workspace race cannot open a sheet');
  scope.App.workspaceRevision=1;
  duringRead=()=>{events[0]();};
  await invalid({planId,checkpointId},/workspace changed/);
  assert.equal(dialogs,0,'same-owner re-login invalidates opening consent');
  duringRead=()=>{scope.LemmaAccount.client={};};
  await invalid({planId,checkpointId},/workspace changed/);
  assert.equal(dialogs,0,'identity client swap cannot open a sheet');
  scope.LemmaAccount.client=client;
  let opened=await api.openForAcceptance({planId,checkpointId});
  assert.equal(dialogs,1);
  let nodes=descendants(opened.body);
  assert.ok(nodes.some(x=>x.attrs?.class==='tutor-handoff-acceptance-notice' &&
    /not a released feature/.test(x.textContent)),'clear preview warning');
  const packet=nodes.find(x=>x.attrs?.class==='tutor-handoff-packet');
  assert.match(packet.value,/An unfinished proof/);
  assert.match(packet.value,/"hint_level": 1/);
  assert.equal(writes,0,'preview, packet and rendering cannot save study evidence');
  assert.ok(reads>=4,'approved context refreshed before showing preview');
  console.log('PASS TUTOR-01 T4a: readiness, identity, workspace, online, selected checkpoint, explicit preview and no implicit writes');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
