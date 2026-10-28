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
  // R2f: distinct VM exercises the authenticated server RPC, with no real
  // network or production access and no implicit cloud writes.
  const {TABLES}=require('./release_workspace_archive');
  const ownerRows=id=>{
    const tables=Object.fromEntries(TABLES.map(name=>[name,[]]));
    tables.study_plans.push({user_id:id,id:'11111111-1111-4111-8111-111111111111'});
    return {app:'lemma',schemaVersion:1,scope:'account-workspace-raw',
      capture:'stable-calling-statement-snapshot',ownerId:id,
      capturedAt:'2026-10-28T16:30:00Z',tables};
  };
  let serverOwner=A, serverHandle={userId:A,storage:storageA};
  let remoteRows=ownerRows(A), rpcCalls=0, authCalls=0, allowRequest=null;
  const serverClient={
    auth:{getUser:async()=>{authCalls++;return {data:{user:{id:serverOwner}}};}},
    rpc:(name,args)=>{
      assert.equal(name,'capture_account_workspace_snapshot');
      assert.equal(args,undefined,'RPC must never accept a caller owner override');
      rpcCalls++;
      return {setHeader:async (header,value)=>{
        assert.equal(header,'Authorization');
        assert.equal(value,'Bearer disposable-token');
        if(allowRequest) return allowRequest();
        return {data:remoteRows};
      }};
    }
  };
  const serverVM=vm.createContext({
    LemmaAccount:{get user(){return {id:serverOwner};},get client(){return serverClient;}},
    LemmaSync:{accountHandle:()=>serverHandle},
    LemmaCloud:{accountToken:async(client,id)=>{
      assert.equal(client,serverClient);
      assert.equal(id,serverOwner);
      return 'disposable-token';
    }},
    Model:{notes:new Map()},Store:{whenSaved:async()=>{}},
    TextEncoder,crypto,structuredClone
  });
  vm.runInContext(fs.readFileSync('src/app/cloud_bridge.js','utf8')+
    '\nglobalThis.serverBridge=LemmaCloudBridge',serverVM);
  const remote=serverVM.serverBridge;
  await assert.rejects(remote.captureServerWorkspaceSnapshot(),/Explicit server workspace/);
  assert.equal(rpcCalls,0,'no read without deliberate student request');
  const exportA=await remote.captureServerWorkspaceSnapshot(true);
  assert.equal(exportA.ownerId,A);
  assert.equal(exportA.readOnly,true);
  assert.equal(exportA.count,1);
  assert.equal(exportA.snapshot.tables.study_plans[0].user_id,A);
  assert.equal(rpcCalls,1);
  assert.equal(authCalls,1);
  const verify=(mutate,pattern)=>{
    const wrong=ownerRows(A);mutate(wrong);
    assert.throws(()=>remote.validateServerWorkspaceSnapshot(wrong,A),pattern);
  };
  verify(x=>{delete x.tables.tutor_handoff_receipts;},/Invalid or incomplete/);
  verify(x=>{x.tables.rogue=[];},/Invalid or incomplete/);
  verify(x=>{x.ownerId=B;},/Invalid or incomplete/);
  verify(x=>{x.tables.study_plans[0].user_id=B;},/Foreign owner/);
  verify(x=>{x.tables.study_plans.push({...x.tables.study_plans[0]});},
    /Duplicate server workspace primary key/);
  verify(x=>{delete x.tables.study_plans[0].id;},
    /Missing or unsafe server workspace primary key/);
  verify(x=>{x.tables.notes=new Array(100001).fill(null);},/row limit/);
  verify(x=>{x.scope='account-local-recovery';},/Invalid or incomplete/);

  // In-flight remote transport can resolve after a different account mounted.
  // The returned old-owner data must never cross the owner switch.
  let transportStarted,releaseRemote;
  const started=new Promise(resolve=>transportStarted=resolve);
  allowRequest=()=>{transportStarted();return new Promise(resolve=>{
    releaseRemote=()=>resolve({data:ownerRows(A)});
  });};
  const pendingRemote=remote.captureServerWorkspaceSnapshot(true);
  await started;
  serverOwner=B;
  serverHandle={userId:B,storage:storageB};
  releaseRemote();
  await assert.rejects(pendingRemote,/Account changed during server workspace snapshot/);
  allowRequest=null;
  remoteRows=ownerRows(B);
  const exportB=await remote.captureServerWorkspaceSnapshot(true);
  assert.equal(exportB.snapshot.ownerId,B);
  assert.equal(exportB.snapshot.tables.study_plans[0].user_id,B);
  assert.deepEqual(JSON.parse(JSON.stringify(await storageA.list())),
    JSON.parse(JSON.stringify(before)),'server snapshot must not write to IndexedDB');
  console.log('PASS RELEASE R2f: explicit server snapshot, all 19 tables, owner/duplicate/size guards, no client writes, post-transport account switch');

  dbA.close();dbB.close();
  console.log('PASS RELEASE R2d: explicit local snapshot envelope, SHA-256, owner/size/shape guards, no mutation, post-hash identity');
})().catch(error=>{console.error('FAIL R2d: '+error.stack);process.exitCode=1;});
