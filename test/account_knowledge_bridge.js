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
const accountHandle={userId:userA};
let activeHandle=accountHandle;
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
 LemmaSync:{accountHandle:()=>activeHandle},
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
 // K2i: context-selected immutable source citation, bounded to one page.
 assert.equal(typeof bridge.readPinnedAcceptedCitation,'function');
 const contextPacket={context_id:contextId,revision:4,format:'structured_v1',
  title:'Topology',context_markdown:'Accepted content',
  accepted_json:{schema_version:1,source_refs:[{source_id:sourceId,revision:2}]}};
 const sourcePacket={context_id:contextId,context_revision:1,source_id:sourceId,
  source_revision:2,title:'Source',source_type:'manual',citation:{edition:'v1'},
  excerpts:[{section_id:sectionId,locator:'§1',title:'Lemma',
   text:'Accepted proof excerpt',sha256:'a'.repeat(64)}],has_more:false};
 onSend=(name,args)=>{
  if(name==='get_accepted_study_context')return {data:contextPacket};
  if(name==='get_knowledge_excerpts'){
   assert.equal(args.p_source_revision,2,'source revision must follow pinned context');
   assert.equal(args.p_limit,2,'server page size must be bounded');
   return {data:sourcePacket};
  }
  throw new Error('unexpected read-only citation RPC');
 };
 const first=await bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,2);
 assert.equal(first.context.revision,4);
 assert.equal(first.source.source_revision,2);
 assert.equal(first.source.excerpts[0].section_id,sectionId);
 const anotherTutor=await bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,2);
 assert.equal(JSON.stringify(first),JSON.stringify(anotherTutor),
  'independent readers requesting the accepted revision get the same cited packet');
 let before=calls.length;
 await assert.rejects(bridge.readPinnedAcceptedCitation(contextId,userB,4,null,2),
  /Source is not referenced/);
 assert.equal(calls.length,before+1,'unreferenced source cannot trigger excerpt RPC');
 await assert.rejects(bridge.readPinnedAcceptedCitation(contextId,sourceId,4,'bad',2),
  /Invalid knowledge citation/);
 await assert.rejects(bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,7),
  /Invalid knowledge citation/);
 const pageCases=[
  {...sourcePacket,source_revision:3},
  {...sourcePacket,context_id:userB},
  {...sourcePacket,context_revision:5},
  {...sourcePacket,excerpts:Array(3).fill(sourcePacket.excerpts[0])},
  {...sourcePacket,excerpts:[{...sourcePacket.excerpts[0],sha256:'bad'}]},
  {...sourcePacket,has_more:'false'}
 ];
 for(const badPage of pageCases){
  onSend=(name)=>({data:name==='get_accepted_study_context'?contextPacket:badPage});
  await assert.rejects(bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,2),
   /Accepted citation packet is inconsistent/);
 }
 onSend=(name)=>({data:name==='get_accepted_study_context'?
  {...contextPacket,revision:5}:sourcePacket});
 await assert.rejects(bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,2),
  /not citation-ready/,'incorrect context revision cannot be displayed');
 onSend=(name)=>{
  if(name==='get_accepted_study_context'){
   activeHandle={userId:userA};
   return {data:contextPacket};
  }
  return {data:sourcePacket};
 };
 before=calls.length;
 await assert.rejects(bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,2),
  /Account changed during knowledge citation read/);
 assert.equal(calls.length,before+1,'workspace switch must stop before source RPC');
 activeHandle=accountHandle;
 onSend=(name)=>{
  if(name==='get_knowledge_excerpts') currentUser=userB;
  return {data:name==='get_accepted_study_context'?contextPacket:sourcePacket};
 };
 await assert.rejects(bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,2),
  /Account changed/,'sign-out between calls must not expose old-owner excerpt');
 currentUser=userA;
 onSend=(name)=>({data:name==='get_accepted_study_context'?contextPacket:sourcePacket});
 assert.equal((await bridge.readPinnedAcceptedCitation(contextId,sourceId,4,null,2))
  .source.excerpts[0].text,'Accepted proof excerpt');
 assert.equal(calls.filter(x=>x.name==='commit_structured_study_context').length,2,
  'citation tests must be read-only; only earlier explicit acceptance tests may commit');

 console.log('PASS K2d/K2i account-scoped accepted knowledge RPC, student consent, stable retry, offline/account guards and error redaction');
})().catch(e=>{console.error('FAIL K2d knowledge bridge: '+e.message);process.exitCode=1;});
