'use strict';
// PLAN-01 P2b: durable student consent and lost-response retry, no network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {indexedDB,IDBObjectStore}=require('fake-indexeddb');
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const id='00000000-0000-4000-8000-000000000003';
const proposal='00000000-0000-4000-8000-000000000004';
let current=a,online=false,notify=()=>{},dispatch=()=>({data:1});
const rpcCalls=[],tokens=[];
const client={
 rpc(name,args){
  rpcCalls.push({name,args});
  return {setHeader(k,v){
   assert.equal(k,'Authorization');
   assert.equal(v,'Bearer local-token');
   return Promise.resolve().then(()=>dispatch(name,args));
  }};
 }
};
const scope=vm.createContext({
 LemmaAccount:{get client(){return client;},
  get user(){return current?{id:current}:null;},
  onIdentityChange(fn){notify=fn;}},
 LemmaCloud:{async accountToken(c,u){
  assert.equal(c,client);tokens.push(u);return 'local-token';
 }},
 indexedDB,crypto:webcrypto,structuredClone,Date,
 get navigator(){return {onLine:online};}
});
const source=fs.readFileSync('src/app/study_plan.js','utf8');
function load(){vm.runInContext(source+'\nglobalThis.moduleStudy=StudyPlan;',scope);
 return scope.moduleStudy;}
const api=load();
const make=(over={})=>({planId:id,expectedRevision:0,expectedLocalRevision:0,
 title:'Synthetic topology',objective:'Give an exact proof',
 snapshot:{checkpoints:[{checkpoint_id:'proof-1',objective:'Prove the claim'}]},
 changeSummary:'Initial approved plan',source:'Claude',
 proposalId:proposal,...over});
(async()=>{
 // The first database is a v1 unapproved draft database from P2a. P2b must
 // upgrade it in place without destroying user data or losing consent.
 const oldDb=await new Promise((resolve,reject)=>{
  const req=indexedDB.open('lemma-plan-drafts-v1-'+a,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('drafts',{keyPath:'planId'});
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
 oldDb.close();

 assert.equal(api.ready,true);
 const draft=await api.savePlanDraft(make());
 assert.equal(draft.localRevision,1);
 assert.equal(draft.status,'draft');
 assert.equal(await api.readPlanReceipt(id),null);
 await assert.rejects(api.approvePlanDraft(id,1,false),/Explicit student approval/);
 await assert.rejects(api.approvePlanDraft(id,0,true),/Invalid plan draft revision/);
 await assert.rejects(api.submitApprovedPlanDraft(id),/Explicit student approval/);
 assert.equal(rpcCalls.length,0,'draft and rejection must make no cloud calls');
 const approved=await api.approvePlanDraft(id,1,true);
 assert.equal(approved.status,'approved_pending');
 assert.equal(approved.approvedBy,'student');
 assert.equal(approved.localRevision,2);
 assert.equal(approved.approvedFromLocalRevision,1);
 assert.match(approved.requestId,/^[a-f0-9-]{36}$/i);
 const same=await api.approvePlanDraft(id,1,true);
 assert.equal(same.requestId,approved.requestId,'student approval retry keeps one key');
 await assert.rejects(api.savePlanDraft(make({
  expectedLocalRevision:2,proposalId:'00000000-0000-4000-8000-000000000005'
 })),/already under approval/);
 await assert.rejects(api.discardPlanDraft(id,2),/changed; reload/);
 assert.equal((await api.submitApprovedPlanDraft(id)).status,'queued',
  'offline approval remains durable without fake server success');
 assert.equal(rpcCalls.length,0);
 online=true;

 // Transport may commit successfully then lose the response. Persist attempt
 // before dispatch, keep the stable approved intent and re-send exactly once.
 dispatch=()=>{throw Error('lost response after commit');};
 await assert.rejects(api.submitApprovedPlanDraft(id),/Study request failed; retry/);
 const afterLoss=await api.readPlanDraft(id);
 assert.equal(afterLoss.requestId,approved.requestId);
 assert.equal(afterLoss.status,'approved_pending');
 assert.equal(afterLoss.attempted,true);
 assert.equal(afterLoss.attempts,1);
 assert.equal(rpcCalls[0].name,'publish_study_plan');
 assert.equal(rpcCalls[0].args.p_request_id,approved.requestId);
 assert.equal(rpcCalls[0].args.p_expected_revision,0);
 assert.equal(rpcCalls[0].args.p_plan_id,id);
 assert.equal(rpcCalls[0].args.p_snapshot.checkpoints[0].checkpoint_id,'proof-1');
 assert.equal(rpcCalls[0].args.p_author_model,'Claude');

 // Failure of local receipt transaction cannot erase approved intent.
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,...args){
  const r=put.call(this,value,...args);
  if(value?.confirmedAt) r.addEventListener('success',()=>this.transaction.abort());
  return r;
 };
 dispatch=()=>({data:1});
 await assert.rejects(api.submitApprovedPlanDraft(id),/Plan draft transaction (?:not saved|failed)/);
 IDBObjectStore.prototype.put=put;
 assert.equal((await api.readPlanDraft(id)).requestId,approved.requestId);
 assert.equal(await api.readPlanReceipt(id),null);
 const confirmed=await api.submitApprovedPlanDraft(id);
 assert.equal(confirmed.status,'confirmed');
 assert.equal(confirmed.revision,1);
 assert.equal(confirmed.requestId,approved.requestId);
 assert.equal(await api.readPlanDraft(id),null);
 assert.equal((await api.readPlanReceipt(id)).requestId,approved.requestId);
 const count=rpcCalls.length;
 assert.equal((await api.submitApprovedPlanDraft(id)).requestId,approved.requestId);
 assert.equal(rpcCalls.length,count,'confirmed retry never republishes');
 assert.ok(rpcCalls.every(x=>x.args.p_request_id===approved.requestId));
 assert.ok(tokens.every(x=>x===a));

 // The same plan may be amended after the first confirmed publication.
 const amendmentId='00000000-0000-4000-8000-000000000006';
 const amend=await api.savePlanDraft(make({expectedRevision:1,
  proposalId:amendmentId,changeSummary:'New prerequisite checkpoint'}));
 assert.equal(amend.localRevision,1);
 const acceptAmendment=await api.approvePlanDraft(id,1,true);
 dispatch=()=>({data:null,error:{message:'stale_plan_revision'}});
 const conflict=await api.submitApprovedPlanDraft(id);
 assert.equal(conflict.status,'conflict');
 assert.equal(conflict.requestId,acceptAmendment.requestId);
 assert.equal((await api.readPlanDraft(id)).status,'needs_review');
 const afterConflictCalls=rpcCalls.length;
 assert.equal((await api.submitApprovedPlanDraft(id)).status,'conflict');
 assert.equal(rpcCalls.length,afterConflictCalls,
  'a stale plan cannot silently rebase or republish');
 await assert.rejects(api.savePlanDraft(make({expectedRevision:2,
  expectedLocalRevision:2,
  proposalId:'00000000-0000-4000-8000-000000000007'
 })),/already under approval/);

 current=b;notify();
 assert.equal(await api.readPlanDraft(id),null,'other owner never reads conflict');
 assert.equal(await api.readPlanReceipt(id),null,'other owner never reads receipt');
 assert.equal((await api.savePlanDraft(make())).status,'draft');
 await assert.rejects(api.submitApprovedPlanDraft(id),/Explicit student approval/);
 current=a;notify();
 assert.equal((await api.readPlanDraft(id)).status,'needs_review');

 // A successful remote response after logout must not confirm/reveal A's data.
 const other='00000000-0000-4000-8000-000000000008';
 await api.savePlanDraft(make({planId:other,proposalId:other}));
 await api.approvePlanDraft(other,1,true);
 dispatch=()=>{current=b;notify();return {data:1};};
 await assert.rejects(api.submitApprovedPlanDraft(other),/Account changed/);
 current=a;notify();
 assert.equal((await api.readPlanDraft(other)).status,'approved_pending');
 assert.equal(await api.readPlanReceipt(other),null);
 assert.equal(api.ready,true);
 console.log('PASS PLAN-01 P2b: student consent, v1->v2 migration, durable retry/receipt, rollback, stale conflict, owner isolation and no auto-approval');
})().catch(e=>{console.error('FAIL PLAN-01 P2b: '+e.message);process.exitCode=1;});
