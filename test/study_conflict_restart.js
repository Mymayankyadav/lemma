'use strict';
// PLAN-01 P4c1: conflicting approval is archived, never silently rebased.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {indexedDB,IDBObjectStore}=require('fake-indexeddb');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const PLAN='00000000-0000-4000-8000-000000000003';
const PROPOSAL='00000000-0000-4000-8000-000000000004';
let owner=A,online=true,notify=()=>{},pauseRead=async()=>{};
let serverRevision=2,latestContextId=null,latestContextRevision=null;
const rpc=[],reads=[],acceptedContext=[];
const base={checkpoints:Array.from({length:12},(_,i)=>({
 checkpoint_id:'cp-'+(i+1),title:'Checkpoint '+(i+1),
 objective:'Prove theorem '+(i+1),mastery_criterion:'Valid proof',
 prerequisite_checkpoint_ids:i?['cp-'+i]:[]
}))};
const copy=x=>JSON.parse(JSON.stringify(x));
const wanted=copy(base);
wanted.checkpoints[5].mastery_criterion='Explain all cases';
wanted.checkpoints.splice(3,0,{checkpoint_id:'cp-new',title:'Missing lemma',
 objective:'Build prerequisite',mastery_criterion:'Valid proof',
 prerequisite_checkpoint_ids:['cp-3']});
wanted.checkpoints.find(x=>x.checkpoint_id==='cp-4')
 .prerequisite_checkpoint_ids=['cp-3','cp-new'];
const server=copy(base);
server.checkpoints[5].objective='Server updated objective';
const versions=()=>({
 1:{revision:1,context_id:null,context_revision:null,snapshot:base},
 2:{revision:2,context_id:latestContextId,
   context_revision:latestContextRevision,snapshot:server}
});
const client={
 from(table){const q={
  filters:[],select(){return this},eq(k,v){this.filters.push([k,v]);return this},
  limit(){return this},order(){return this},
  setHeader(k,v){
   assert.equal(k,'Authorization');assert.equal(v,'Bearer owner-token');
   const filters=[...this.filters];reads.push({table,filters});
   return Promise.resolve().then(async()=>{
    await pauseRead(table);
    const all=table==='study_plans'?
      [{id:PLAN,revision:serverRevision}]:
      table==='study_plan_versions'?Object.values(versions()):[];
    return {data:all.filter(r=>filters.every(([key,val])=>
      key==='user_id'?val===A:
      key==='plan_id'?val===PLAN:r[key]===val))};
   });
  }
 };return q;},
 rpc(name,args){
  rpc.push({name,args});
  return {setHeader(k,v){
   assert.equal(k,'Authorization');assert.equal(v,'Bearer owner-token');
   return Promise.resolve({data:null,error:{message:'stale_plan_revision'}});
  }};
 }
};
const scope=vm.createContext({
 LemmaAccount:{get user(){return owner?{id:owner}:null},
  get client(){return client},onIdentityChange(fn){notify=fn}},
 LemmaCloud:{async accountToken(c,u){
  assert.equal(c,client);assert.equal(u,owner);return 'owner-token';
 }},
 LemmaCloudBridge:{async readAcceptedContext(id,rev){
  acceptedContext.push([id,rev]);return {context_id:id,revision:rev};
 }},
 indexedDB,IDBObjectStore,crypto:webcrypto,structuredClone,Date,
 get navigator(){return {onLine:online}}
});
vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+
 '\nglobalThis.api=StudyPlan;',scope);
const api=scope.api;
(async()=>{
 assert.equal(api.ready,false);
 // Migrate an existing v2 local DB with no conflict_archive store.
 const legacy=await new Promise((resolve,reject)=>{
  const req=indexedDB.open('lemma-plan-drafts-v1-'+A,2);
  req.onupgradeneeded=()=>{
   req.result.createObjectStore('drafts',{keyPath:'planId'});
   req.result.createObjectStore('receipts',{keyPath:'planId'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });legacy.close();
 const pending=await api.savePlanDraft({planId:PLAN,expectedRevision:1,
  title:'Topology',objective:'Prove compactness',snapshot:wanted,
  changeSummary:'Add missing prerequisite',source:'Claude',proposalId:PROPOSAL});
 const approved=await api.approvePlanDraft(PLAN,pending.localRevision,true);
 const rejected=await api.submitApprovedPlanDraft(PLAN);
 assert.equal(rejected.status,'conflict');
 assert.equal((await api.readPlanDraft(PLAN)).status,'needs_review');
 assert.equal(rpc.length,1,'only the original user-approved publication tried an RPC');
 const evidenceBefore=JSON.stringify(await api.readPlanDraft(PLAN));
 const review=await api.reviewConflictedAmendment(PLAN);
 assert.equal(review.status,'review_conflict');
 assert.equal(review.originalRequestId,approved.requestId);
 assert.equal(review.originalRevision,1);
 assert.equal(review.currentRevision,2);
 assert.deepEqual([...review.proposedChanges.added],['cp-new']);
 assert.deepEqual([...review.serverChanges.modified.map(x=>x.checkpointId)],['cp-6']);
 assert.deepEqual([...review.overlapIds],['cp-6'],
  'both tutor draft and later server edit changed cp-6');
 assert.deepEqual([...review.latestComparison.requiresReassessment],['cp-6']);
 assert.equal(JSON.stringify(await api.readPlanDraft(PLAN)),evidenceBefore,
  'preview never alters previously approved intent');
 assert.equal(await api.readConflictArchive(PLAN,approved.requestId),null);
 assert.ok(reads.every(x=>x.filters.some(([k,v])=>k==='user_id'&&v===A)));
 assert.equal(rpc.length,1,'review never writes to cloud');
 await assert.rejects(api.restartConflictedAmendment(PLAN,review,false),
  /Explicit student conflict restart required/);
 await assert.rejects(api.restartConflictedAmendment(PLAN,
  {...review,currentRevision:3},true),/Conflict changed; reopen/);
 assert.equal(JSON.stringify(await api.readPlanDraft(PLAN)),evidenceBefore);
 online=false;
 await assert.rejects(api.reviewConflictedAmendment(PLAN),/offline/);
 online=true;
 serverRevision=3;
 await assert.rejects(api.restartConflictedAmendment(PLAN,review,true),
  /Immutable study plan version unavailable|Conflict changed/);
 serverRevision=2;
 // Identity switch mid-read must stop before disclosing the old owner's diff.
 pauseRead=async table=>{
  if(table==='study_plans'){pauseRead=async()=>{};owner=B;notify();}
 };
 await assert.rejects(api.reviewConflictedAmendment(PLAN),/Account changed/);
 owner=A;notify();
 // Atomic archive+replacement: even a failed archive write preserves
 // original request and does not partially restore unapproved draft.
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,...args){
  const req=put.call(this,value,...args);
  if(value?.archivedAt) req.addEventListener('success',()=>this.transaction.abort());
  return req;
 };
 await assert.rejects(api.restartConflictedAmendment(PLAN,review,true),
  /Plan draft transaction (?:not saved|failed)/);
 IDBObjectStore.prototype.put=put;
 assert.equal(JSON.stringify(await api.readPlanDraft(PLAN)),evidenceBefore);
 assert.equal(await api.readConflictArchive(PLAN,approved.requestId),null);
 // Student explicitly restarts from the now reviewed latest server state.
 const restarted=await api.restartConflictedAmendment(PLAN,review,true);
 assert.equal(restarted.status,'draft');
 assert.equal(restarted.expectedRevision,2);
 assert.equal(restarted.localRevision,approved.localRevision+1);
 assert.notEqual(restarted.draftId,approved.draftId);
 assert.equal(restarted.requestId,undefined);
 assert.equal(restarted.approvedBy,undefined);
 assert.equal(restarted.approvedAt,undefined);
 assert.deepEqual([...restarted.snapshot.checkpoints.map(x=>x.checkpoint_id)],
  wanted.checkpoints.map(x=>x.checkpoint_id));
 const archived=await api.readConflictArchive(PLAN,approved.requestId);
 assert.equal(archived.requestId,approved.requestId);
 assert.equal(archived.status,'needs_review');
 assert.equal(archived.approvedBy,'student');
 assert.equal(archived.restartedAsDraftId,restarted.draftId);
 assert.equal(archived.restartExpectedRevision,2);
 assert.equal(archived.snapshot.checkpoints.length,13);
 assert.equal(await api.reviewConflictedAmendment(PLAN).then(
  ()=>false,()=>true),true,'conflict is no longer active after explicit restart');
 await assert.rejects(api.restartConflictedAmendment(PLAN,review,true),
  /No rejected student-approved amendment/);
 await assert.rejects(api.submitApprovedPlanDraft(PLAN),/Explicit student approval/);
 assert.equal(rpc.length,1,'restarting does not publish or replay events');
 // New preview is pinned to the latest server and requires a fresh student
 // approval with a distinct immutable publication request ID.
 const next=await api.reviewPendingAmendment(PLAN);
 assert.equal(next.status,'review');
 assert.equal(next.expectedRevision,2);
 assert.deepEqual([...next.diff.added],['cp-new']);
 const approval=await api.approvePlanDraft(PLAN,restarted.localRevision,true);
 assert.notEqual(approval.requestId,approved.requestId);
 assert.equal(rpc.length,1);
 owner=B;notify();
 assert.equal(await api.readPlanDraft(PLAN),null);
 assert.equal(await api.readConflictArchive(PLAN,approved.requestId),null);
 owner=A;notify();
 assert.equal((await api.readConflictArchive(PLAN,approved.requestId)).requestId,
  approved.requestId,'account-local archived proof is durable after switching');
 console.log('PASS PLAN-01 P4c1: conflict preview, 12 checkpoints, overlap, v2->v3 upgrade, atomic rollback/archive, explicit restart, account isolation and no silent cloud write');
})().catch(error=>{console.error('FAIL PLAN-01 P4c1: '+error.stack);process.exitCode=1});
