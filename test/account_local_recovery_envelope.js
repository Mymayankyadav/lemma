'use strict';
// R2d: explicit, offline checksum envelope around R2c's transactionally
// captured owner-local cache. Not a server export or a restore permission.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
require('fake-indexeddb/auto');
const { openAccountDB, AccountStorage } = require('../src/app/sync_browser.js');
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
(async () => {
  const dbA=await openAccountDB(A), dbB=await openAccountDB(B);
  const storageA=new AccountStorage(dbA,A), storageB=new AccountStorage(dbB,B);
  await storageA.stageNote({id:'unsynced',front:'Proof attempt',
    back:'Still incomplete',cards:{1:{reps:3}},log:[[100,1,3]]});
  await storageB.stageNote({id:'private',front:'Other owner',back:'Private'});
  let current=A, handle={userId:A,storage:storageA};
  let hashingGate=null;
  const crypto = {subtle:{digest:async (...args)=>{
    if(hashingGate) return hashingGate(...args);
    return webcrypto.subtle.digest(...args);
  }}};
  const context=vm.createContext({
    LemmaAccount:{get user(){return current?{id:current}:null;},client:{}},
    LemmaSync:{accountHandle:()=>handle},
    LemmaCloud:{accountToken:async()=>{throw Error('Offline recovery must not contact Supabase');}},
    Model:{notes:new Map()}, Store:{whenSaved:async()=>{}},
    TextEncoder,crypto,structuredClone
  });
  vm.runInContext(fs.readFileSync('src/app/cloud_bridge.js','utf8')+
    '\nglobalThis.bridge=LemmaCloudBridge',context);
  const bridge=context.bridge;
  await assert.rejects(bridge.captureLocalRecoveryEnvelope(),/Explicit local recovery/);
  const before=await storageA.list();
  const envelope=await bridge.captureLocalRecoveryEnvelope(true);
  assert.equal(envelope.scope,'account-local-recovery-envelope');
  assert.equal(envelope.ownerId,A);
  assert.equal(envelope.sha256.length,64);
  assert.deepEqual(JSON.parse(JSON.stringify(await storageA.list())),JSON.parse(JSON.stringify(before)),
    'sealing must not write to IndexedDB or clear outbox');
  const verified=await bridge.verifyLocalRecoveryEnvelope(
    JSON.parse(JSON.stringify(envelope)),A);
  assert.equal(verified.ownerId,A);
  assert.equal(verified.readOnly,true);
  assert.ok(verified.rows>=2);
  assert.ok(verified.bytes>0);
  const copy=()=>JSON.parse(JSON.stringify(envelope));
  const negative=async (mutate,pattern)=>{
    const altered=copy();mutate(altered);
    await assert.rejects(bridge.verifyLocalRecoveryEnvelope(altered,A),pattern);
  };
  await negative(v=>{v.snapshot.stores.outbox[0].value.data.front='tampered';},
    /checksum or size mismatch/);
  await negative(v=>{v.bytes++;},/checksum or size mismatch/);
  await negative(v=>{v.sha256='a'.repeat(64);},/checksum or size mismatch/);
  await negative(v=>{v.scope='account-workspace';},/Invalid local recovery envelope/);
  await negative(v=>{v.ownerId=B;},/Invalid local recovery envelope/);
  await negative(v=>{delete v.snapshot.stores.meta;},/Wrong owner or invalid/);
  await negative(v=>{v.snapshot.stores.outbox.push({...v.snapshot.stores.outbox[0]});},
    /Duplicate local recovery key/);
  await negative(v=>{v.snapshot.stores.outbox[0].value.userId=B;},
    /Foreign owner row/);
  await assert.rejects(bridge.verifyLocalRecoveryEnvelope(envelope,B),
    /Invalid local recovery envelope/);
  await assert.rejects(bridge.verifyLocalRecoveryEnvelope(envelope),
    /Invalid local recovery envelope/);

  // A network-free SHA-256 operation can complete after sign-out or switch.
  // Revalidate the exact active handle after hashing, not just before.
  let hashingStarted,releaseHash;
  const entered=new Promise(resolve=>hashingStarted=resolve);
  hashingGate=(...args)=>{
    hashingStarted();
    return new Promise(resolve=>{releaseHash=()=>resolve(webcrypto.subtle.digest(...args));});
  };
  const pending=bridge.captureLocalRecoveryEnvelope(true);
  await entered;
  current=B;handle={userId:B,storage:storageB};
  releaseHash();
  await assert.rejects(pending,/Account changed during local recovery sealing/);
  hashingGate=null;
  assert.equal((await bridge.captureLocalRecoveryEnvelope(true)).ownerId,B);
  assert.equal((await storageB.list()).length,1);
  dbA.close();dbB.close();
  console.log('PASS RELEASE R2d: explicit local snapshot envelope, SHA-256, owner/size/shape guards, no mutation, post-hash identity');
})().catch(error=>{console.error('FAIL R2d: '+error.stack);process.exitCode=1;});
