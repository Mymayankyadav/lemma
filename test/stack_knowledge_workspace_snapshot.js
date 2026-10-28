'use strict';
// RELEASE-01 R2e: real disposable local GoTrue + PostgREST owner snapshot.
// The production project is never contacted by this test.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const {TABLES}=require('./release_workspace_archive');
const ORIGIN='http://127.0.0.1:54321';
async function main(){
  const {key}=localCredentials();
  assert.ok(isLocalAnonKey(key),'local Supabase anon key required');
  async function call(url,token,method='GET',payload){
    assert.ok(url.startsWith('/'),'local routes only');
    const res=await fetch(ORIGIN+url,{
      method,redirect:'error',cache:'no-store',
      headers:{apikey:key,Authorization:'Bearer '+token,
        Accept:'application/json',
        ...(payload===undefined?{}:{'Content-Type':'application/json'})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})
    });
    return {ok:res.ok,status:res.status,
      body:await res.json().catch(()=>null)};
  }
  async function must(url,token,method,payload){
    const r=await call(url,token,method,payload);
    assert.ok(r.ok,'local '+url+' failed: '+r.status+
      ' '+JSON.stringify(r.body?.message||r.body?.error||''));
    return r.body;
  }
  async function signup(){
    const response=await must('/auth/v1/signup',key,'POST',{
      email:'snapshot-'+randomUUID()+'@example.test',
      password:'Lemma-Snapshot-'+randomUUID()+'-A9!'
    });
    assert.ok(response.user?.id&&response.access_token);
    return {id:response.user.id,token:response.access_token};
  }
  const [a,b]=await Promise.all([signup(),signup()]);
  const planA=randomUUID(),planB=randomUUID();
  const snapshot={topic:'Synthetic exercise',checkpoints:[
    {checkpoint_id:'c1',title:'Step 1',objective:'Prove a claim',
      prerequisite_checkpoint_ids:[],source_refs:[]},
    {checkpoint_id:'c2',title:'Step 2',objective:'Use the claim',
      prerequisite_checkpoint_ids:['c1'],source_refs:[]}
  ]};
  async function publish(u,planId){
    return must('/rest/v1/rpc/publish_study_plan',u.token,'POST',{
      p_plan_id:planId,p_expected_revision:0,p_request_id:randomUUID(),
      p_title:'Synthetic owner-only plan',p_objective:'Prove a synthetic claim',
      p_snapshot:snapshot,p_change_summary:'Explicit local fixture'
    });
  }
  assert.equal(await publish(a,planA),1);
  assert.equal(await publish(b,planB),1);
  const eventId=randomUUID();
  const event=await must('/rest/v1/rpc/record_study_event',a.token,'POST',{
    p_plan_id:planA,p_checkpoint_id:'c1',p_expected_plan_revision:1,
    p_event_type:'attempt',p_payload:{text:'Synthetic proof step'},
    p_event_id:eventId,p_source:'local-snapshot-test'
  });
  assert.equal(event.eventId,eventId);
  const receiptId=randomUUID();
  const receipt=await must('/rest/v1/rpc/record_tutor_handoff_receipt',
    a.token,'POST',{
      p_receipt_id:receiptId,p_plan_id:planA,p_checkpoint_id:'c1',
      p_expected_plan_revision:1,p_action:'reply_reviewed',
      p_artifact_id:randomUUID(),p_tutor_label:'Synthetic tutor'
    });
  assert.equal(receipt.receiptId,receiptId);

  const endpoint='/rest/v1/rpc/capture_account_workspace_snapshot';
  const [one,two]=await Promise.all([
    must(endpoint,a.token,'POST',{}), must(endpoint,b.token,'POST',{})
  ]);
  for(const [owner,data] of [[a,one],[b,two]]){
    assert.equal(data.app,'lemma');
    assert.equal(data.scope,'account-workspace-raw');
    assert.equal(data.capture,'stable-calling-statement-snapshot');
    assert.equal(data.ownerId,owner.id);
    assert.ok(Number.isFinite(Date.parse(data.capturedAt)));
    assert.deepEqual(Object.keys(data.tables).sort(),TABLES,
      'server and release validation inventories must match all 19 tables');
    for(const [name,rows] of Object.entries(data.tables)){
      assert.ok(Array.isArray(rows),'table '+name+' must be an array');
      for(const row of rows){
        assert.equal(row.user_id,owner.id,
          'no cross-owner table rows in '+name);
      }
    }
  }
  assert.equal(one.tables.study_plans.length,1);
  assert.equal(one.tables.study_plans[0].id,planA);
  assert.equal(one.tables.study_plan_versions.length,1);
  assert.equal(one.tables.learning_sessions.length,1);
  assert.equal(one.tables.learning_events.length,1);
  assert.equal(one.tables.learning_events[0].event_id,eventId);
  assert.equal(one.tables.tutor_handoff_receipts.length,1);
  assert.equal(one.tables.tutor_handoff_receipts[0].receipt_id,receiptId);
  assert.equal(two.tables.study_plans.length,1);
  assert.equal(two.tables.study_plans[0].id,planB);
  assert.deepEqual(two.tables.learning_events,[]);
  assert.deepEqual(two.tables.tutor_handoff_receipts,[]);
  assert.deepEqual(one.tables.knowledge_source_versions,[],
    'include empty knowledge tables without inventing records');

  const repeat=await must(endpoint,a.token,'POST',{});
  assert.deepEqual(repeat.tables,one.tables,
    'read-only invocation does not alter workspace state');
  const anon=await call(endpoint,key,'POST',{});
  assert.equal(anon.ok,false,'anonymous may not execute snapshot export');

  // A user cannot supply an owner override. Extra arguments are rejected by
  // PostgREST rather than enabling a foreign-owner export.
  const attempt=await call(endpoint,b.token,'POST',{ownerId:a.id});
  assert.equal(attempt.ok,false,'owner override parameter must be rejected');

  const sql=`select p.provolatile='s',not p.prosecdef,
    has_function_privilege('authenticated',p.oid,'EXECUTE'),
    has_function_privilege('anon',p.oid,'EXECUTE')
    from pg_proc p join pg_namespace n on p.pronamespace=n.oid
    where n.nspname='public'
      and p.proname='capture_account_workspace_snapshot'`;
  const acl=execFileSync('psql',[
    '--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align',
    '--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322',
    '--username','postgres','--dbname','postgres','--command',sql
  ],{timeout:15000,encoding:'utf8',env:{...process.env,
    PGPASSWORD:'postgres',PGSSLMODE:'disable'}}).trim();
  assert.equal(acl,'t|t|t|f','STABLE invoker, authenticated-only RPC');
  console.log('PASS RELEASE R2e: all 19 owner tables in one stable read-only RPC; two-user RLS/anon denial; plan/event/tutor history intact');
}
if(require.main===module)main().catch(e=>{
  console.error('FAIL RELEASE R2e local snapshot: '+e.stack);
  process.exitCode=1;
});
module.exports={main};
