'use strict';
// PLAN-01 P2a: fake IndexedDB transactions, never a network or production call.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {indexedDB,IDBObjectStore} = require('fake-indexeddb');
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const proposal = '00000000-0000-4000-8000-000000000004';
let current = a, online = false, notify = () => {};
const mockClient = {};
let calls = 0;
function load() {
 const scope = vm.createContext({
  LemmaAccount:{
   get client() {return mockClient;},
   get user() {return current ? {id:current} : null;},
   onIdentityChange(fn) {notify=fn;}
  },
  LemmaCloud:{async accountToken(){calls++;throw Error('no cloud for drafts');}},
  indexedDB,crypto:webcrypto,structuredClone,Date,
  get navigator(){return {onLine:online};}
 });
 vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+
  '\nglobalThis.study=StudyPlan',scope);
 return scope.study;
}
const api=load();
const make=(over={})=>({
 planId:id,expectedRevision:1,expectedLocalRevision:0,
 snapshot:{checkpoints:[{checkpoint_id:'proof-3',title:'Prove a theorem'}]},
 changeSummary:'Add a prerequisite proof',source:'tutor',title:'Topology',
 objective:'Prove compactness',
 proposalId:proposal,...over
});
(async()=>{
 assert.equal(api.ready,true,'local drafts do not change Study readiness');
 assert.equal(await api.readPlanDraft(id),null);
 const draft=await api.savePlanDraft(make());
 assert.equal(draft.status,'draft');
 assert.equal(draft.localRevision,1);
 assert.equal(draft.userId,a);
 assert.equal(draft.expectedRevision,1);
 assert.equal(draft.draftId,proposal);
 assert.equal(draft.changeSummary,'Add a prerequisite proof');
 assert.ok(!('approvedBy' in draft));
 assert.equal((await api.savePlanDraft(make())).localRevision,1,
  'lost-response retry with same proposal id and payload must be idempotent');
 assert.equal(await api.proposeAmendment(make()),proposal,
  'tutor proposal only returns unapproved local draft id');
 assert.equal((await load().readPlanDraft(id)).draftId,proposal,
  'durable per-owner draft is recoverable after module reload');

 current=b;notify();
 assert.equal(await api.readPlanDraft(id),null,'same plan ID is isolated for other owner');
 const savedB=await api.savePlanDraft(make({
  proposalId:'00000000-0000-4000-8000-000000000005',
  changeSummary:'Independent B draft'
 }));
 assert.equal(savedB.userId,b);
 current=a;notify();
 assert.equal((await api.readPlanDraft(id)).changeSummary,'Add a prerequisite proof',
  'B cannot overwrite or read account A drafts');
 assert.equal(calls,0,'offline drafts must never touch Supabase');
 const patch=make({proposalId:'00000000-0000-4000-8000-000000000006',
  expectedLocalRevision:1,changeSummary:'Student edits proposal'});
 const race=await Promise.allSettled([
  api.savePlanDraft(patch),
  api.savePlanDraft({...patch,proposalId:'00000000-0000-4000-8000-000000000007'})
 ]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(race.filter(r=>r.status==='rejected' &&
  /changed; reload/.test(r.reason.message)).length,1,
  'two tabs cannot commit the same local revision');
 assert.equal((await api.readPlanDraft(id)).localRevision,2);
 const before=await api.readPlanDraft(id);
 await assert.rejects(api.savePlanDraft(make({
  proposalId:before.draftId,expectedLocalRevision:2,
  changeSummary:'changed without new key'
 })),/ID reused with changed content/);
 for (const invalid of [
  make({planId:'bad'}),make({expectedRevision:-1}),make({expectedLocalRevision:-1}),
  make({snapshot:{checkpoints:[]}}),make({snapshot:{checkpoints:[{id:'p'},{id:'p'}]}}),
  make({changeSummary:''}),make({studentApproved:true}),
  make({status:'accepted'}),make({source:'x'.repeat(201)})
 ]) await assert.rejects(api.savePlanDraft(invalid),/Invalid|duplicate/);
 assert.equal((await api.readPlanDraft(id)).localRevision,2,
  'invalid proposals cannot overwrite local edits');
 await assert.rejects(api.discardPlanDraft(id,1),/changed; reload/);

 // A successful put inside a transaction is not a receipt until completion.
 const originalPut=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,...args) {
  const r=originalPut.call(this,value,...args);
  if(value?.changeSummary==='abort this edit')
   r.addEventListener('success',()=>this.transaction.abort());
  return r;
 };
 await assert.rejects(api.savePlanDraft(make({
  proposalId:'00000000-0000-4000-8000-000000000008',
  expectedLocalRevision:2,changeSummary:'abort this edit'
 })),/transaction not saved/);
 IDBObjectStore.prototype.put=originalPut;
 assert.deepEqual(JSON.stringify(await api.readPlanDraft(id)),JSON.stringify(before),
  'aborted transaction must preserve previous durable proposal');

 // Switch identity before IndexedDB get resolves: abort old-account write.
 const originalGet=IDBObjectStore.prototype.get;
 let swapped=false;
 IDBObjectStore.prototype.get=function(...args) {
  const r=originalGet.apply(this,args);
  if(!swapped)r.addEventListener('success',()=>{
   swapped=true;current=b;notify();
  });
  return r;
 };
 await assert.rejects(api.savePlanDraft(make({
  proposalId:'00000000-0000-4000-8000-000000000009',
  expectedLocalRevision:2,changeSummary:'stale owner'
 })),/Account changed/);
 IDBObjectStore.prototype.get=originalGet;
 current=a;notify();
 assert.equal((await api.readPlanDraft(id)).localRevision,2,
  'account switch cannot commit an old-owner draft in a new session');

 current=null;notify();
 await assert.rejects(api.readPlanDraft(id),/Sign in/);
 current=a;notify();
 assert.equal(await api.discardPlanDraft(id,2),true);
 assert.equal(await api.readPlanDraft(id),null);
 assert.equal(await api.discardPlanDraft(id,2),false);
 current=b;notify();
 assert.equal((await api.readPlanDraft(id)).changeSummary,'Independent B draft');
 console.log('PASS PLAN-01 P2a: offline durable unapproved proposals, owner isolation, atomic two-tab CAS, idempotency, rollback, account-switch and delete');
})().catch(e=>{console.error('FAIL PLAN-01 P2a: '+e.message);process.exitCode=1;});
