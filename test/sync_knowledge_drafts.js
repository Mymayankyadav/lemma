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
 assert.equal(await storage.discardKnowledgeDraft(contextId,3),true);
 assert.equal(await storage.knowledgeDraft(contextId),null);
 await assert.rejects(storage.discardKnowledgeDraft(contextId,3),/changed; reload/);
 // Owner B may store a different private draft at the same context ID.
 await otherAccount.saveKnowledgeDraft(make({markdown:'private B'}));
 assert.equal((await otherAccount.knowledgeDraft(contextId)).markdown,'private B');
 assert.equal(await storage.knowledgeDraft(contextId),null);
 // Local draft contents are durable across a close/reload and do not require
 // network, a login token, or any synchronization queue operation.
 await storage.saveKnowledgeDraft(make({contextId:secondId,markdown:'offline work'}));
 dbA.close();dbTab.close();
 const opened=await openAccountDB(a);
 const reloaded=new AccountStorage(opened,a);
 assert.equal((await reloaded.knowledgeDraft(secondId)).markdown,'offline work');
 const queue=await reloaded.list();
 assert.equal(queue.length,0,'draft saving never adds a cloud accepted write');
 await reloaded.discardKnowledgeDraft(secondId,1);
 opened.close();dbB.close();
 console.log('PASS KNOWLEDGE K2e: persisted owner-local draft, CAS tab race, abort rollback, offline reload, tutor unapproved status, explicit discard');
})().catch(e=>{console.error('FAIL K2e draft storage: '+e.message);process.exitCode=1;});
