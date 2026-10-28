'use strict';
// RELEASE-01 R2c: owner-local, read-only recovery evidence. No Supabase writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('fake-indexeddb/auto');
const { openAccountDB, AccountStorage } = require('../src/app/sync_browser.js');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const CONTEXT='00000000-0000-4000-8000-000000000003';
const note={id:'offline-proof',front:'What is compactness?',back:'An open cover admits a finite subcover',
  cards:{1:{reps:4,due:1234}},log:[[100,1,3]],media:{}};
const transact = (db, callback) => new Promise((resolve,reject) => {
  const t=db.transaction(['meta','reviews','retractions'],'readwrite');
  callback(t);
  t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);
});
(async()=>{
  const dbA=await openAccountDB(A), dbB=await openAccountDB(B);
  const storageA=new AccountStorage(dbA,A), storageB=new AccountStorage(dbB,B);
  await storageA.stageNote(note);
  await storageA.saveKnowledgeDraft({contextId:CONTEXT,expectedLocalRevision:0,
    expectedRevision:2,title:'Topology',markdown:'Unfinished proof draft',
    authorKind:'student',payload:{schema_version:1,goals:['Prove compactness']}});
  await transact(dbA,t=>{
    t.objectStore('meta').put({userId:A,requestId:'stable-retry',
      status:'retained',original:{markdown:'conflicted old draft'}},
      'knowledge:conflict:v1:'+CONTEXT+':stable-retry');
    t.objectStore('meta').put({userId:A,requestId:'done',revision:2},
      'knowledge:receipt:v1:'+CONTEXT);
    t.objectStore('reviews').put({event_id:'event-1',note_id:note.id,grade:3});
    t.objectStore('retractions').put({retraction_id:'undo-1',target_event_id:'event-1'});
  });
  await storageB.stageNote({...note,front:'Private second owner'});
  const capture=await storageA.localRecoverySnapshot();
  assert.equal(capture.capture,'single-indexeddb-readonly-transaction');
  assert.equal(capture.ownerId,A);
  assert.deepEqual(Object.keys(capture.stores),['notes','reviews','retractions','outbox','meta']);
  const byKey=(store,key)=>capture.stores[store].find(x=>x.key===key)?.value;
  assert.equal(byKey('notes',note.id).data.front,note.front);
  const queued=capture.stores.outbox.find(x=>x.value.kind==='note');
  assert.ok(queued,'pending outbox mutation survives local export');
  assert.equal(queued.value.data.front,note.front);
  assert.equal(byKey('reviews','event-1').grade,3);
  assert.equal(byKey('retractions','undo-1').target_event_id,'event-1');
  assert.equal(byKey('meta','knowledge:draft:v1:'+CONTEXT).markdown,'Unfinished proof draft');
  assert.equal(byKey('meta','knowledge:receipt:v1:'+CONTEXT).requestId,'done');
  assert.equal(byKey('meta','knowledge:conflict:v1:'+CONTEXT+':stable-retry')
    .original.markdown,'conflicted old draft');
  assert.equal((await storageA.list()).length,1,
    'snapshot does not enqueue or acknowledge any operation');
  assert.equal((await storageA.knowledgeDraft(CONTEXT)).status,'draft');
  assert.equal((await storageB.localRecoverySnapshot()).stores.notes[0].value.data.front,
    'Private second owner');
  assert.equal(JSON.parse(JSON.stringify(capture)).stores.meta.length,capture.stores.meta.length,
    'snapshot is portable JSON, not IndexedDB structured clones');

  await assert.rejects(storageA.localRecoverySnapshot({maxBytes:100}),/byte limit/);
  await assert.rejects(storageA.localRecoverySnapshot({maxRows:1}),/record limit/);
  await assert.rejects(storageA.localRecoverySnapshot({maxBytes:64*1024*1024+1}),
    /safety bounds/);
  await transact(dbA,t=>t.objectStore('meta').put({userId:B,markdown:'foreign'},
    'injected-other-owner'));
  await assert.rejects(storageA.localRecoverySnapshot(),/Foreign owner row/);
  await transact(dbA,t=>t.objectStore('meta').delete('injected-other-owner'));
  await transact(dbA,t=>t.objectStore('meta').put(new Date(),'unsupported-date'));
  await assert.rejects(storageA.localRecoverySnapshot(),/non-JSON object/);
  await transact(dbA,t=>t.objectStore('meta').delete('unsupported-date'));

  let identity=A, active={userId:A,storage:storageA};
  const context=vm.createContext({
    LemmaAccount:{client:{},get user(){return identity?{id:identity}:null;}},
    LemmaSync:{accountHandle:()=>active},
    LemmaCloud:{accountToken:async()=>{throw Error('export cannot contact network');}},
    Model:{notes:new Map()},Store:{whenSaved:async()=>{}},structuredClone
  });
  vm.runInContext(fs.readFileSync('src/app/cloud_bridge.js','utf8')+
    '\nglobalThis.bridge=LemmaCloudBridge',context);
  const bridge=context.bridge;
  await assert.rejects(bridge.captureLocalRecovery(),/Explicit local account recovery export/);
  const exported=await bridge.captureLocalRecovery(true);
  assert.equal(exported.ownerId,A);
  assert.equal(exported.stores.outbox.length,1);
  identity=null;active=null;
  await assert.rejects(bridge.captureLocalRecovery(true),/Sign in to an available/);
  identity=B;active={userId:B,storage:storageB};
  assert.equal((await bridge.captureLocalRecovery(true)).ownerId,B);
  identity=A;active={userId:A,storage:storageA};
  const original=storageA.localRecoverySnapshot;
  let finish;
  storageA.localRecoverySnapshot=()=>new Promise(resolve=>{
    finish=async()=>resolve(await original.call(storageA));
  });
  const pending=bridge.captureLocalRecovery(true);
  identity=B;active={userId:B,storage:storageB};
  await finish();
  await assert.rejects(pending,/Account changed/,
    'late owner A snapshot must not become visible under owner B');
  storageA.localRecoverySnapshot=original;
  dbA.close();dbB.close();
  console.log('PASS RELEASE R2c: atomic owner-local recovery, pending/archived evidence, bounds, portability, account-switch rejection');
})().catch(error=>{console.error('FAIL R2c local recovery: '+error.stack);process.exitCode=1;});
