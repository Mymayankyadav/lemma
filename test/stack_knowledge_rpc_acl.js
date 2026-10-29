'use strict';
// RELEASE-01 SEC-01: disposable local-only regression for intentionally
// authenticated SECURITY DEFINER write RPCs flagged by advisor 0029.
// This is not a production audit or a replacement for two-owner application tests.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');

const ORIGIN='http://127.0.0.1:54321';
const ENDPOINTS={
  record_study_event:(plan,eventId)=>({
    p_plan_id:plan,p_checkpoint_id:'proof-1',p_expected_plan_revision:1,
    p_event_type:'attempt',p_payload:{text:'Synthetic proof'},
    p_event_id:eventId,p_source:'local-security-gate'
  }),
  record_tutor_handoff_receipt:(plan,receiptId)=>({
    p_receipt_id:receiptId,p_plan_id:plan,p_checkpoint_id:'proof-1',
    p_expected_plan_revision:1,p_action:'reply_reviewed',
    p_artifact_id:receiptId,p_tutor_label:null
  }),
  record_tutor_evidence_with_receipt:(plan,eventId)=>({
    p_plan_id:plan,p_checkpoint_id:'proof-1',p_expected_plan_revision:1,
    p_event_type:'hint',p_payload:{level:1,question:'Which lemma?'},
    p_event_id:eventId
  })
};

function localCatalog() {
  // Never connect to a project ref, hosted database or inherited PGHOST.
  const sql=[
    'select coalesce(json_agg(json_build_object(',
    "'name',p.proname,",
    "'args',pg_get_function_identity_arguments(p.oid),",
    "'definer',p.prosecdef,",
    "'anon',has_function_privilege('anon',p.oid,'EXECUTE'),",
    "'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),",
    "'publicGrant',exists(select 1",
    "from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) as acl",
    "where acl.grantee=0 and acl.privilege_type='EXECUTE'),",
    "'searchPath',p.proconfig",
    ") order by p.proname)::text,'[]')",
    "from pg_proc p join pg_namespace n on n.oid=p.pronamespace",
    "where n.nspname='public' and p.prosecdef"
  ].join(' ');
  return JSON.parse(execFileSync('psql',[
    '--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align',
    '--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322',
    '--username','postgres','--dbname','postgres','--command',sql
  ],{encoding:'utf8',timeout:15000,env:{...process.env,
    PGPASSWORD:'postgres',PGSSLMODE:'disable'}}).trim());
}

async function main(){
  const {key}=localCredentials();
  assert.ok(isLocalAnonKey(key),'SEC-01 requires the disposable local anon key');
  const functions=localCatalog();
  const names=Object.keys(ENDPOINTS).sort();
  assert.deepEqual(functions.map(f=>f.name).sort(),names,
    'any new public SECURITY DEFINER RPC requires an explicit security review');
  for(const f of functions){
    assert.equal(f.definer,true);
    assert.equal(f.anon,false,f.name+' must deny anonymous EXECUTE');
    assert.equal(f.publicGrant,false,f.name+' must revoke default PUBLIC EXECUTE');
    assert.equal(f.authenticated,true,f.name+' is an intentional signed-in API');
    assert.ok(Array.isArray(f.searchPath)&&f.searchPath.some(p=>
      /^search_path=(?:""|)$/.test(p)),
      f.name+' must pin an empty search_path');
  }

  async function call(route,token,body){
    assert.ok(route.startsWith('/'),'disposable localhost endpoint only');
    const result=await fetch(ORIGIN+route,{
      method:'POST',redirect:'error',cache:'no-store',
      headers:{apikey:key,Authorization:'Bearer '+token,
        Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    return {ok:result.ok,status:result.status,
      data:await result.json().catch(()=>null)};
  }
  async function must(route,token,body){
    const result=await call(route,token,body);
    assert.ok(result.ok,route+' returned HTTP '+result.status+
      ': '+JSON.stringify(result.data));
    return result.data;
  }
  async function signup(){
    const r=await must('/auth/v1/signup',key,{
      email:'rpc-acl-'+randomUUID()+'@example.test',
      password:'Lemma-Rpc-Acl-'+randomUUID()+'-A9!'
    });
    assert.ok(r.user?.id&&r.access_token,'real disposable GoTrue user');
    return {id:r.user.id,token:r.access_token};
  }
  const [a,b]=await Promise.all([signup(),signup()]);
  assert.notEqual(a.id,b.id);
  const plan=randomUUID();
  const snapshot={checkpoints:[{
    checkpoint_id:'proof-1',title:'Proof one',objective:'Justify the step',
    prerequisite_checkpoint_ids:[],source_refs:[]
  }]};
  const version=await must('/rest/v1/rpc/publish_study_plan',a.token,{
    p_plan_id:plan,p_expected_revision:0,p_request_id:randomUUID(),
    p_title:'Synthetic permission fixture',p_objective:'Prove a lemma',
    p_snapshot:snapshot,p_change_summary:'Explicit fixture approval'
  });
  assert.equal(version,1,'owner has an approved revision');

  for(const name of names){
    const route='/rest/v1/rpc/'+name;
    const request=ENDPOINTS[name](plan,randomUUID());
    const anon=await call(route,key,request);
    assert.equal(anon.ok,false,name+' must not be anonymously invokable');
    const foreign=await call(route,b.token,request);
    assert.equal(foreign.ok,false,name+' must deny another owner plan ID');
    assert.equal(foreign.data?.message,'stale_plan_revision',
      name+' must not reveal whether a foreign plan exists');

    const own=await must(route,a.token,request);
    assert.ok(own&&typeof own==='object',name+' owner returns a receipt');
    const retry=await must(route,a.token,request);
    assert.deepEqual(retry,own,name+' same-key retry must not append data');
  }
  console.log('PASS RELEASE-01 SEC-01: catalog ACL, empty search_path, anonymous denial,');
  console.log('two-owner RPC authorization and exact-key retries on disposable local stack');
}

if(require.main===module)main().catch(e=>{
  console.error('FAIL RELEASE-01 SEC-01: '+(e.stack||e));process.exitCode=1;
});
module.exports={main,localCatalog};
