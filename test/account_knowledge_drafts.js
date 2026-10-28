'use strict';
// KNOWLEDGE-01 K2e: client authorization and in-flight account-switch guards.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const contextId='00000000-0000-4000-8000-000000000003';
const operations=[];
let identity=a,handle={userId:a};
const storage={
 async knowledgeDraft(id){operations.push(['read',id]);return {status:'draft',contextId:id};},
 async saveKnowledgeDraft(item){operations.push(['save',item]);return {status:'draft',contextId:item.contextId};},
 async discardKnowledgeDraft(id,r){operations.push(['discard',id,r]);return true;},
 async approveKnowledgeDraft(id,r,approved){operations.push(['approve',id,r,approved]);return {status:'approved_pending',requestId:'stable-id'};}
};
handle.storage=storage;
const scope=vm.createContext({
 LemmaAccount:{client:{},get user(){return identity?{id:identity}:null;}},
 LemmaSync:{accountHandle(){return handle;}},
 LemmaCloud:{accountToken:async()=>{throw Error('draft should not use network')}},
 Model:{notes:new Map()},Store:{whenSaved:async()=>{}},structuredClone
});
vm.runInContext(fs.readFileSync('src/app/cloud_bridge.js','utf8')+
 '\nglobalThis.bridge=LemmaCloudBridge',scope);
const api=scope.bridge;
(async()=>{
 assert.equal((await api.readKnowledgeDraft(contextId)).status,'draft');
 assert.equal((await api.saveKnowledgeDraft({contextId,expectedLocalRevision:0})).status,'draft');
 assert.equal(await api.discardKnowledgeDraft(contextId,1),true);
 await assert.rejects(api.approveKnowledgeDraft(contextId,1,false),/Explicit student approval/);
 await assert.rejects(api.approveKnowledgeDraft('invalid',1,true),/Invalid knowledge context/);
 assert.equal((await api.approveKnowledgeDraft(contextId,1,true)).status,'approved_pending');
 assert.deepEqual(operations.map(x=>x[0]),['read','save','discard','approve']);
 await assert.rejects(api.readKnowledgeDraft('invalid'),/Invalid knowledge context/);
 await assert.rejects(api.saveKnowledgeDraft({contextId:'invalid'}),/Invalid knowledge context/);
 assert.equal(operations.length,4);
 // Sign-out before initiating any read/writes is fail-closed.
 identity=null;
 await assert.rejects(api.readKnowledgeDraft(contextId),/Sign in to an available/);
 assert.equal(operations.length,3);
 identity=b;
 await assert.rejects(api.saveKnowledgeDraft({contextId}),/Sign in to an available/);
 assert.equal(operations.length,3);
 identity=a;
 let finish;
 storage.knowledgeDraft=id=>new Promise(resolve=>{finish=()=>resolve({status:'draft',contextId:id});});
 const pending=api.readKnowledgeDraft(contextId);
 identity=b;handle={userId:b,storage};
 finish();
 await assert.rejects(pending,/Account changed/,"old owner draft cannot be displayed");
 identity=a;handle={userId:a,storage};
 let finishSave;
 storage.saveKnowledgeDraft=()=>new Promise(resolve=>{finishSave=()=>resolve({status:'draft'});});
 const pendingSave=api.saveKnowledgeDraft({contextId});
 identity=null;handle=null;
 finishSave();
 await assert.rejects(pendingSave,/Account changed/);
 identity=a;handle={userId:a,storage};
 let finishApproval;
 storage.approveKnowledgeDraft=()=>new Promise(resolve=>{
  finishApproval=()=>resolve({status:'approved_pending',requestId:'old-owner-key'});
 });
 const waitingApproval=api.approveKnowledgeDraft(contextId,3,true);
 identity=b;handle={userId:b,storage};
 finishApproval();
 await assert.rejects(waitingApproval,/Account changed/,
  'an old-account accepted intent cannot display under another user');
 assert.equal(operations.filter(x=>x[0]==='approve').length,1,
  'a missing-consent action did not issue a local approval');
 console.log('PASS KNOWLEDGE K2f: account-scoped explicit draft approval, no network, identity-change rejection');
})().catch(e=>{console.error('FAIL K2f draft bridge: '+e.message);process.exitCode=1;});
