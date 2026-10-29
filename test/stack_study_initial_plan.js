'use strict';
// First-plan publication against disposable loopback GoTrue/PostgREST only.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {randomUUID,webcrypto}=require('node:crypto');
const {indexedDB}=require('fake-indexeddb');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
async function main(){
 const {key}=localCredentials();assert.ok(isLocalAnonKey(key));
 const call=async(path,token,method='GET',body)=>{
  assert.ok(path.startsWith('/'));
  const response=await fetch('http://127.0.0.1:54321'+path,{method,redirect:'error',
   headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {ok:response.ok,body:await response.json()};
 };
 const must=async(...args)=>{const result=await call(...args);assert.ok(result.ok,JSON.stringify(result.body));return result.body};
 const signup=async()=>{const data=await must('/auth/v1/signup',key,'POST',{
  email:'initial-plan-'+randomUUID()+'@example.test',password:'Synthetic-'+randomUUID()+'-A9!'});
  return {id:data.user.id,token:data.access_token}};
 const [a,b]=await Promise.all([signup(),signup()]),contextId=randomUUID(),planId=randomUUID();
 const context=revision=>must('/rest/v1/rpc/commit_study_context',a.token,'POST',{
  p_context_id:contextId,p_expected_revision:revision-1,p_request_id:randomUUID(),
  p_title:'Local context',p_context_markdown:'Synthetic planning context revision '+revision});
 assert.equal(await context(1),1);
 let online=true,lose=false,publishes=0;
 function load(user){
  const client={from(table){const params=new URLSearchParams();
   const q={select(columns){params.set('select',columns);return q},
    eq(k,v){params.append(k,'eq.'+v);return q},limit(n){params.set('limit',n);return q},
    order(k,opts){params.set('order',k+'.'+(opts?.ascending===false?'desc':'asc'));return q},
    setHeader(){return call('/rest/v1/'+table+'?'+params,user.token).then(r=>r.ok?{data:r.body}:{error:r.body})}};return q;
  },rpc(name,args){return {async setHeader(){
   if(name==='publish_study_plan')publishes++;
   const result=await call('/rest/v1/rpc/'+name,user.token,'POST',args);
   if(name==='publish_study_plan'&&lose){lose=false;throw Error('response lost after actual commit')}
   return result.ok?{data:result.body}:{error:result.body};
  }}}};
  const scope=vm.createContext({indexedDB,crypto:webcrypto,structuredClone,Date,
   LemmaAccount:{client,user:{id:user.id},onIdentityChange(){}},
   LemmaCloud:{async accountToken(){return user.token}},
   LemmaCloudBridge:{async readAcceptedContext(id){return must('/rest/v1/rpc/get_accepted_study_context',user.token,'POST',{p_context_id:id,p_revision:null})}},
   get navigator(){return {onLine:online}}});
  vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+'\nglobalThis.api=StudyPlan;',scope);
  return scope.api;
 }
 const input=(id=planId)=>({planId:id,expectedRevision:0,title:'Twelve proofs',objective:'Understand by proving',
  contextId,contextRevision:1,changeSummary:'Local student-reviewed initial plan',
  snapshot:{checkpoints:Array.from({length:12},(_,i)=>({checkpoint_id:'proof-'+(i+1),
   title:'Proof '+(i+1),objective:'Justify lemma '+(i+1),
   prerequisite_checkpoint_ids:i?['proof-'+i]:[],source_refs:[],learning_tasks:['Attempt the proof'],
   mastery_criterion:'Every step justified',assessment_prompt:'Prove the lemma',status:'not_started'}))}});
 let api=load(a);online=false;
 await api.saveInitialPlanDraft(input());assert.equal(publishes,0);
 api=load(a);assert.equal((await api.listInitialPlanDrafts())[0].planId,planId);
 assert.equal((await load(b).listInitialPlanDrafts()).length,0);
 online=true;const review=await api.reviewInitialPlanDraft(planId);
 await api.approveInitialPlanDraft(planId,review,true);assert.equal(publishes,0);
 assert.equal((await must('/rest/v1/study_plans?select=id&id=eq.'+planId,a.token)).length,0);
 lose=true;await assert.rejects(api.submitApprovedPlanDraft(planId),/retry with the same/);
 const keyBefore=(await api.readPlanDraft(planId)).requestId;
 api=load(a);assert.equal((await api.readPlanDraft(planId)).requestId,keyBefore);
 assert.equal((await api.submitApprovedPlanDraft(planId)).revision,1);
 const versions=await must('/rest/v1/study_plan_versions?select=revision,request_id&plan_id=eq.'+planId,a.token);
 assert.equal(versions.length,1);assert.equal(versions[0].request_id,keyBefore);assert.equal(publishes,2);
 assert.equal((await api.activeContext()).checkpoint.id,'proof-1');
 assert.equal((await must('/rest/v1/study_plan_versions?select=revision&plan_id=eq.'+planId,b.token)).length,0);
 const foreign=randomUUID();await load(b).saveInitialPlanDraft(input(foreign));
 await assert.rejects(load(b).reviewInitialPlanDraft(foreign));assert.equal(publishes,2);
 const stale=randomUUID();await api.saveInitialPlanDraft(input(stale));
 await api.approveInitialPlanDraft(stale,await api.reviewInitialPlanDraft(stale),true);
 assert.equal(await context(2),2);
 assert.equal((await api.submitApprovedPlanDraft(stale)).status,'conflict');
 assert.equal((await api.readPlanDraft(stale)).status,'needs_review');
 assert.equal((await must('/rest/v1/study_plans?select=id&id=eq.'+stale,a.token)).length,0);
 console.log('PASS local first-plan: 12 checkpoints, actual accepted context, owner isolation, consent separation, lost-response dedupe, reload and stale-context refusal');
}
main().catch(error=>{console.error(error);process.exitCode=1});
