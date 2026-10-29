'use strict';
// PLAN-01 P5a: real disposable local GoTrue/PostgREST, never production.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID,webcrypto}=require('node:crypto');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const ORIGIN='http://127.0.0.1:54321';
async function main(){
 const {key}=localCredentials();
 assert.ok(isLocalAnonKey(key),'P5 gate requires disposable local anon key');
 const call=async(path,token,method='GET',body)=>{
  assert.ok(path.startsWith('/'),'no outbound origin');
  const resp=await fetch(ORIGIN+path,{method,redirect:'error',cache:'no-store',
   headers:{apikey:key,Authorization:'Bearer '+token,Accept:'application/json',
    ...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=await resp.json().catch(()=>null);
  return {ok:resp.ok,status:resp.status,body:json};
 };
 async function must(path,token,method,body){
  const result=await call(path,token,method,body);
  assert.ok(result.ok,'local HTTP '+result.status+': '+
   (result.body?.message||JSON.stringify(result.body)));
  return result.body;
 }
 async function signup(){
  return must('/auth/v1/signup',key,'POST',{
   email:'plan-gate-'+randomUUID()+'@example.test',
   password:'Lemma-P5-'+randomUUID()+'-A9!'
  }).then(x=>({id:x.user.id,token:x.access_token}));
 }
 const [A,B]=await Promise.all([signup(),signup()]);
 assert.ok(A.token&&B.token&&A.id!==B.id);
 const planA=randomUUID(),planB=randomUUID();
 const snapshot={checkpoints:Array.from({length:12},(_,i)=>({
  checkpoint_id:'proof-'+(i+1),
  title:'Local synthetic checkpoint '+(i+1),
  objective:'Write an exact proof for lemma '+(i+1),
  prerequisite_checkpoint_ids:i?['proof-'+i]:[],
  source_refs:['synthetic:chapter-'+(i+1)],
  mastery_criterion:'Give a complete reasoned proof'
 }))};
 function publish(user,id,expected,snap,requestId,changeSummary){
  return call('/rest/v1/rpc/publish_study_plan',user.token,'POST',{
   p_plan_id:id,p_expected_revision:expected,p_request_id:requestId,
   p_title:'P5 synthetic topology',p_objective:'Construct complete proofs',
   p_snapshot:snap,p_change_summary:changeSummary,
   p_context_id:null,p_expected_context_revision:null,
   p_author_model:'synthetic-local-fixture'
  });
 }
 const initialReq=randomUUID();
 assert.equal((await publish(A,planA,0,snapshot,initialReq,'Initial student-approved test fixture')).body,1);
 assert.equal((await publish(B,planB,0,snapshot,randomUUID(),'Second owner fixture')).body,1);
 // Minimal authenticated PostgREST adapter, always calling real local HTTP.
 // Mirrors StudyPlan's chainable contract without mocking any server answer.
 const adapter=(user)=>({
  from(table){
   const fields={table,selected:'*',filters:[],order:null,limit:null};
   const query={
    select(cols){fields.selected=cols;return query},
    eq(k,v){fields.filters.push([k,v]);return query},
    order(k,opts){fields.order=k+'.'+(opts?.ascending===false?'desc':'asc');return query},
    limit(n){fields.limit=n;return query},
    setHeader(k,v){
     assert.equal(k,'Authorization');
     assert.equal(v,'Bearer '+user.token);
     const qs=new URLSearchParams({select:fields.selected});
     for(const [name,val] of fields.filters)qs.append(name,'eq.'+val);
     if(fields.order)qs.set('order',fields.order);
     if(fields.limit!=null)qs.set('limit',fields.limit);
     return call('/rest/v1/'+fields.table+'?'+qs,user.token)
      .then(r=>r.ok?{data:r.body}:{data:null,error:{message:r.body?.message||'local read failed'}});
    }
   };
   return query;
  },
  rpc(name,args){
   return {setHeader(k,v){
    assert.equal(k,'Authorization');assert.equal(v,'Bearer '+user.token);
    return call('/rest/v1/rpc/'+name,user.token,'POST',args)
     .then(r=>r.ok?{data:r.body}:{data:null,error:{message:r.body?.message||'local RPC failed'}});
   }};
  }
 });
 const source=fs.readFileSync('src/app/study_plan.js','utf8');
 function reload(user){
  const client=adapter(user);
  const scope=vm.createContext({
   LemmaAccount:{client,user:{id:user.id},onIdentityChange(){}},
   LemmaCloud:{async accountToken(c,id){
    assert.equal(c,client);assert.equal(id,user.id);return user.token;
   }},
   crypto:webcrypto,Date,navigator:{onLine:true}
  });
  vm.runInContext(source+'\nglobalThis.study=StudyPlan;',scope);
  return scope.study;
 }
 let study=reload(A);
 assert.equal(study.ready,false,'P5 cannot enable UI before full visual gate');
 const before=await study.activeContext();
 assert.equal(before.planRevision,1);
 assert.equal(before.checkpoint.id,'proof-1','first checkpoint before events');
 const aId=randomUUID(),h3=randomUUID(),p7=randomUUID(),h7=randomUUID(),feedback=randomUUID();
 const write=(api,checkpoint,type,payload,eventId,expected)=>api.recordEvent({
  planId:planA,checkpointId:checkpoint,expectedPlanRevision:expected,
  type,payload,eventId,source:'synthetic-local-test'
 });
 const first=await write(study,'proof-3','attempt',
  {text:'Let the arbitrary open cover be U; how do I choose a finite cover?'},aId,1);
 const firstRetry=await write(study,'proof-3','attempt',
  {text:'Let the arbitrary open cover be U; how do I choose a finite cover?'},aId,1);
 assert.equal(firstRetry.seq,first.seq,'same event key must not append twice');
 await write(study,'proof-3','hint',{level:1,text:'Use compactness'},h3,1);
 await write(study,'proof-7','proof_step',
  {text:'My induction proof is unfinished at the last implication'},p7,1);
 await write(study,'proof-7','hint',{level:2,text:'Check the induction hypothesis'},h7,1);
 await write(study,'proof-7','feedback',
  {text:'Last step needs justification'},feedback,1);
 // Two explicit, observable demonstrations use synthetic complete proofs,
 // never a read/checkbox or inferred mastery. Both remain in the ledger.
 const demonstrations=[
  ['proof-3','A finite set K is compact: for each x in K choose a member of the given open cover containing x. These finitely many chosen members cover K.'],
  ['proof-7','For continuous f and compact K, pull an open cover of f(K) back along f. The inverse images cover K and have a finite subcover; the corresponding original sets cover f(K).']
 ];
 for(const [checkpoint,text] of demonstrations) {
  await write(study,checkpoint,'mastery_evidence',
   {text,source:'synthetic:chapter-'+checkpoint.split('-')[1]},randomUUID(),1);
  const visible=await reload(A).activeContext({planId:planA,checkpointId:checkpoint});
  assert.equal(visible.lastEvidence.text,text,'explicit assessment evidence survives reload for its selected checkpoint');
  assert.equal(visible.checkpoint.status,'not_started','recording evidence cannot silently change mastery status');
 }
 const afterReload=await reload(A).activeContext();
 assert.equal(afterReload.checkpoint.id,'proof-7');
 assert.equal(afterReload.lastAttempt.payload.text,
  'My induction proof is unfinished at the last implication');
 assert.equal(afterReload.hintLevel,2);
 assert.equal(afterReload.lastFeedback.text,'Last step needs justification');
 assert.equal(afterReload.planRevision,1);
 assert.equal(afterReload.sourceRefs[0],'synthetic:chapter-7');
 const secondAttempt=await must('/rest/v1/learning_events?select=event_id,session_id,seq&event_id=eq.'+p7,A.token);
 assert.equal(secondAttempt.length,1);
 assert.equal((await must('/rest/v1/learning_events?select=event_id&event_id=eq.'+aId,A.token)).length,1);
 assert.deepEqual(await must('/rest/v1/learning_events?select=event_id&event_id=eq.'+p7,B.token),[]);
 assert.equal((await reload(B).activeContext()).planId,planB,
  'second owner can see only their own approved plan');
 await assert.rejects(reload(B).recordEvent({
  planId:planA,checkpointId:'proof-7',expectedPlanRevision:1,
  type:'attempt',payload:{text:'illegal cross-owner'},eventId:randomUUID()
 }),/stale_plan_revision/);

 // Student-authorized amendment simulated ONLY for the disposable local test
 // owner; checkpoint IDs and prior evidence must survive the new revision.
 const amended=JSON.parse(JSON.stringify(snapshot));
 amended.checkpoints.splice(3,0,{
  checkpoint_id:'proof-prerequisite',title:'Missing compactness lemma',
  objective:'Prove the finite refinement lemma',
  prerequisite_checkpoint_ids:['proof-3'],
  source_refs:['synthetic:chapter-3b'],
  mastery_criterion:'Provide complete proof'
 });
 amended.checkpoints.find(cp=>cp.checkpoint_id==='proof-4')
  .prerequisite_checkpoint_ids=['proof-3','proof-prerequisite'];
 const amendReq=randomUUID();
 const revised=await publish(A,planA,1,amended,amendReq,'Approved synthetic prerequisite amendment');
 assert.ok(revised.ok,'local plan amendment must succeed: '+JSON.stringify(revised.body));
 assert.equal(revised.body,2);
 const repeat=await publish(A,planA,1,amended,amendReq,'Approved synthetic prerequisite amendment');
 assert.equal(repeat.body,2,'published request key retries return same version');
 const stale=await publish(A,planA,1,amended,randomUUID(),'Stale proposal');
 assert.equal(stale.body?.message,'stale_plan_revision');
 await assert.rejects(write(study,'proof-7','attempt',
  {text:'stale revision must not append'},randomUUID(),1),/stale_plan_revision/);
 // Retry of an already committed revision-1 event must still return its
 // original receipt even after the accepted plan advances to revision 2.
 const recovered=await write(study,'proof-7','proof_step',
  {text:'My induction proof is unfinished at the last implication'},p7,1);
 assert.equal(recovered.seq,secondAttempt[0].seq);
 assert.equal((await must('/rest/v1/learning_events?select=event_id&event_id=eq.'+p7,A.token)).length,1);
 const history=await must('/rest/v1/study_plan_versions?select=revision,snapshot&plan_id=eq.'+planA,A.token);
 assert.equal(history.length,2,'immutable old and amended versions remain readable');
 const old=history.find(x=>x.revision===1),current=history.find(x=>x.revision===2);
 assert.ok(old&&current);
 assert.equal(old.snapshot.checkpoints.length,12);
 assert.equal(current.snapshot.checkpoints.length,13);
 assert.ok(current.snapshot.checkpoints.some(x=>x.checkpoint_id==='proof-3'));
 assert.ok(current.snapshot.checkpoints.some(x=>x.checkpoint_id==='proof-7'));
 const amendmentPreview=study.diffPlanSnapshots(old.snapshot,current.snapshot);
 assert.deepEqual([...amendmentPreview.added],['proof-prerequisite']);
 assert.equal(amendmentPreview.unchanged.length,11);
 assert.equal(amendmentPreview.modified[0].checkpointId,'proof-4');
 const afterAmendment=await reload(A).activeContext();
 assert.equal(afterAmendment.planRevision,2);
 assert.equal(afterAmendment.checkpoint.id,'proof-1',
  'old proof events cannot be promoted as new revision activity');
 const newStepId=randomUUID(),newHintId=randomUUID();
 await write(reload(A),'proof-7','attempt',
  {text:'Continuing preserved proof using the new prerequisite'},newStepId,2);
 await write(reload(A),'proof-7','hint',
  {text:'Use the new lemma explicitly',level:3},newHintId,2);
 const resumed=await reload(A).activeContext();
 assert.equal(resumed.planRevision,2);
 assert.equal(resumed.checkpoint.id,'proof-7');
 assert.equal(resumed.lastAttempt.payload.text,
  'Continuing preserved proof using the new prerequisite');
 assert.equal(resumed.hintLevel,3);
 assert.equal((await must('/rest/v1/learning_events?select=event_id&event_id=eq.'+aId,A.token)).length,1);
 const allEvents=await must('/rest/v1/learning_events?select=event_id&session_id=eq.'+first.sessionId,A.token);
 assert.equal(allEvents.length,9,'2 checkpoints, 2 explicit demonstrations and amendment resume produce exactly nine distinct events');
 assert.deepEqual(await must('/rest/v1/learning_events?select=event_id&session_id=eq.'+first.sessionId,B.token),[],
  'other owner cannot read proof history after amendment');
 console.log('PASS PLAN-01 P5a real local: 12 checkpoints, two proofs, reload/hint resume, accepted prerequisite amendment, unchanged evidence, stale rejection, idempotent retry and owner isolation');
}
if(require.main===module)main().catch(e=>{
 console.error('FAIL PLAN-01 P5a local-stack: '+e.stack);process.exitCode=1;
});
module.exports={main};

