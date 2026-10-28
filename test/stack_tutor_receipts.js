'use strict';
// TUTOR-01 T3c1: disposable local Supabase HTTP + PostgreSQL ACL gate only.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const ORIGIN='http://127.0.0.1:54321';

async function main(){
 const {key}=localCredentials();
 assert.ok(isLocalAnonKey(key),'disposable local anon key required');
 async function call(path,token,method='GET',payload) {
  assert.ok(path.startsWith('/'),'local-only endpoint');
  const res=await fetch(ORIGIN+path,{method,redirect:'error',cache:'no-store',
   headers:{apikey:key,Authorization:'Bearer '+token,Accept:'application/json',
    ...(payload===undefined?{}:{'Content-Type':'application/json'})},
   ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  return {ok:res.ok,status:res.status,
    body:await res.json().catch(()=>null)};
 }
 async function must(path,token,method,payload){
  const r=await call(path,token,method,payload);
  assert.ok(r.ok,method+' '+path+' local HTTP '+r.status+': '+
   String(r.body?.message||r.body?.error||''));
  return r.body;
 }
 async function signup(){
  const r=await must('/auth/v1/signup',key,'POST',{
   email:'tutor01-'+randomUUID()+'@example.test',
   password:'Lemma-Tutor-'+randomUUID()+'-A9!'
  });
  assert.ok(r.user?.id&&r.access_token,'GoTrue test account required');
  return {id:r.user.id,token:r.access_token};
 }
 const [a,b]=await Promise.all([signup(),signup()]);
 const planA=randomUUID(),planB=randomUUID();
 const snapshot={topic:'Synthetic tutor proof',checkpoints:[
  {checkpoint_id:'proof-1',title:'Proof one',objective:'Show step 1',
   prerequisite_checkpoint_ids:[],source_refs:[]},
  {checkpoint_id:'proof-2',title:'Proof two',objective:'Show step 2',
   prerequisite_checkpoint_ids:['proof-1'],source_refs:[]}
 ]};
 async function publish(u,id,expected,summary='Initial student-approved plan'){
  return call('/rest/v1/rpc/publish_study_plan',u.token,'POST',{
   p_plan_id:id,p_expected_revision:expected,p_request_id:randomUUID(),
   p_title:'Synthetic tutor plan',p_objective:'Construct a proof',
   p_snapshot:snapshot,p_change_summary:summary
  });
 }
 assert.equal((await publish(a,planA,0)).body,1);
 assert.equal((await publish(b,planB,0)).body,1);
 const receiptId=randomUUID(),artifactId=randomUUID();
 const request=(planId=planA,id=receiptId,artifact=artifactId,revision=1,
   checkpoint='proof-1',kind='reply_reviewed',label='untrusted-tutor-name')=>({
    p_receipt_id:id,p_plan_id:planId,p_checkpoint_id:checkpoint,
    p_expected_plan_revision:revision,p_action:kind,p_artifact_id:artifact,
    p_tutor_label:label
   });
 const endpoint='/rest/v1/rpc/record_tutor_handoff_receipt';
 const [first,duplicate]=await Promise.all([
  call(endpoint,a.token,'POST',request()),
  call(endpoint,a.token,'POST',request())
 ]);
 assert.ok(first.ok&&duplicate.ok,
  'concurrent exact-ID retries must both get an immutable receipt');
 assert.equal(first.body.receiptId,receiptId);
 assert.equal(first.body.planRevision,1);
 assert.deepEqual(duplicate.body,first.body,
  'retry must return original timestamp and receipt');
 const url='/rest/v1/tutor_handoff_receipts?select=receipt_id,user_id,plan_id,action,artifact_id,tutor_label,plan_revision,checkpoint_id&receipt_id=eq.'+receiptId;
 const own=await must(url,a.token);
 assert.equal(own.length,1,'concurrent retries append only one receipt');
 assert.equal(own[0].user_id,a.id);
 assert.equal(own[0].action,'reply_reviewed');
 assert.equal(own[0].artifact_id,artifactId);
 assert.equal(own[0].checkpoint_id,'proof-1');
 assert.equal(own[0].tutor_label,'untrusted-tutor-name');
 assert.deepEqual(await must(url,b.token),[],
  'independent account may not inspect another owner audit receipt');
 const anon=await call(url,key);
 assert.equal(anon.ok,false,'anonymous cannot read private audit');
 const anonWrite=await call(endpoint,key,'POST',request());
 assert.equal(anonWrite.ok,false,'anonymous cannot create audit receipts');
 const forgedOwner=await call('/rest/v1/tutor_handoff_receipts',b.token,'POST',{
  user_id:a.id,receipt_id:randomUUID(),plan_id:planA,plan_revision:1,
  checkpoint_id:'proof-1',action:'reply_reviewed',artifact_id:artifactId
 });
 assert.equal(forgedOwner.ok,false,'direct cross-owner insert forbidden');

 const conflict=await call(endpoint,a.token,'POST',request(planA,receiptId,randomUUID()));
 assert.equal(conflict.body?.message,'idempotency_key_reused');
 const foreign=await call(endpoint,b.token,'POST',request(planA,randomUUID()));
 assert.equal(foreign.body?.message,'stale_plan_revision',
  'foreign plan must be indistinguishable from missing plan');
 const wrongCheckpoint=await call(endpoint,a.token,'POST',
  request(planA,randomUUID(),randomUUID(),1,'unknown-proof'));
 assert.equal(wrongCheckpoint.body?.message,'checkpoint_not_in_approved_plan');
 const invalidKind=await call(endpoint,a.token,'POST',
  request(planA,randomUUID(),randomUUID(),1,'proof-1','plan_approved'));
 assert.equal(invalidKind.body?.message,'invalid_handoff_receipt');
 const tooLong=await call(endpoint,a.token,'POST',
  request(planA,randomUUID(),randomUUID(),1,'proof-1','reply_reviewed','x'.repeat(81)));
 assert.equal(tooLong.body?.message,'invalid_handoff_receipt');

 // RLS/GRANT denies updates and deletion even of our own receipt.
 const patch=await call('/rest/v1/tutor_handoff_receipts?receipt_id=eq.'+
  receiptId,a.token,'PATCH',{action:'packet_exported'});
 const del=await call('/rest/v1/tutor_handoff_receipts?receipt_id=eq.'+
  receiptId,a.token,'DELETE');
 assert.equal(patch.ok,false,'owner cannot rewrite audit');
 assert.equal(del.ok,false,'owner cannot delete audit');
 assert.equal((await must(url,a.token)).length,1,'original audit preserved');

 assert.equal((await publish(a,planA,1,'student accepted plan revision')).body,2);
 const stale=await call(endpoint,a.token,'POST',request(planA,randomUUID()));
 assert.equal(stale.body?.message,'stale_plan_revision');
 const historical=await must(endpoint,a.token,'POST',request());
 assert.equal(historical.receiptId,receiptId);
 assert.deepEqual(historical,first.body,
  'exact retry stays valid after a newer approved plan revision');
 const nextId=randomUUID();
 const fresh=await must(endpoint,a.token,'POST',
  request(planA,nextId,randomUUID(),2,'proof-2','amendment_draft_staged'));
 assert.equal(fresh.receiptId,nextId);
 assert.equal(fresh.planRevision,2);

 // Two owners may independently choose the same UUID; the owner is part of
 // the immutable key. Neither owner sees or overwrites the other's receipt.
 const ownB=await must(endpoint,b.token,'POST',
  request(planB,receiptId,artifactId,1,'proof-1','reply_reviewed'));
 assert.equal(ownB.receiptId,receiptId);
 assert.equal((await must(url,b.token)).length,1);
 assert.equal((await must(url,a.token)).length,1);

 const acl=execFileSync('psql',[
  '--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align',
  '--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322',
  '--username','postgres','--dbname','postgres','--command',
  "select has_table_privilege('authenticated','public.tutor_handoff_receipts','SELECT'),"+
  "has_table_privilege('authenticated','public.tutor_handoff_receipts','INSERT'),"+
  "has_table_privilege('authenticated','public.tutor_handoff_receipts','UPDATE'),"+
  "has_table_privilege('authenticated','public.tutor_handoff_receipts','DELETE'),"+
  "has_table_privilege('anon','public.tutor_handoff_receipts','SELECT')"
 ],{timeout:15000,encoding:'utf8',env:{...process.env,
  PGPASSWORD:'postgres',PGSSLMODE:'disable'}}).trim();
 assert.equal(acl,'t|f|f|f|f','immutable read-own-only table ACL');

 console.log('PASS TUTOR-01 T3c1 local: concurrent idempotent metadata audit,');
 console.log('owner isolation, immutable receipts, stale/conflict denial, ACL and no production writes');
}
if(require.main===module)main().catch(e=>{
 console.error('FAIL TUTOR-01 T3c1 local: '+e.stack);process.exitCode=1;
});
module.exports={main};
