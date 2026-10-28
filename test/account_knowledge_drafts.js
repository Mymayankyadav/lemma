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
 async discardKnowledgeDraft(id,r){operations.push(['discard',id,r]);return true;}
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
 assert.deepEqual(operations.map(x=>x[0]),['read','save','discard']);
 await assert.rejects(api.readKnowledgeDraft('invalid'),/Invalid knowledge context/);
 await assert.rejects(api.saveKnowledgeDraft({contextId:'invalid'}),/Invalid knowledge context/);
 assert.equal(operations.length,3);
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
 console.log('PASS KNOWLEDGE K2e: account-scoped unapproved draft API, no network, identity-change rejection');
})().catch(e=>{console.error('FAIL K2e draft bridge: '+e.message);process.exitCode=1;});
