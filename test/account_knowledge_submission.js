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
const conflictArchives=[];
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
 },
 async reopenKnowledgeConflictDraft(id,localRevision,key,serverRevision,reviewed){
  assert.equal(id,contextId);assert.equal(key,requestId);
  assert.equal(reviewed,true);
  assert.equal(localRevision,5);assert.equal(serverRevision,4);
  if(saved.status!=='needs_review')throw Error('not a conflict');
  conflictArchives.push(structuredClone(saved));
  const {approvedBy,requestId:oldKey,attempted,attempts,conflict,...data}=saved;
  saved={...data,status:'draft',expectedRevision:serverRevision,
   localRevision:localRevision+1,reopenedFromRequestId:oldKey,
   reopenedFromLocalRevision:localRevision};
  return structuredClone(saved);
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
 // K2h1: inspect accepted remote and preserved local stale content only
 // after an explicit student-approved intent hit a revision conflict.
 identity=a;handle={userId:a,storage};online=true;
 saved={...pending(),status:'needs_review',localRevision:5};
 send=(name,args)=>{
  assert.equal(name,'get_accepted_study_context');
  assert.equal(args.p_context_id,contextId);
  assert.equal(args.p_revision,null,'compare latest accepted, not stale historical');
  return {data:{context_id:contextId,revision:4,title:'Accepted by another device',
    context_markdown:'Current server content',accepted_json:{schema_version:1}}};
 };
 const beforeRead=calls.length;
 const packet=await api.inspectKnowledgeConflict(contextId);
 assert.equal(packet.status,'needs_review');
 assert.equal(packet.local.markdown,'Student reviewed proof');
 assert.equal(packet.accepted.revision,4);
 assert.equal(saved.status,'needs_review');
 assert.equal(calls.length,beforeRead+1,'only one owner-scoped context read');
 assert.equal(calls.at(-1).name,'get_accepted_study_context');
 const oldRequestId=saved.requestId;
 assert.equal(packet.local.requestId,oldRequestId,
  'inspection cannot overwrite the approved attempt or its request ID');
 send=()=>({data:{context_id:contextId,revision:3}});
 await assert.rejects(api.inspectKnowledgeConflict(contextId),/unavailable for comparison/);
 online=false;
 const disconnectedCalls=calls.length;
 await assert.rejects(api.inspectKnowledgeConflict(contextId),/Knowledge is offline/);
 assert.equal(calls.length,disconnectedCalls,'no remote read when offline');
 online=true;
 saved={...pending(),status:'approved_pending',localRevision:5};
 const nonConflictCalls=calls.length;
 await assert.rejects(api.inspectKnowledgeConflict(contextId),/No reviewed stale/);
 assert.equal(calls.length,nonConflictCalls,'pending approval is not a stale conflict');
 saved={...pending(),status:'needs_review',localRevision:5};
 send=()=>{
  saved={...saved,localRevision:6};
  return {data:{context_id:contextId,revision:4}};
 };
 await assert.rejects(api.inspectKnowledgeConflict(contextId),/changed during inspection/);
 saved={...pending(),status:'needs_review',localRevision:5};
 send=()=>{
  identity=b;handle={userId:b,storage};
  return {data:{context_id:contextId,revision:4}};
 };
 await assert.rejects(api.inspectKnowledgeConflict(contextId),/Account changed/);
 identity=a;handle={userId:a,storage};
 assert.equal(saved.status,'needs_review','identity race cannot change local approval state');
 await assert.rejects(api.inspectKnowledgeConflict('invalid'),/Invalid knowledge context/);
 // K2h2: explicit user-reviewed reopen is a local unapproved draft,
 // never a second server commit or an implicit reapproval of stale content.
 identity=a;handle={userId:a,storage};online=true;receipt=null;
 saved={...pending(),status:'needs_review',localRevision:5};
 send=()=>({data:{context_id:contextId,revision:4,
  title:'Current accepted context',context_markdown:'Remote edit'}});
 const beforeChoice=calls.length;
 await assert.rejects(api.reopenReviewedKnowledgeConflict(
  contextId,5,requestId,4,false),/Explicit reviewed/);
 assert.equal(calls.length,beforeChoice,'no consent cannot make a remote request');
 await assert.rejects(api.reopenReviewedKnowledgeConflict(
  contextId,5,requestId,3,true),/changed; compare again/);
 assert.equal(saved.status,'needs_review');
 await assert.rejects(api.reopenReviewedKnowledgeConflict(
  contextId,4,requestId,4,true),/changed; compare again/);
 assert.equal(conflictArchives.length,0,'stale comparisons cannot archive intent');
 send=()=>{identity=b;handle={userId:b,storage};
  return {data:{context_id:contextId,revision:4}};};
 await assert.rejects(api.reopenReviewedKnowledgeConflict(
  contextId,5,requestId,4,true),/Account changed/);
 assert.equal(conflictArchives.length,0);
 identity=a;handle={userId:a,storage};
 send=()=>({data:{context_id:contextId,revision:4}});
 const commitCount=calls.filter(x=>x.name==='commit_structured_study_context').length;
 const restarted=await api.reopenReviewedKnowledgeConflict(
  contextId,5,requestId,4,true);
 assert.equal(restarted.status,'draft');
 assert.equal(restarted.expectedRevision,4);
 assert.equal(restarted.localRevision,6);
 assert.equal(restarted.approvedBy,undefined);
 assert.equal(restarted.requestId,undefined);
 assert.equal(restarted.reopenedFromRequestId,requestId);
 assert.equal(conflictArchives.length,1);
 assert.equal(conflictArchives[0].requestId,requestId);
 const readCount=calls.length;
 assert.equal((await api.reopenReviewedKnowledgeConflict(
  contextId,5,requestId,4,true)).status,'draft');
 assert.equal(calls.length,readCount,'lost local response requires no second RPC');
 assert.equal(calls.filter(x=>x.name==='commit_structured_study_context').length,
  commitCount,'reopening never sends a new accepted write');
 await assert.rejects(api.submitApprovedKnowledgeDraft(contextId),
  /Explicit student approval/);
 console.log('PASS KNOWLEDGE K2g/K2h1/K2h2: exact-key authenticated submit, offline queue, network-lost retry, confirmed receipt, stale conflict and account-switch rejection');
})().catch(e=>{console.error('FAIL K2g submit bridge: '+e.message);process.exitCode=1;});
