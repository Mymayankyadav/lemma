'use strict';
// PLAN-01 P1: disposable local Supabase only. Never uses production credentials.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {localCredentials,isLocalAnonKey} = require('./auth_http_rls');
const ORIGIN = 'http://127.0.0.1:54321';

async function main() {
  const {key}=localCredentials();
  assert.ok(isLocalAnonKey(key),'local anon public key required');
  async function call(path,token,method='GET',payload) {
    assert.ok(path.startsWith('/'),'no outbound or production requests');
    const response=await fetch(ORIGIN+path,{
      method,redirect:'error',cache:'no-store',
      headers:{apikey:key,Authorization:'Bearer '+token,Accept:'application/json',
        ...(payload===undefined?{}:{'Content-Type':'application/json'})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    });
    return {ok:response.ok,status:response.status,
      body:await response.json().catch(()=>null)};
  }
  async function must(path,token,method,payload) {
    const r=await call(path,token,method,payload);
    assert.ok(r.ok,'local HTTP '+r.status+': '+String(r.body?.message || r.body?.error || ''));
    return r.body;
  }
  async function signup() {
    const response=await must('/auth/v1/signup',key,'POST',{
      email:'plan-p1-'+randomUUID()+'@example.test',
      password:'Lemma-PlanP1-'+randomUUID()+'-A9!'
    });
    assert.ok(response.user?.id && response.access_token,'local GoTrue auth required');
    return {id:response.user.id,token:response.access_token};
  }
  const [a,b]=await Promise.all([signup(),signup()]);
  assert.notEqual(a.id,b.id);
  const planA=randomUUID(),planB=randomUUID();
  const snapshot={checkpoints:Array.from({length:12},(_,i)=>({
    checkpoint_id:'proof-'+(i+1),title:'Synthetic proof checkpoint '+(i+1),
    objective:'Give justified proof step',prerequisite_checkpoint_ids:[],
    source_refs:['synthetic:chapter-1']
  }))};
  function publish(u,id,expected,request,change='Initial approved fixture') {
    return call('/rest/v1/rpc/publish_study_plan',u.token,'POST',{
      p_plan_id:id,p_expected_revision:expected,p_request_id:request,
      p_title:'Synthetic topology test plan',p_objective:'Prove a theorem',
      p_snapshot:snapshot,p_change_summary:change
    });
  }
  assert.equal((await publish(a,planA,0,randomUUID())).body,1);
  assert.equal((await publish(b,planB,0,randomUUID())).body,1);
  const eId=randomUUID(),payload={text:'My unfinished proof',line:2};
  function record(u,id,checkpoint,eventId=eId,data=payload,expected=1,type='attempt') {
    return call('/rest/v1/rpc/record_study_event',u.token,'POST',{
      p_plan_id:id,p_checkpoint_id:checkpoint,
      p_expected_plan_revision:expected,p_event_type:type,
      p_payload:data,p_event_id:eventId,p_source:'local-test'
    });
  }
  const [first,concurrent]=await Promise.all([
    record(a,planA,'proof-3'),record(a,planA,'proof-3')
  ]);
  assert.ok(first.ok && concurrent.ok,'concurrent identical retries succeed');
  assert.equal(first.body.eventId,eId);
  assert.equal(first.body.sessionId,concurrent.body.sessionId);
  assert.equal(first.body.seq,concurrent.body.seq,'a retry must not append twice');
  assert.equal(first.body.planRevision,1);
  // Different event IDs racing for the same plan must not fork active sessions.
  const parallelIds=[randomUUID(),randomUUID()];
  const concurrentDistinct=await Promise.all(parallelIds.map((id,i) =>
    record(a,planA,'proof-3',id,{text:'parallel step '+i})));
  assert.ok(concurrentDistinct.every(r=>r.ok));
  assert.ok(concurrentDistinct.every(r=>r.body.sessionId===first.body.sessionId),
    'parallel events share the already-active plan session');
  const ownUrl='/rest/v1/learning_events?select=event_id,event_type,payload,session_id,user_id&event_id=eq.'+eId;
  const owned=await must(ownUrl,a.token);
  assert.equal(owned.length,1);
  assert.equal(owned[0].user_id,a.id);
  assert.equal(owned[0].payload.data.text,payload.text);
  assert.equal(owned[0].payload.checkpoint_id,'proof-3');
  assert.deepEqual(await must(ownUrl,b.token),[],'other owner cannot read event');
  const mismatch=await record(a,planA,'proof-3',eId,{text:'tampered'});
  assert.equal(mismatch.body?.message,'idempotency_key_reused');
  const foreign=await record(b,planA,'proof-3',randomUUID());
  assert.equal(foreign.body?.message,'stale_plan_revision',
    'foreign plan ID is indistinguishable from a missing plan');
  const unknownCheckpoint=await record(a,planA,'not-approved',randomUUID());
  assert.equal(unknownCheckpoint.body?.message,'checkpoint_not_in_approved_plan');
  const badType=await record(a,planA,'proof-3',randomUUID(),{},1,'accept');
  assert.equal(badType.body?.message,'invalid_study_event');
  const over=await record(a,planA,'proof-3',randomUUID(),{text:'x'.repeat(17000)});
  assert.equal(over.body?.message,'invalid_study_event');

  assert.equal((await publish(a,planA,1,randomUUID(),'synthetic amendment')).body,2);
  const stale=await record(a,planA,'proof-3',randomUUID());
  assert.equal(stale.body?.message,'stale_plan_revision');
  const afterChange=await record(a,planA,'proof-3');
  assert.ok(afterChange.ok);
  assert.equal(afterChange.body.seq,first.body.seq,
    'lost response of old revision must still return original receipt');
  const freshId=randomUUID();
  const newEvidence=await record(a,planA,'proof-4',freshId,{text:'second step'},2);
  assert.equal(newEvidence.body.planRevision,2);
  assert.notEqual(newEvidence.body.seq,first.body.seq);

  // No authenticated UPDATE or DELETE privilege, even on own rows.
  const modified=await call('/rest/v1/learning_events?event_id=eq.'+eId,
    a.token,'PATCH',{payload:{text:'overwrite attempt'}});
  const deleted=await call('/rest/v1/learning_events?event_id=eq.'+eId,
    a.token,'DELETE');
  assert.equal(modified.ok,false,'authenticated cannot rewrite evidence');
  assert.equal(deleted.ok,false,'authenticated cannot erase evidence');
  assert.equal((await must(ownUrl,a.token)).length,1,'original event preserved');

  // Owner INSERT still works for older clients; RLS prevents forged owners.
  const manualId=randomUUID();
  await must('/rest/v1/learning_events',a.token,'POST',{
    event_id:manualId,session_id:first.body.sessionId,
    event_type:'session_note',payload:{text:'legacy owner insert'}
  });
  const forged=await call('/rest/v1/learning_events',b.token,'POST',{
    user_id:a.id,event_id:randomUUID(),session_id:first.body.sessionId,
    event_type:'session_note',payload:{text:'cross-owner forgery'}
  });
  assert.equal(forged.ok,false,'client cannot forge owner ID');
  assert.deepEqual(await must(
    '/rest/v1/learning_events?select=event_id&event_id=eq.'+manualId,b.token),[]);

  const privileges=execFileSync('psql',[
    '--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align',
    '--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322',
    '--username','postgres','--dbname','postgres','--command',
    "select has_table_privilege('authenticated','public.learning_events','SELECT'),"+
    "has_table_privilege('authenticated','public.learning_events','INSERT'),"+
    "has_table_privilege('authenticated','public.learning_events','UPDATE'),"+
    "has_table_privilege('authenticated','public.learning_events','DELETE'),"+
    "has_table_privilege('anon','public.learning_events','SELECT')"
  ],{timeout:15000,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres',
    PGSSLMODE:'disable'}}).trim();
  assert.equal(privileges,'t|t|f|f|f','append-only grants must be exact');

  console.log('PASS PLAN-01 P1 local: two independent owners, 12 checkpoints,');
  console.log('idempotent concurrent retries, stale rejection, append-only grants, immutable receipts, cross-owner denial; no production access');
}
if (require.main===module) main().catch(e=>{
  console.error('FAIL PLAN-01 P1 local: '+e.message);process.exitCode=1;
});
module.exports={main};
