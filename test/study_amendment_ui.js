'use strict';
// PLAN-01 P4b2: visual review cannot silently approve or publish study plans.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001';
const P='00000000-0000-4000-8000-000000000002';
let user=A,workspace=1,blocked=false,localStatus='draft',reviewStatus='review';
let approvals=0,submissions=0,reviews=0,reads=0,writes=0,conflictReads=0,restarts=0;
let onReview=()=>{},onConflict=()=>{},restartError=false;
const context={planId:P,planRevision:2,
 checkpoint:{id:'proof-3',title:'Proof checkpoint',
 objective:'Construct a proof',status:'in_progress'},
 hintLevel:1,sourceRefs:[],lastAttempt:null};
function h(tag,attrs={},...children) {
 const x={tag,attrs,children:[],events:{},textContent:attrs.text||'',
   isConnected:false,hidden:false,disabled:false,value:'',
   append(...values){this.children.push(...values.filter(Boolean))},
   replaceChildren(...values){this.children=values.filter(Boolean)},
   addEventListener(name,fn){this.events[name]=fn},
   querySelectorAll(){return []}};
 x.append(...children);if(attrs.onclick)x.events.click=attrs.onclick;
 return x;
}
const walk=x=>[x,...(x?.children||[]).flatMap(walk)];
const find=(root,predicate)=>walk(root).find(predicate);
const btn=(root,label)=>find(root,x=>x.tag==='button'&&x.textContent===label);
const status=(root)=>find(root,x=>x.attrs.class==='study-amendment-status');
const diff={added:['cp-new'],removed:[],
 modified:[{checkpointId:'cp-4',fields:['objective'],
  addedPrerequisites:['cp-new'],removedPrerequisites:[],requiresReassessment:false}],
 unchanged:['cp-1','cp-2','cp-3'],planFieldsChanged:[],
 reordered:false,requiresReassessment:[]};
const mockReview=()=>({status:reviewStatus,planId:P,expectedRevision:2,
 expectedLocalRevision:1,draftId:'00000000-0000-4000-8000-000000000003',
 changeSummary:'Insert an explicit prerequisite',source:'Claude',diff});
const plan={
 ready:false,async activeContext(){return context},
 async readPlanDraft(){reads++;return localStatus?{status:localStatus}:null},
 async reviewPendingAmendment(){reviews++;await onReview();return mockReview()},
 async reviewConflictedAmendment(planId){
  assert.equal(planId,P);conflictReads++;await onConflict();
  return {status:'review_conflict',planId:P,
   originalRequestId:'00000000-0000-4000-8000-000000000010',
   originalRevision:1,originalLocalRevision:2,currentRevision:2,
   changeSummary:'Add prerequisite before current proof',
   proposedChanges:diff,serverChanges:{...diff,added:[],removed:[],modified:[]},
   latestComparison:{...diff,requiresReassessment:['cp-4']},
   overlapIds:['cp-4']};
 },
 async restartConflictedAmendment(planId,review,consent){
  assert.equal(planId,P);assert.equal(consent,true);
  assert.equal(review.status,'review_conflict');
  restarts++;
  if(restartError)throw Error('Conflict changed; reopen amendment review');
  localStatus='draft';return {status:'draft'};
 },
 async approvePlanDraft(planId,revision,consent){
  assert.equal(planId,P);assert.equal(revision,1);assert.equal(consent,true);
  approvals++;localStatus='approved_pending';return {status:localStatus}
 },
 async submitApprovedPlanDraft(planId){
  assert.equal(planId,P);submissions++;return {status:'confirmed',revision:3}
 },
 async recordEvent(){writes++;throw Error('event write unexpectedly used')}
};
const scope=vm.createContext({
 h,fill:(node,...kids)=>{node.replaceChildren(...kids);return node},
 App:{get workspaceRevision(){return workspace},get workspaceBlocked(){return blocked},go(){}},
 LemmaAccount:{get user(){return user?{id:user}:null}},
 StudyPlan:plan,crypto:webcrypto,Promise
});
vm.runInContext(fs.readFileSync('src/app/view_study.js','utf8')+
 '\nglobalThis.ui=StudyView;',scope);
const ui=scope.ui;
const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
async function mount() {
 const root=ui.render({planId:P,checkpointId:'proof-3'});
 root.isConnected=true;
 await flush();
 assert.ok(btn(root,'Review pending amendment') || localStatus==='needs_review');
 return root;
}
(async()=>{
 assert.equal(ui.ready,true,'Study is ready after P5 acceptance');
 let root=await mount();
 assert.equal(approvals,0);assert.equal(submissions,0);assert.equal(reviews,0);
 assert.equal(reads,1,'opening uses owner-local state, no cloud amendment read');
 assert.match(status(root).textContent,/available to review/);
 await btn(root,'Review pending amendment').events.click();
 assert.equal(reviews,1);
 assert.equal(approvals,0);assert.equal(submissions,0);
 assert.ok(walk(root).some(n=>n.textContent.includes('cp-new')));
 assert.ok(walk(root).some(n=>n.textContent.includes('Insert an explicit prerequisite')));
 assert.ok(btn(root,'Approve these displayed changes'));
 assert.match(status(root).textContent,/Nothing has been approved/);

 await btn(root,'Approve these displayed changes').events.click();
 assert.equal(reviews,2,'approval rechecks exact server and local draft revision');
 assert.equal(approvals,1);
 assert.equal(submissions,0,'approval cannot submit automatically');
 assert.match(status(root).textContent,/another click/);
 assert.ok(btn(root,'Submit previously approved amendment'));
 await btn(root,'Submit previously approved amendment').events.click();
 assert.equal(submissions,1);
 assert.match(status(root).textContent,/revision 3 confirmed/);
 assert.equal(writes,0);
 root.isConnected=false;

 // A previously approved intent can be safely retried after reload, without
 // re-approval or a request while loading the page.
 localStatus='approved_pending';
 root=await mount();
 assert.equal(btn(root,'Review pending amendment').hidden,true);
 assert.ok(btn(root,'Submit previously approved amendment'));
 assert.equal(submissions,1,'reload does not automatically publish');
 root.isConnected=false;

 localStatus='needs_review';
 root=await mount();
 assert.equal(btn(root,'Review pending amendment').hidden,true);
 assert.equal(!!btn(root,'Submit previously approved amendment'),false);
 assert.match(status(root).textContent,/No automatic rebase/);
 assert.equal(conflictReads,0,'reloading rejected approval cannot fetch or restart automatically');
 assert.ok(btn(root,'Inspect rejected amendment'));
 await btn(root,'Inspect rejected amendment').events.click();
 assert.equal(conflictReads,1);
 assert.equal(restarts,0,'inspection cannot restart an amendment');
 assert.equal(approvals,1);
 assert.ok(walk(root).some(x=>x.textContent.includes('cp-4')));
 assert.ok(walk(root).some(x=>x.textContent.includes('special care')));
 assert.ok(btn(root,'Restart as unapproved draft'));
 assert.match(status(root).textContent,/Nothing has been restarted/);
 restartError=true;
 await btn(root,'Restart as unapproved draft').events.click();
 assert.equal(localStatus,'needs_review','failed restart leaves old approval intact');
 assert.ok(btn(root,'Inspect rejected amendment'),'stale review can be reopened');
 restartError=false;
 await btn(root,'Inspect rejected amendment').events.click();
 await btn(root,'Restart as unapproved draft').events.click();
 assert.equal(localStatus,'draft');
 assert.equal(restarts,2,'restart is a second explicit action');
 assert.equal(approvals,1,'old approval never transferred');
 assert.equal(submissions,1,'restart cannot republish');
 assert.equal(btn(root,'Review pending amendment').hidden,false);
 assert.match(status(root).textContent,/fresh unapproved/);
 root.isConnected=false;

 // Switching identities during remote conflict inspection cannot reveal
 // the rejected owner's comparison or leave a restart action enabled.
 localStatus='needs_review';
 let conflictDone;onConflict=()=>new Promise(resolve=>{conflictDone=resolve});
 root=await mount();
 const inspecting=btn(root,'Inspect rejected amendment').events.click();
 await flush();
 user='00000000-0000-4000-8000-000000000005';workspace++;
 conflictDone();await inspecting;
 assert.equal(!!btn(root,'Restart as unapproved draft'),false);
 assert.equal(restarts,2);
 root.isConnected=false;user=A;workspace++;onConflict=()=>{};

 localStatus='draft';reviewStatus='stale';
 root=await mount();
 await btn(root,'Review pending amendment').events.click();
 assert.equal(!!btn(root,'Approve these displayed changes'),false);
 assert.match(status(root).textContent,/nothing was approved/);
 root.isConnected=false;

 // Identity change while preview is in flight prevents old owner's review.
 reviewStatus='review';
 let done;onReview=()=>new Promise(resolve=>{done=resolve});
 root=await mount();
 const waiting=btn(root,'Review pending amendment').events.click();
 await flush();
 user='00000000-0000-4000-8000-000000000004';workspace++;
 done();await waiting;
 assert.equal(!!btn(root,'Approve these displayed changes'),false);
 assert.equal(approvals,1);
 assert.equal(submissions,1);
 assert.equal(writes,0);
 console.log('PASS PLAN-01 P4b2/P4c2: explicit diff before consent, separate approval/submit, pending recovery, stale and identity guards, no implicit writes');
})().catch(e=>{console.error('FAIL P4b2: '+e.stack);process.exitCode=1});
