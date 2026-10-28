'use strict';
// KNOWLEDGE-01 K2g: authenticated submit is a mock transport, not production.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const contextId='00000000-0000-4000-8000-000000000003';
const requestId='00000000-0000-4000-8000-000000000004';
let identity=a,online=true,handle,send;
const calls=[],attempts=[],confirmed=[];
let saved=null,receipt=null;
const pending=()=>({contextId,userId:a,status:'approved_pending',
  approvedBy:'student',requestId,expectedRevision:3,
  title:'Topology',markdown:'Student reviewed proof',
  payload:{schema_version:1,goals:['Compactness']}});
const storage={
 async knowledgeDraft(id){assert.equal(id,contextId);return saved?structuredClone(saved):null;},
 async knowledgeIntentReceipt(id){assert.equal(id,contextId);return receipt;},
 async markKnowledgeIntentAttempt(id,key){
  assert.equal(id,contextId);assert.equal(key,requestId);
  if(saved.status!=='approved_pending')throw Error('no pending intent');
  saved={...saved,attempted:true,attempts:(saved.attempts||0)+1};
  attempts.push(key);return structuredClone(saved);
 },
 async markKnowledgeIntentConflict(id,key){
  assert.equal(id,contextId);assert.equal(key,requestId);
  saved={...saved,status:'needs_review',conflict:'stale_context_revision'};
  return structuredClone(saved);
 },
 async acknowledgeKnowledgeIntent(id,key,revision){
  assert.equal(id,contextId);assert.equal(key,requestId);
  assert.equal(revision,4);
  receipt={requestId:key,revision};
  saved=null;confirmed.push(key);return receipt;
 }
};
handle={userId:a,storage};
const client={
 auth:{getUser:async()=>({data:{user:{id:a}},error:null})},
 rpc(name,args){
  calls.push({name,args});
  return {setHeader(header,value){
   assert.equal(header,'Authorization');assert.equal(value,'Bearer test-account-token');
   return Promise.resolve().then(()=>send(name,args));
  }};
 }
};
const scope=vm.createContext({
 LemmaAccount:{client,get user(){return identity?{id:identity}:null;}},
 LemmaSync:{accountHandle(){return handle;}},
 LemmaCloud:{accountToken:async(_client,id)=>{
  assert.equal(_client,client);assert.equal(id,a);return 'test-account-token';
 }},
 navigator:{get onLine(){return online;}},
 Model:{notes:new Map()},Store:{whenSaved:async()=>{}},structuredClone
});
vm.runInContext(fs.readFileSync('src/app/cloud_bridge.js','utf8')+
 '\nglobalThis.bridge=LemmaCloudBridge',scope);
const api=scope.bridge;
(async()=>{
 await assert.rejects(api.submitApprovedKnowledgeDraft('bad'),/Invalid knowledge context/);
 await assert.rejects(api.submitApprovedKnowledgeDraft(contextId),/No approved knowledge intent/);
 saved={...pending(),status:'draft',approvedBy:null};
 await assert.rejects(api.submitApprovedKnowledgeDraft(contextId),/Explicit student approval/);
 assert.equal(calls.length,0,'unapproved tutor drafts cannot reach RPC');
 saved=pending();online=false;
 const offline=await api.submitApprovedKnowledgeDraft(contextId);
 assert.equal(offline.status,'queued');
 assert.equal(offline.requestId,requestId);
 assert.equal(calls.length,0,'offline action cannot report confirmed or transmit');
 assert.equal(attempts.length,0,'no attempted marker until network is possible');
 online=true;
 send=()=>({data:4,error:null});
 const accepted=await api.submitApprovedKnowledgeDraft(contextId);
 assert.equal(accepted.status,'confirmed');assert.equal(accepted.revision,4);
 assert.equal(accepted.requestId,requestId);
 assert.deepEqual(attempts,[requestId]);assert.deepEqual(confirmed,[requestId]);
 assert.equal(calls[0].name,'commit_structured_study_context');
 assert.equal(calls[0].args.p_expected_revision,3);
 assert.equal(calls[0].args.p_request_id,requestId);
 assert.equal(calls[0].args.p_payload.schema_version,1);
 const again=await api.submitApprovedKnowledgeDraft(contextId);
 assert.equal(again.status,'confirmed');assert.equal(calls.length,1,
  'a local confirmed receipt is not an occasion to send again');
 // Unknown network outcome: local attempted intent remains, retries use the
 // exact same request key and expected server revision.
 receipt=null;saved=pending();
 send=()=>{throw Error('secret-bearing transport failure');};
 await assert.rejects(api.submitApprovedKnowledgeDraft(contextId),
  /Knowledge request failed; retry when connected/);
 assert.equal(saved.status,'approved_pending');
 assert.equal(saved.attempted,true);
 assert.equal(saved.requestId,requestId);
 const lostIndex=calls.length-1;
 send=()=>({data:4,error:null});
 assert.equal((await api.submitApprovedKnowledgeDraft(contextId)).status,'confirmed');
 assert.equal(calls[lostIndex].args.p_request_id,
  calls[lostIndex+1].args.p_request_id,'lost response uses original immutable request ID');
 // Stale context is an explicit conflict, never rewritten and never sent
 // again without a student's later reviewed resolution.
 receipt=null;saved=pending();
 send=()=>({data:null,error:{message:'stale_context_revision'}});
 const conflict=await api.submitApprovedKnowledgeDraft(contextId);
 assert.equal(conflict.status,'conflict');
 assert.equal(saved.status,'needs_review');
 assert.equal(saved.markdown,'Student reviewed proof');
 const total=calls.length;
 assert.equal((await api.submitApprovedKnowledgeDraft(contextId)).status,'conflict');
 assert.equal(calls.length,total,'stale revision must not be auto-rebased/retried');
 // A callback arriving after an identity switch is never projected as A's
 // confirmed status in B and retains A's original pending retry ID.
 receipt=null;saved=pending();identity=a;handle={userId:a,storage};
 send=()=>{identity=b;handle={userId:b,storage};return {data:4,error:null};};
 await assert.rejects(api.submitApprovedKnowledgeDraft(contextId),/Account changed/);
 assert.equal(saved.status,'approved_pending');
 assert.equal(saved.requestId,requestId);
 assert.equal(receipt,null);
 console.log('PASS KNOWLEDGE K2g: exact-key authenticated submit, offline queue, network-lost retry, confirmed receipt, stale conflict and account-switch rejection');
})().catch(e=>{console.error('FAIL K2g submit bridge: '+e.message);process.exitCode=1;});
