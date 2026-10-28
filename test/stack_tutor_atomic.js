'use strict';
// TUTOR-01 T3c2b: real disposable local HTTP + PostgreSQL transaction gate.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const ORIGIN='http://127.0.0.1:54321';

async function main() {
 const {key}=localCredentials();
 assert.ok(isLocalAnonKey(key),'disposable local stack only');
 const call=async(path,token,method='GET',payload)=>{
  assert.ok(path.startsWith('/'),'local endpoint');
  const res=await fetch(ORIGIN+path,{method,redirect:'error',cache:'no-store',
   headers:{apikey:key,Authorization:'Bearer '+token,Accept:'application/json',
    ...(payload===undefined?{}:{'Content-Type':'application/json'})},
   ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  return {ok:res.ok,status:res.status,body:await res.json().catch(()=>null)};
 };
 const must=async(path,token,method='GET',payload)=>{
  const r=await call(path,token,method,payload);
  assert.ok(r.ok,method+' '+path+' HTTP '+r.status+': '+JSON.stringify(r.body));
  return r.body;
 };
 const signup=async()=>{
  const res=await must('/auth/v1/signup',key,'POST',{
   email:'tutor01-atomic-'+randomUUID()+'@example.test',
   password:'Lemma-Tutor-'+randomUUID()+'-A9!'});
  assert.ok(res.user?.id && res.access_token,'real local GoTrue account');
  return {id:res.user.id,token:res.access_token};
 };
 const [owner,other]=await Promise.all([signup(),signup()]);
 const plan=randomUUID(),otherPlan=randomUUID();
 const snapshot={topic:'Synthetic tutor proof',checkpoints:[
   {checkpoint_id:'proof-1',title:'Proof 1',objective:'Demonstrate proof',
    prerequisite_checkpoint_ids:[],source_refs:[]}
 ]};
 const publish=async(user,id,revision)=>must('/rest/v1/rpc/publish_study_plan',
  user.token,'POST',{p_plan_id:id,p_expected_revision:revision,
   p_request_id:randomUUID(),p_title:'Test plan',p_objective:'Prove a lemma',
   p_snapshot:snapshot,p_change_summary:'Student approved synthetic plan'});
 assert.equal(await publish(owner,plan,0),1);
 assert.equal(await publish(other,otherPlan,0),1);
 const endpoint='/rest/v1/rpc/record_tutor_evidence_with_receipt';
 const eventId=randomUUID();
 const request=(id=eventId,change={})=>({
  p_plan_id:plan,p_checkpoint_id:'proof-1',p_expected_plan_revision:1,
  p_event_type:'hint',p_payload:{level:2,question:'Which open cover?'},
  p_event_id:id,...change
 });
 const [first,duplicate]=await Promise.all([
  call(endpoint,owner.token,'POST',request()),
  call(endpoint,owner.token,'POST',request())
 ]);
 assert.ok(first.ok&&duplicate.ok,'concurrent idempotent event + audit');
 assert.deepEqual(first.body,duplicate.body);
 assert.equal(first.body.event.eventId,eventId);
 assert.equal(first.body.audit.receiptId,eventId);
 assert.equal(first.body.event.planRevision,1);
 const eventsUrl='/rest/v1/learning_events?event_id=eq.'+eventId+'&select=event_id,payload,event_type,user_id';
 const receiptsUrl='/rest/v1/tutor_handoff_receipts?receipt_id=eq.'+eventId+
  '&select=receipt_id,action,artifact_id,user_id';
 const events=await must(eventsUrl,owner.token);
 assert.equal(events.length,1,'one durable immutable learning event');
 assert.equal(events[0].event_type,'hint');
 assert.equal(events[0].payload.source,'tutor_handoff.v1',
  'untrusted tutor metadata cannot claim student authorship');
 const audits=await must(receiptsUrl,owner.token);
 assert.equal(audits.length,1,'one immutable associated receipt');
 assert.equal(audits[0].action,'evidence_recorded');
 assert.equal(audits[0].artifact_id,eventId);
 assert.deepEqual(await must(eventsUrl,other.token),[],
  'another owner cannot read the event');
 assert.deepEqual(await must(receiptsUrl,other.token),[],
  'another owner cannot read the receipt');

 const changed=await call(endpoint,owner.token,'POST',request(eventId,{
  p_payload:{level:3,question:'Different proposal'}}));
 assert.equal(changed.body?.message,'idempotency_key_reused');
 const foreign=await call(endpoint,other.token,'POST',request(randomUUID()));
 assert.equal(foreign.body?.message,'stale_plan_revision');
 const anon=await call(endpoint,key,'POST',request(randomUUID()));
 assert.equal(anon.ok,false,'anon is denied executable composite RPC');
 const stale=await call(endpoint,owner.token,'POST',request(randomUUID(),{
  p_expected_plan_revision:2}));
 assert.equal(stale.body?.message,'stale_plan_revision');

 // Force the audit half to fail AFTER the event RPC succeeded. The event
 // must be rolled back by the one PostgreSQL transaction, not orphaned.
 const doomed=randomUUID();
 await must('/rest/v1/rpc/record_tutor_handoff_receipt',owner.token,'POST',{
  p_receipt_id:doomed,p_plan_id:plan,p_checkpoint_id:'proof-1',
  p_expected_plan_revision:1,p_action:'card_editor_opened',
  p_artifact_id:doomed,p_tutor_label:null
 });
 const failure=await call(endpoint,owner.token,'POST',request(doomed));
 assert.equal(failure.body?.message,'idempotency_key_reused');
 const orphan=await must('/rest/v1/learning_events?event_id=eq.'+doomed+
  '&select=event_id',owner.token);
 assert.deepEqual(orphan,[],'audit failure rolls back newly written event');
 const priorReceipt=await must('/rest/v1/tutor_handoff_receipts?receipt_id=eq.'+doomed+
  '&select=action',owner.token);
 assert.equal(priorReceipt[0].action,'card_editor_opened','original audit untouched');

 assert.equal(await publish(owner,plan,1),2);
 const historical=await must(endpoint,owner.token,'POST',request());
 assert.deepEqual(historical,first.body,
  'exact retry after later plan revision returns both original receipts');
 const postRevision=await call(endpoint,owner.token,'POST',request(randomUUID()));
 assert.equal(postRevision.body?.message,'stale_plan_revision');
 assert.equal((await must(eventsUrl,owner.token)).length,1);
 assert.equal((await must(receiptsUrl,owner.token)).length,1);
 console.log('PASS TUTOR-01 T3c2b: atomic event/audit, rollback, retry, owner isolation, canonical source, stale denial');
}
if(require.main===module)main().catch(e=>{
 console.error('FAIL TUTOR-01 T3c2b: '+e.stack);process.exitCode=1;
});
module.exports={main};
