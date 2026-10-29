'use strict';
// First-use API: real local IndexedDB, synthetic cloud, no production writes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {indexedDB}=require('fake-indexeddb');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
let owner=id(1),online=false,acceptedRevision=2,existing=false,lost=true,onContext=()=>{};
const calls=[],listeners=[];
const client={from(table){
  assert.equal(table,'study_plans');const filters=[];
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},limit(){return q},
    setHeader(){assert.ok(filters.some(([k,v])=>k==='user_id'&&v===owner));
      return Promise.resolve({data:existing?[{id:id(3),revision:1}]:[]});}};return q;
},rpc(name,args){return {setHeader(){
  calls.push({name,args});if(lost)return Promise.reject(Error('response lost'));
  return Promise.resolve({data:1});
}}}};
function load(){
 const scope=vm.createContext({indexedDB,crypto:webcrypto,structuredClone,Date,
  LemmaAccount:{client,get user(){return owner?{id:owner}:null},onIdentityChange(fn){listeners.push(fn)}},
  LemmaCloud:{async accountToken(){return 'local'}},
  LemmaCloudBridge:{async readAcceptedContext(contextId){onContext();return {context_id:contextId,revision:acceptedRevision}}},
  get navigator(){return {onLine:online}}});
 vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+'\nglobalThis.api=StudyPlan;',scope);
 return scope.api;
}
const switchOwner=value=>{owner=value;listeners.forEach(fn=>fn());};
const cp={checkpoint_id:'proof-1',title:'Compactness',objective:'Prove the finite cover property',
 prerequisite_checkpoint_ids:[],source_refs:['notes:3.2'],learning_tasks:['Attempt a proof'],
 mastery_criterion:'Every implication justified',assessment_prompt:'Prove the claim',status:'not_started'};
const input=()=>({planId:id(3),expectedRevision:0,title:'Topology',objective:'Learn by proving',
 contextId:id(4),contextRevision:2,changeSummary:'First plan',snapshot:{checkpoints:[cp]}});
(async()=>{
 const api=load();assert.equal((await api.listInitialPlanDrafts()).length,0);
 for(const bad of [
  {...input(),contextId:null,contextRevision:null},
  {...input(),expectedRevision:1},
  {...input(),snapshot:{checkpoints:[{...cp,status:'demonstrated'}]}},
  {...input(),snapshot:{checkpoints:[{...cp,assessment_prompt:''}]}},
  {...input(),snapshot:{checkpoints:[{...cp,prerequisite_checkpoint_ids:['missing']}]}},
  {...input(),snapshot:{checkpoints:[{...cp,prerequisite_checkpoint_ids:['proof-1']}]}}
 ])await assert.rejects(api.saveInitialPlanDraft(bad));
 assert.equal(calls.length,0);
 const row=await api.saveInitialPlanDraft(input());
 assert.equal(row.status,'draft');assert.equal((await load().listInitialPlanDrafts())[0].planId,id(3));
 assert.equal(calls.length,0,'save/reload/list are cloud-write-free');
 await assert.rejects(api.reviewInitialPlanDraft(id(3)),/offline/);
 online=true;
 const reviewed=await api.reviewInitialPlanDraft(id(3));
 assert.equal(reviewed.snapshot.checkpoints[0].mastery_criterion,cp.mastery_criterion);
 await assert.rejects(api.approveInitialPlanDraft(id(3),reviewed,false),/Explicit student approval/);
 acceptedRevision=3;
 await assert.rejects(api.approveInitialPlanDraft(id(3),reviewed,true),/Accepted context changed/);
 acceptedRevision=2;existing=true;
 await assert.rejects(api.reviewInitialPlanDraft(id(3)),/already published/);existing=false;
 const changed=await api.saveInitialPlanDraft({...input(),expectedLocalRevision:1,title:'Edited topology'});
 await assert.rejects(api.approveInitialPlanDraft(id(3),reviewed,true),/changed; review again/);
 const reviewedAgain=await api.reviewInitialPlanDraft(id(3));
 onContext=()=>{reviewedAgain.title='Caller mutation during approval read';};
 const approved=await api.approveInitialPlanDraft(id(3),reviewedAgain,true);
 onContext=()=>{};
 assert.equal(approved.title,changed.title,'approval pins a private copy of the displayed review before awaits');
 assert.equal(approved.status,'approved_pending');assert.equal(calls.length,0,'approval is not publication');
 online=false;assert.equal((await api.submitApprovedPlanDraft(id(3))).status,'queued');
 assert.equal((await load().readPlanDraft(id(3))).requestId,approved.requestId);
 switchOwner(id(2));assert.equal((await api.listInitialPlanDrafts()).length,0);
 assert.equal(await api.readPlanDraft(id(3)),null);
 switchOwner(id(1));online=true;
 await assert.rejects(api.submitApprovedPlanDraft(id(3)),/retry with the same/);
 lost=false;assert.equal((await api.submitApprovedPlanDraft(id(3))).status,'confirmed');
 assert.equal(calls.length,2);assert.equal(calls[0].args.p_request_id,calls[1].args.p_request_id);
 assert.equal(calls[0].args.p_expected_revision,0);assert.equal(calls[0].args.p_context_id,id(4));
 assert.equal((await api.listInitialPlanDrafts()).length,0,'confirmed initial draft is removed only with receipt');
 await api.saveInitialPlanDraft({...input(),planId:id(5)});
 onContext=()=>switchOwner(id(2));
 await assert.rejects(api.reviewInitialPlanDraft(id(5)),/Account changed/);
 assert.equal(calls.length,2,'read/review identity switch cannot publish');
 console.log('PASS first plan: durable owner-private intake, graph/context review, explicit approval, offline/lost-response stable publication');
})().catch(error=>{console.error(error);process.exitCode=1});
