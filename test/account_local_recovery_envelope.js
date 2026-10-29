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

  // A caller must not receive a success for an input changed during digest.
  const changing=copy();
  let verifyEntered,releaseVerify;
  const verifyStarted=new Promise(resolve=>verifyEntered=resolve);
  hashingGate=(...args)=>{
    verifyEntered();
    return new Promise(resolve=>{releaseVerify=()=>resolve(webcrypto.subtle.digest(...args));});
  };
  const pendingVerification=bridge.verifyLocalRecoveryEnvelope(changing,A);
  await verifyStarted;
  changing.snapshot.stores.outbox[0].value.data.front='changed during verification';
  releaseVerify();
  await assert.rejects(pendingVerification,/changed during recovery verification/);
  hashingGate=null;

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
  // R2g: byte-for-byte canonical archive format is independently verified
  // by F's release contract. Only the intentional read-only RPC is called.
  const {verify:verifyWorkspaceArchive}=require('./release_workspace_archive');
  const sourceMigrations=fs.readdirSync('supabase/migrations')
    .filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort()
    .map(name=>name.slice(0,14));
  await assert.rejects(remote.sealServerWorkspaceArchive(),/Explicit server archive/);
  serverOwner=A;
  serverHandle={userId:A,storage:storageA};
  remoteRows=ownerRows(A);
  const archive=JSON.parse(JSON.stringify(
    await remote.sealServerWorkspaceArchive(true)));
  assert.equal(archive.app,'lemma');
  assert.equal(archive.version,2);
  assert.equal(archive.capture,'transactional');
  assert.equal(archive.ownerId,A);
  assert.deepEqual(archive.migrations,sourceMigrations,
    'all exact source migrations are pinned in the browser archive');
  assert.equal(verifyWorkspaceArchive(archive).tableCount,19);
  const altered=JSON.parse(JSON.stringify(archive));
  altered.tables.study_plans[0].id='22222222-2222-4222-8222-222222222222';
  assert.throws(()=>verifyWorkspaceArchive(altered),/checksum or count mismatch/);
  const metadataTamper=JSON.parse(JSON.stringify(archive));
  metadataTamper.manifest.hashes.study_plans='f'.repeat(64);
  assert.throws(()=>verifyWorkspaceArchive(metadataTamper),/checksum or count mismatch/);
  remoteRows=ownerRows(A);
  remoteRows.tables.learning_sessions.push({
    user_id:A,id:'33333333-3333-4333-8333-333333333333',
    plan_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'});
  await assert.rejects(remote.sealServerWorkspaceArchive(true),
    /Dangling workspace archive learning_sessions.plan_id/);
  remoteRows=ownerRows(A);
  remoteRows.tables.knowledge_section_versions.push({
    user_id:A,source_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    source_revision:1,section_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
  await assert.rejects(remote.sealServerWorkspaceArchive(true),
    /Missing exact source revision in archive/);
  remoteRows=ownerRows(A);
  let sealEntered,sealRelease;
  const sealWait=new Promise(resolve=>sealEntered=resolve);
  hashingGate=(...args)=>{sealEntered();return new Promise(resolve=>{
    sealRelease=()=>resolve(webcrypto.subtle.digest(...args));
  });};
  const pendingSeal=remote.sealServerWorkspaceArchive(true);
  await sealWait;
  serverOwner=B;
  serverHandle={userId:B,storage:storageB};
  sealRelease();
  await assert.rejects(pendingSeal,/Account changed while sealing server archive/);
  hashingGate=null;
  // R2h paired recovery combines (but NEVER conflates) independent read-only
  // server and IndexedDB captures. No UI, restore, or implicit download.
  serverOwner=A;serverHandle={userId:A,storage:storageA};
  remoteRows=ownerRows(A);
  const callsBeforePair=rpcCalls;
  await assert.rejects(remote.captureReadOnlyRecoveryPair(),/Explicit paired account/);
  assert.equal(rpcCalls,callsBeforePair);
  const paired=JSON.parse(JSON.stringify(
    await remote.captureReadOnlyRecoveryPair(true)));
  assert.equal(rpcCalls,callsBeforePair+1,'only one explicit server read');
  assert.equal(paired.capture,'two-independent-readonly-snapshots');
  assert.equal(paired.ownerId,A);
  assert.equal(paired.server.ownerId,A);
  assert.equal(paired.local.ownerId,A);
  assert.equal(verifyWorkspaceArchive(paired.server).tableCount,19);
  const checkedPair=await remote.verifyReadOnlyRecoveryPair(paired,A);
  assert.equal(checkedPair.serverRows,1);
  assert.ok(checkedPair.localRows>=2);
  assert.equal(checkedPair.atomicAcrossDevices,false);
  assert.equal(checkedPair.readOnly,true);
  // Pause the first digest while mutating caller-owned data already checked.
  // Verification must be bound to one value and reject the changed input.
  async function rejectMidHashMutation(input, verify, mutate) {
    let started,release;
    const entered=new Promise(resolve=>started=resolve);
    hashingGate=(...args)=>{
      started();
      return new Promise(resolve=>{release=()=>{
        hashingGate=null;resolve(webcrypto.subtle.digest(...args));
      };});
    };
    const pending=verify(input,A);
    await entered;
    mutate(input);
    release();
    await assert.rejects(pending,/changed during recovery verification/);
  }
  await rejectMidHashMutation(structuredClone(paired.server),
    remote.verifyServerWorkspaceArchive,
    x=>{x.tables.client_mutation_receipts.push({user_id:A,request_id:'changed'});});
  await rejectMidHashMutation(structuredClone(paired),
    remote.verifyReadOnlyRecoveryPair,
    x=>{x.local.snapshot.stores.outbox[0].value.data.front='changed';});
  const pairCopy=()=>JSON.parse(JSON.stringify(paired));
  const invalidPair=async(mutate,pattern)=>{
    const invalid=pairCopy();mutate(invalid);
    await assert.rejects(remote.verifyReadOnlyRecoveryPair(invalid,A),pattern);
  };
  await invalidPair(x=>{x.ownerId=B;},/Invalid recovery pair/);
  await invalidPair(x=>{x.server.tables.study_plans[0].id='corrupted';},
    /Paired server archive checksum mismatch/);
  await invalidPair(x=>{x.local.snapshot.stores.outbox[0].value.data.front='corrupted';},
    /checksum or size mismatch/);
  await invalidPair(x=>{x.server.migrations.pop();},/Invalid paired server archive/);
  await invalidPair(x=>{x.manifest.sha256='0'.repeat(64);},
    /Recovery pair manifest mismatch/);
  await assert.rejects(remote.verifyReadOnlyRecoveryPair(paired,B),
    /Invalid recovery pair/);
  // Force a mid-capture identity switch after remote archive is captured,
  // while local IndexedDB is pending. Neither owner may receive the pair.
  const localSnapshot=storageA.localRecoverySnapshot;
  let localEntered,releaseLocal;
  const localStarted=new Promise(resolve=>localEntered=resolve);
  storageA.localRecoverySnapshot=async function(){
    localEntered();
    await new Promise(resolve=>releaseLocal=resolve);
    return localSnapshot.call(this);
  };
  const pendingPair=remote.captureReadOnlyRecoveryPair(true);
  await localStarted;
  serverOwner=B;serverHandle={userId:B,storage:storageB};
  releaseLocal();
  await assert.rejects(pendingPair,/Account changed during local recovery export/);
  storageA.localRecoverySnapshot=localSnapshot;
  assert.deepEqual(JSON.parse(JSON.stringify(await storageA.list())),
    JSON.parse(JSON.stringify(before)),'pair must not edit the owner cache');
  console.log('PASS RELEASE R2h: explicit server/local pair, independently timed captures, offline checksums, tamper/owner/switch denial, zero writes');
  console.log('PASS RELEASE R2g: all 19 source tables sealed to independent canonical F validator, tamper/FK/source revision/identity negatives');
  assert.deepEqual(JSON.parse(JSON.stringify(await storageA.list())),
    JSON.parse(JSON.stringify(before)),'server snapshot must not write to IndexedDB');
  console.log('PASS RELEASE R2f: explicit server snapshot, all 19 tables, owner/duplicate/size guards, no client writes, post-transport account switch');

  // R2i: restore client rejects consent/owner/checksum/switch failures before
  // sending a write, and retains the caller's request ID across retries.
  serverOwner=A;serverHandle={userId:A,storage:storageA};
  const requestId='44444444-4444-4444-8444-444444444444';
  let writes=0,waitRestore=null;
  const originalRpc=serverClient.rpc;
  serverClient.rpc=(name,args)=>{
    assert.equal(name,'restore_account_workspace');
    assert.equal(args.p_request_id,requestId);
    assert.equal(args.p_confirm,true);
    assert.equal(args.p_archive.ownerId,A);
    return {setHeader:async()=>{
      writes++;
      if(waitRestore)await waitRestore();
      return {data:{status:args.p_dry_run?'validated':'restored',ownerId:A,
        requestId,rows:1,tables:19}};
    }};
  };
  await assert.rejects(remote.restoreServerWorkspaceArchive(archive),/Explicit restore/);
  const options={requestId,studentConfirmed:true,dryRun:false};
  const broken=structuredClone(archive);broken.tables.study_plans[0].id='damage';
  await assert.rejects(remote.restoreServerWorkspaceArchive(broken,options),/checksum/);
  await assert.rejects(remote.verifyServerWorkspaceArchive(archive,B),/Invalid/);
  assert.equal(writes,0);
  assert.equal((await remote.restoreServerWorkspaceArchive(archive,{...options,dryRun:true})).status,'validated');
  assert.equal((await remote.restoreServerWorkspaceArchive(archive,options)).status,'restored');
  assert.equal((await remote.restoreServerWorkspaceArchive(archive,options)).status,'restored');
  let restoreEntered,releaseRestore;
  const restoreStarted=new Promise(resolve=>restoreEntered=resolve);
  waitRestore=()=>{restoreEntered();return new Promise(resolve=>releaseRestore=resolve);};
  const pendingRestore=remote.restoreServerWorkspaceArchive(archive,options);
  await restoreStarted;serverOwner=B;serverHandle={userId:B,storage:storageB};
  releaseRestore();await assert.rejects(pendingRestore,/Account changed/);
  serverOwner=A;serverHandle={userId:A,storage:storageA};
  const targetReq=indexedDB.open('synthetic-recovery-target',1);
  targetReq.onupgradeneeded=()=>{
    for(const [name,keyPath] of [['notes','id'],['reviews','event_id'],['retractions','retraction_id'],['outbox','id'],['meta',null]])
      targetReq.result.createObjectStore(name,keyPath?{keyPath}:undefined);
  };
  const targetDB=await new Promise((resolve,reject)=>{
    targetReq.onsuccess=()=>resolve(targetReq.result);targetReq.onerror=()=>reject(targetReq.error);
  });
  const targetStorage=new AccountStorage(targetDB,A);
  let resumes=0,recoveryCalls=0,lostResponse=true;
  serverVM.Store.mode='local';
  serverVM.LemmaSync.withRecovery=async action=>{
    recoveryCalls++;serverHandle=null;
    return action(targetStorage,()=>serverOwner===A);
  };
  serverVM.LemmaSync.attach=async()=>{resumes++;serverHandle={userId:A,storage:targetStorage};};
  serverClient.rpc=(name,args)=>({setHeader:async()=>{
    assert.equal(name,'restore_account_workspace');
    if(!args.p_dry_run&&lostResponse){lostResponse=false;throw new Error('Synthetic lost response');}
    return {data:{status:args.p_dry_run?'validated':'restored',ownerId:A,requestId,rows:1,tables:19}};
  }});
  await assert.rejects(remote.restoreRecoveryPair(paired),/Explicit recovery/);
  assert.equal(recoveryCalls,0);
  const recoverOptions={requestId,studentConfirmed:true,dryRun:false,resumeSync:true};
  await assert.rejects(remote.restoreRecoveryPair(paired,recoverOptions),/Synthetic lost response/);
  assert.equal(resumes,0,'failed partial restore must keep this tab paused');
  assert.equal((await targetStorage.list()).length,0,'lost server response must not import local queue');
  assert.equal((await remote.restoreRecoveryPair(paired,recoverOptions)).status,'restored');
  assert.equal(resumes,1);
  assert.equal((await targetStorage.list()).length,1,'original pending request is preserved, never regenerated');
  assert.equal((await targetStorage.list())[0].requestId,before[0].requestId);
  await remote.restoreRecoveryPair(paired,recoverOptions);
  assert.equal((await targetStorage.list()).length,1,'retry never duplicates pending queue');
  serverVM.Store.mode='account';
  await assert.rejects(remote.restoreRecoveryPair(paired,recoverOptions),/device workspace/);
  targetDB.close();
  console.log('PASS RELEASE paired restore: explicit queued-edit consent, preflight, server-before-local order, paused failure and stable local retry');
  serverClient.rpc=originalRpc;
  console.log('PASS RELEASE R2i client: explicit confirmation, stable retry key, offline integrity/owner checks and late account-switch denial');

  dbA.close();dbB.close();
  console.log('PASS RELEASE R2d: explicit local snapshot envelope, SHA-256, owner/size/shape guards, no mutation, post-hash identity');
})().catch(error=>{console.error('FAIL R2d: '+error.stack);process.exitCode=1;});
