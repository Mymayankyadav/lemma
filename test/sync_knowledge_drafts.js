'use strict';
// KNOWLEDGE-01 K2e: real fake IndexedDB transactions, no network or production.
const assert=require('node:assert/strict');
const {indexedDB, IDBObjectStore}=require('fake-indexeddb');
globalThis.indexedDB=indexedDB;
const {openAccountDB,AccountStorage}=require('../src/app/sync_browser.js');
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const contextId='00000000-0000-4000-8000-000000000003';
const secondId='00000000-0000-4000-8000-000000000004';
const thirdId='00000000-0000-4000-8000-000000000005';
const make=(over={})=>({contextId,expectedLocalRevision:0,expectedRevision:3,
  title:'Compactness',markdown:'A proof draft',payload:{schema_version:1,
    goals:['Prove compact subsets are closed']},authorKind:'student',...over});
(async()=>{
 const dbA=await openAccountDB(a);
 const storage=new AccountStorage(dbA,a);
 const dbTab=await openAccountDB(a);
 const otherTab=new AccountStorage(dbTab,a);
 const dbB=await openAccountDB(b);
 const otherAccount=new AccountStorage(dbB,b);
 assert.equal(await storage.knowledgeDraft(contextId),null);
 const first=await storage.saveKnowledgeDraft(make());
 assert.equal(first.status,'draft');
 assert.equal(first.localRevision,1);
 assert.equal(first.userId,a);
 assert.equal(first.expectedRevision,3,'server CAS base is pinned to the draft');
 assert.equal(first.authorKind,'student');
 const persisted=await otherTab.knowledgeDraft(contextId);
 assert.equal(persisted.markdown,'A proof draft');
 assert.equal(persisted.localRevision,1);
 assert.equal(await otherAccount.knowledgeDraft(contextId),null,
  'same stable context ID cannot leak across owner namespaces');
 // Two tabs use an atomic compare-and-swap on the same meta record.
 const race=await Promise.allSettled([
  storage.saveKnowledgeDraft(make({expectedLocalRevision:1,markdown:'tab one'})),
  otherTab.saveKnowledgeDraft(make({expectedLocalRevision:1,markdown:'tab two'}))
 ]);
 assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(race.filter(x=>x.status==='rejected' &&
  /changed; reload/.test(x.reason.message)).length,1);
 assert.equal((await storage.knowledgeDraft(contextId)).localRevision,2);
 await assert.rejects(storage.saveKnowledgeDraft(make({expectedLocalRevision:1})),
  /changed; reload/);
 // Reject unreviewed tutor input becoming an accepted state.
 for(const invalid of [
  make({studentApproved:true}),make({status:'accepted'}),
  make({authorKind:'model'}),make({title:''}),
  make({payload:{schema_version:2}}),make({payload:{schema_version:1,goals:['x'.repeat(33000)]}}),
  make({expectedLocalRevision:-1}),make({expectedRevision:-1}),make({contextId:'bad'})
 ]) await assert.rejects(storage.saveKnowledgeDraft(invalid));
 const previous=await storage.knowledgeDraft(contextId);
 assert.equal(previous.localRevision,2,'invalid inputs never overwrite');
 // A transaction abort after IDB put succeeds is NOT a saved draft receipt.
 const put=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,...args){
  const r=put.call(this,value,...args);
  if(value?.status==='draft' && value?.markdown==='abort me')
    r.addEventListener('success',()=>this.transaction.abort());
  return r;
 };
 await assert.rejects(storage.saveKnowledgeDraft(make({
  expectedLocalRevision:2,markdown:'abort me'
 })));
 IDBObjectStore.prototype.put=put;
 assert.equal((await storage.knowledgeDraft(contextId)).markdown,previous.markdown);
 assert.equal((await storage.knowledgeDraft(contextId)).localRevision,2);
 const tutor=await storage.saveKnowledgeDraft(make({
  expectedLocalRevision:2,authorKind:'tutor',markdown:'Unaccepted tutor proposal'
 }));
 assert.equal(tutor.localRevision,3);
 assert.equal(tutor.authorKind,'tutor');
 assert.equal(tutor.status,'draft','tutor revisions are never automatically approved');
 await assert.rejects(otherTab.discardKnowledgeDraft(contextId,2),/changed; reload/);
 await assert.rejects(storage.approveKnowledgeDraft(contextId,3,false),/Explicit student approval/);
 await assert.rejects(storage.approveKnowledgeDraft(contextId,2,true),/changed; review/);
 const approvals=await Promise.all([
  storage.approveKnowledgeDraft(contextId,3,true),
  otherTab.approveKnowledgeDraft(contextId,3,true)
 ]);
 assert.equal(approvals[0].requestId,approvals[1].requestId,
  'competing approval and local lost-response retry preserve one immutable request ID');
 const approved=await storage.knowledgeDraft(contextId);
 assert.match(approved.requestId,/^[0-9a-f-]{36}$/i);
 assert.equal(approved.status,'approved_pending','not a server acknowledgement');
 assert.equal(approved.localRevision,4);
 assert.equal(approved.approvedFromLocalRevision,3);
 assert.equal(approved.authorKind,'tutor','tutor provenance survives student approval');
 assert.equal(approved.approvedBy,'student');
 await assert.rejects(storage.saveKnowledgeDraft(make({
  expectedLocalRevision:4,markdown:'overwrite approved intent'
 })),/Approved knowledge intent is pending/);
 await assert.rejects(storage.discardKnowledgeDraft(contextId,4),/changed; reload/);
 await assert.rejects(storage.approveKnowledgeDraft(contextId,4,true),/changed; review/);
 assert.equal((await storage.knowledgeDraft(contextId)).requestId,approved.requestId);
 // Owner B may store an entirely separate draft at the same stable ID.
 await otherAccount.saveKnowledgeDraft(make({markdown:'private B'}));
 assert.equal((await otherAccount.knowledgeDraft(contextId)).markdown,'private B');
 assert.equal((await storage.knowledgeDraft(contextId)).status,'approved_pending');
 // Local draft contents are durable across a close/reload and do not require
 // network, a login token, or any synchronization queue operation.
 await storage.saveKnowledgeDraft(make({contextId:secondId,markdown:'offline work'}));
 dbA.close();dbTab.close();
 const opened=await openAccountDB(a);
 const reloaded=new AccountStorage(opened,a);
 assert.equal((await reloaded.knowledgeDraft(secondId)).markdown,'offline work');
 assert.equal((await reloaded.knowledgeDraft(contextId)).requestId,approved.requestId,
  'approved request ID survives cold restart without reapproval');
 const retried=await reloaded.approveKnowledgeDraft(contextId,3,true);
 assert.equal(retried.requestId,approved.requestId);
 assert.equal(retried.localRevision,4);
 assert.equal((await reloaded.knowledgeDraft(contextId)).status,'approved_pending');
 const queue=await reloaded.list();
 assert.equal(queue.length,0,'draft saving never adds a cloud accepted write');
 await reloaded.discardKnowledgeDraft(secondId,1);
 // Explicit approved intent: persisted attempted marker, local transaction
 // rollback on a receipt failure, exactly-once confirmation and archive.
 await reloaded.saveKnowledgeDraft(make({contextId:secondId,markdown:'Send me'}));
 const toSend=await reloaded.approveKnowledgeDraft(secondId,1,true);
 assert.equal(toSend.status,'approved_pending');
 await assert.rejects(reloaded.markKnowledgeIntentAttempt(secondId,'wrong-request'),
  /no longer pending/);
 const attempted=await reloaded.markKnowledgeIntentAttempt(secondId,toSend.requestId);
 assert.equal(attempted.attempted,true);
 assert.equal(attempted.attempts,1);
 const putReceipt=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,...args){
  const r=putReceipt.call(this,value,...args);
  if(value?.confirmedAt) r.addEventListener('success',()=>this.transaction.abort());
  return r;
 };
 await assert.rejects(reloaded.acknowledgeKnowledgeIntent(secondId,toSend.requestId,4));
 IDBObjectStore.prototype.put=putReceipt;
 assert.equal((await reloaded.knowledgeDraft(secondId)).status,'approved_pending',
  'failed transaction cannot lose the reviewed draft or approved request key');
 assert.equal(await reloaded.knowledgeIntentReceipt(secondId),null,
  'failed acknowledgement must not leave an orphan receipt');
 await assert.rejects(reloaded.acknowledgeKnowledgeIntent(secondId,toSend.requestId,3),
  /no longer matches intent/);
 const receipt=await reloaded.acknowledgeKnowledgeIntent(secondId,toSend.requestId,4);
 assert.equal(receipt.revision,4);
 assert.equal(receipt.requestId,toSend.requestId);
 assert.equal(await reloaded.knowledgeDraft(secondId),null);
 assert.equal((await reloaded.knowledgeIntentReceipt(secondId)).requestId,toSend.requestId);
 assert.deepEqual(await reloaded.acknowledgeKnowledgeIntent(secondId,toSend.requestId,4),
  receipt,'lost-local-receipt retry returns exact previously confirmed result');
 await assert.rejects(reloaded.acknowledgeKnowledgeIntent(secondId,'wrong',4),
  /no longer matches intent/);
 assert.equal(await otherAccount.knowledgeIntentReceipt(secondId),null);
 // Stale server context does not rewrite the student-approved payload.
 await reloaded.saveKnowledgeDraft(make({contextId:thirdId,markdown:'Needs review'}));
 const stale=await reloaded.approveKnowledgeDraft(thirdId,1,true);
 await reloaded.markKnowledgeIntentAttempt(thirdId,stale.requestId);
 const conflicted=await reloaded.markKnowledgeIntentConflict(thirdId,stale.requestId);
 assert.equal(conflicted.status,'needs_review');
 assert.equal(conflicted.conflict,'stale_context_revision');
 assert.equal((await reloaded.knowledgeDraft(thirdId)).markdown,'Needs review');
 await assert.rejects(reloaded.markKnowledgeIntentAttempt(thirdId,stale.requestId),
  /no longer pending/);
 await assert.rejects(reloaded.saveKnowledgeDraft(make({
  contextId:thirdId,expectedLocalRevision:2,markdown:'unreviewed rebase'
 })),/Approved knowledge intent is pending/);
 // K2h2: a stale approved request is immutable until the student reviews
 // the latest accepted revision and explicitly reopens a NEW unapproved draft.
 await assert.rejects(reloaded.reopenKnowledgeConflictDraft(
  thirdId,2,stale.requestId,4,false),/Explicit student conflict review/);
 await assert.rejects(reloaded.reopenKnowledgeConflictDraft(
  thirdId,1,stale.requestId,4,true),/changed; compare again/);
 await assert.rejects(reloaded.reopenKnowledgeConflictDraft(
  thirdId,2,stale.requestId,3,true),/changed; compare again/);
 const archiveKey='knowledge:conflict:v1:'+thirdId+':'+stale.requestId;
 const readArchive=()=>new Promise((resolve,reject)=>{
  const r=opened.transaction('meta','readonly').objectStore('meta').get(archiveKey);
  r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
 });
 // Failure after the archive add but before commit must roll back BOTH rows.
 const putReopen=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,...args){
  const r=putReopen.call(this,value,...args);
  if(value?.status==='draft' && value?.reopenedFromRequestId===stale.requestId)
   r.addEventListener('success',()=>this.transaction.abort());
  return r;
 };
 await assert.rejects(reloaded.reopenKnowledgeConflictDraft(
  thirdId,2,stale.requestId,4,true));
 IDBObjectStore.prototype.put=putReopen;
 assert.equal(await readArchive(),null,'failed reopen must not archive alone');
 assert.equal((await reloaded.knowledgeDraft(thirdId)).status,'needs_review',
  'failed transaction retains original approved conflict');
 const reopened=await reloaded.reopenKnowledgeConflictDraft(
  thirdId,2,stale.requestId,4,true);
 assert.equal(reopened.status,'draft');
 assert.equal(reopened.expectedRevision,4);
 assert.equal(reopened.localRevision,3);
 assert.equal(reopened.markdown,'Needs review');
 assert.equal(reopened.approvedBy,undefined);
 assert.equal(reopened.requestId,undefined);
 assert.equal(reopened.reopenedFromRequestId,stale.requestId);
 const archive=await readArchive();
 assert.equal(archive.original.status,'needs_review');
 assert.equal(archive.original.requestId,stale.requestId);
 assert.equal(archive.original.markdown,'Needs review');
 assert.equal(archive.acceptedRevision,4);
 assert.deepEqual(await reloaded.reopenKnowledgeConflictDraft(
  thirdId,2,stale.requestId,4,true),reopened,
  'lost local response returns the exact reopened draft');
 await assert.rejects(reloaded.reopenKnowledgeConflictDraft(
  thirdId,2,stale.requestId,5,true),/changed; compare again/);
 assert.equal(await otherAccount.knowledgeDraft(thirdId),null,
  'conflict archive/reopen must not cross owner namespaces');
 const freshApproval=await reloaded.approveKnowledgeDraft(thirdId,3,true);
 assert.notEqual(freshApproval.requestId,stale.requestId,
  'reapproval after explicit edit/review needs a fresh immutable request');
 assert.equal(freshApproval.expectedRevision,4);
 assert.equal((await readArchive()).original.requestId,stale.requestId,
  'new approval cannot erase original conflicting request');
 assert.equal((await reloaded.list()).length,0,
  'context approval uses private meta records, not the review/note outbox');
 opened.close();dbB.close();
 console.log('PASS KNOWLEDGE K2g: exact-key attempted/ack/needs-review, rollback-safe immutable receipt, owner scopes and original draft recovery');
})().catch(e=>{console.error('FAIL K2e draft storage: '+e.message);process.exitCode=1;});
