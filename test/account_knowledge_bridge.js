'use strict';
// KNOWLEDGE-01 K2d: account-scoped RPC adapter, no production or network calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const userA='00000000-0000-4000-8000-000000000001';
const userB='00000000-0000-4000-8000-000000000002';
const contextId='00000000-0000-4000-8000-000000000003';
const sourceId='00000000-0000-4000-8000-000000000004';
const sectionId='00000000-0000-4000-8000-000000000005';
const requestId='00000000-0000-4000-8000-000000000006';
let currentUser=userA,online=true;
let onSend=()=>({data:{ok:true}});
const calls=[],headers=[];
const client={
 auth:{getUser:async()=>({data:{user:{id:userA}},error:null})},
 rpc(name,args){
  calls.push({name,args});
  return {setHeader(k,v){
   headers.push({k,v});
   return Promise.resolve().then(()=>onSend(name,args));
  }};
 }
};
const bridgeSrc=fs.readFileSync('src/app/cloud_bridge.js','utf8');
const scope=vm.createContext({
 LemmaAccount:{client,get user(){return {id:currentUser};}},
 LemmaCloud:{accountToken:async(_client,id)=>{
  assert.equal(_client,client);assert.equal(id,userA);
  return 'scoped-test-token';
 }},
 get navigator(){return {onLine:online};},
 Model:{notes:new Map()},
 Store:{whenSaved:async()=>{}},
 structuredClone
});
vm.runInContext(bridgeSrc+'\nglobalThis.knowledgeBridge=LemmaCloudBridge',scope);
const bridge=scope.knowledgeBridge;
(async()=>{
 assert.equal(typeof bridge.readAcceptedContext,'function');
 assert.equal(typeof bridge.readAcceptedExcerpts,'function');
 assert.equal(typeof bridge.commitAcceptedContext,'function');
 const packet=await bridge.readAcceptedContext(contextId,3);
 assert.equal(packet.ok,true);
 assert.equal(calls[0].name,'get_accepted_study_context');
 assert.equal(calls[0].args.p_context_id,contextId);
 assert.equal(calls[0].args.p_revision,3);
 assert.equal(headers[0].v,'Bearer scoped-test-token');
 const excerpts=await bridge.readAcceptedExcerpts(contextId,sourceId,2,sectionId,3);
 assert.equal(excerpts.ok,true);
 assert.equal(calls[1].name,'get_knowledge_excerpts');
 assert.equal(calls[1].args.p_source_revision,2);
 assert.equal(calls[1].args.p_after_section_id,sectionId);
 assert.equal(calls[1].args.p_limit,3);
 let count=calls.length;
 await assert.rejects(bridge.readAcceptedContext('invalid'),/Invalid accepted/);
 await assert.rejects(bridge.readAcceptedExcerpts(contextId,sourceId,2,null,7),
  /Invalid knowledge/);
 await assert.rejects(bridge.readAcceptedExcerpts(contextId,userB,0),/Invalid knowledge/);
 assert.equal(calls.length,count,'bad references must never be sent');
 const payload={schema_version:1,goals:['Prove compactness']};
 const accepted={contextId,expectedRevision:2,requestId,title:'Topology',
  markdown:'Student accepted',payload,studentApproved:true};
 const noApproval={...accepted,studentApproved:false};
 await assert.rejects(bridge.commitAcceptedContext(noApproval),
  /Student approval required/);
 await assert.rejects(bridge.commitAcceptedContext({
  ...accepted,requestId:null
 }),/Invalid accepted context write/);
 assert.equal(calls.length,count,'no consent or unstable request must never touch RPC');
 onSend=()=>({data:3});
 assert.equal(await bridge.commitAcceptedContext(accepted),3);
 assert.equal(calls.at(-1).name,'commit_structured_study_context');
 assert.equal(calls.at(-1).args.p_request_id,requestId);
 assert.equal(calls.at(-1).args.p_expected_revision,2);
 assert.equal(calls.at(-1).args.p_payload,payload);
 assert.equal(await bridge.commitAcceptedContext(accepted),3);
 assert.equal(calls.at(-1).args.p_request_id,requestId,
  'lost-response retries must reuse caller-supplied request id');
 const sent=calls.length;
 onSend=()=>({data:null,error:{message:'stale_context_revision'}});
 await assert.rejects(bridge.commitAcceptedContext(accepted),
  /stale_context_revision/);
 onSend=()=>({data:null,error:{message:'select * from private.password'}}); 
 await assert.rejects(bridge.readAcceptedContext(contextId),
  /Knowledge request failed; retry when connected/);
 onSend=()=>{throw Error('Sensitive token or content');};
 await assert.rejects(bridge.readAcceptedContext(contextId),
  /Knowledge request failed; retry when connected/);
 assert.ok(calls.length>sent);
 online=false;
 count=calls.length;
 await assert.rejects(bridge.readAcceptedContext(contextId),/Knowledge is offline/);
 await assert.rejects(bridge.commitAcceptedContext(accepted),/Knowledge is offline/);
 assert.equal(calls.length,count,'offline writes must not claim durability');
 online=true;
 // A callback resolves after logout/account switch: drop response.
 onSend=()=>{currentUser=userB;return {data:{private:'old owner'}};};
 await assert.rejects(bridge.readAcceptedContext(contextId),/Account changed/);
 currentUser=userB;
 count=calls.length;
 await assert.rejects(bridge.readAcceptedContext(contextId),/Account changed/);
 assert.equal(calls.length,count,'no stale account requests may be dispatched');
 currentUser=userA;
 onSend=()=>({data:{restored:true}});
 assert.deepEqual(await bridge.readAcceptedContext(contextId),{restored:true});
 console.log('PASS K2d account-scoped accepted knowledge RPC, student consent, stable retry, offline/account guards and error redaction');
})().catch(e=>{console.error('FAIL K2d knowledge bridge: '+e.message);process.exitCode=1;});
