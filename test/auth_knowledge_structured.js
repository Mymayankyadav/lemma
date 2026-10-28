'use strict';
// KNOWLEDGE-01 K2c: disposable local Supabase HTTP auth/RLS + structured CAS.
// Refuses production or connected project. Synthetic identities only.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const ORIGIN='http://127.0.0.1:54321';
async function main(){
 const {key}=localCredentials();
 assert.ok(isLocalAnonKey(key),'local CLI anonymous key required');
 async function call(route,token,method='GET',payload){
  assert.ok(route.startsWith('/'),'loopback relative path only');
  const response=await fetch(ORIGIN+route,{
   method,redirect:'error',cache:'no-store',
   headers:{apikey:key,Authorization:'Bearer '+token,Accept:'application/json',
    ...(payload===undefined?{}:{'Content-Type':'application/json'})},
   ...(payload===undefined?{}:{body:JSON.stringify(payload)})
  });
  return {ok:response.ok,status:response.status,
   body:await response.json().catch(()=>null)};
 }
 async function must(route,token,method,payload){
  const r=await call(route,token,method,payload);
  assert.ok(r.ok,'local HTTP '+r.status+' '+String(r.body?.message||''));
  return r.body;
 }
 async function signup(){
  const r=await must('/auth/v1/signup',key,'POST',{
   email:'structured-k2c-'+randomUUID()+'@example.test',
   password:'Lemma-K2c-'+randomUUID()+'-A9!'
  });
  assert.ok(r.user?.id&&r.access_token);
  return {id:r.user.id,token:r.access_token};
 }
 const [a,b]=await Promise.all([signup(),signup()]);
 assert.notEqual(a.id,b.id);
 const aId=randomUUID(),bId=randomUUID();
 const legacy=(u,id,expected,request,title='Legacy',markdown='Legacy accepted text')=>call(
  '/rest/v1/rpc/commit_study_context',u.token,'POST',{
   p_context_id:id,p_expected_revision:expected,p_request_id:request,
   p_title:title,p_context_markdown:markdown
  });
 const accept=(u,id,expected,request,payload,title='Accepted structured',
  markdown='Human readable accepted context')=>call(
  '/rest/v1/rpc/commit_structured_study_context',u.token,'POST',{
   p_context_id:id,p_expected_revision:expected,p_request_id:request,
   p_title:title,p_context_markdown:markdown,p_payload:payload
  });
 const get=(u,id,rev=null)=>call('/rest/v1/rpc/get_accepted_study_context',
  u.token,'POST',{p_context_id:id,p_revision:rev});
 const createA=await legacy(a,aId,0,randomUUID());
 const createB=await legacy(b,bId,0,randomUUID());
 assert.equal(createA.body,1);assert.equal(createB.body,1);
 const old=await get(a,aId);
 assert.equal(old.body.format,'legacy_markdown');
 assert.equal(old.body.accepted_json,null);
 const source=randomUUID(),section=randomUUID(),sid=randomUUID();
 const publishSource=(u,contextId,sourceId)=>call(
  '/rest/v1/rpc/commit_knowledge_source',u.token,'POST',{
   p_context_id:contextId,p_expected_context_revision:1,
   p_source_id:sourceId,p_expected_source_revision:0,
   p_request_id:randomUUID(),p_title:'Synthetic topical notes',
   p_source_type:'manual',p_citation:{type:'local'},
   p_sections:[{section_id:section,locator:'§1',title:'Lemma',text:'A verified snippet'}]
  });
 assert.equal((await publishSource(a,aId,source)).body,1);
 const base={schema_version:1,goals:['Prove the open mapping theorem'],
  notation:['f:X→Y'],background:[{statement:'Knows continuity',evidence_status:'self_reported'}],
  source_refs:[{source_id:source,revision:1}],
  learning_preferences:['Socratic'],constraints:['Do not give full proof'],
  planning_requests:['Diagnostic checkpoint'],
  summary:'A private curated mathematical learning context'};
 const req=randomUUID();
 const first=await accept(a,aId,1,req,base);
 assert.equal(first.body,2,JSON.stringify(first.body));
 assert.equal((await accept(a,aId,1,req,base)).body,2,
  'same accepted request must return original revision exactly once');
 const changed=await accept(a,aId,1,req,{...base,goals:['Different goal']});
 assert.equal(changed.body?.message,'idempotency_key_reused');
 const current=await get(a,aId);
 assert.ok(current.ok,JSON.stringify(current.body));
 assert.equal(current.body.format,'structured_v1');
 assert.equal(current.body.revision,2);
 assert.deepEqual(current.body.accepted_json.goals,base.goals);
 assert.deepEqual(current.body.accepted_json.background,base.background);
 assert.deepEqual(current.body.accepted_json.source_refs,base.source_refs);
 assert.deepEqual(current.body.accepted_json.recent_evidence_refs,[]);
 const anotherTutor=await get(a,aId,2);
 assert.deepEqual(anotherTutor.body,current.body,'pinned accepted revision must be identical');
 const legacyRevision=await get(a,aId,1);
 assert.equal(legacyRevision.body.format,'legacy_markdown');
 assert.equal(legacyRevision.body.context_markdown,'Legacy accepted text');
 assert.equal(legacyRevision.body.accepted_json,null);
 const forbiddenOld=await legacy(a,aId,2,randomUUID(),'Forbidden','Legacy overwrite');
 assert.equal(forbiddenOld.body?.message,'structured_context_requires_v1_write',
  'legacy Markdown RPC must not silently replace a structured revision');
 const invalid=[
  {...base,schema_version:2},
  {...base,unrecognized:'injected'},
  {...base,goals:['']},
  {...base,notation:Array(17).fill('x')},
  {...base,background:[{statement:'Assumed mastery',evidence_status:'demonstrated'}]},
  {...base,background:[{statement:'Missing status'}]},
  {...base,recent_evidence_refs:[randomUUID()]},
  {...base,source_refs:[{source_id:source,revision:999}]},
  {...base,source_refs:[{source_id:source,revision:1,foreign:true}]},
  {...base,goals:['x'.repeat(513)]}
 ];
 for(let i=0;i<invalid.length;i++){
  const bad=await accept(a,aId,2,randomUUID(),invalid[i]);
  assert.equal(bad.ok,false,'invalid structured context '+i+' must be rejected');
 }
 const crossOwner=await accept(b,bId,1,randomUUID(),base);
 assert.equal(crossOwner.body?.message,'structured_source_not_accepted',
  'cannot attach another owner\'s private accepted source');
 const crossRead=await get(b,aId);
 assert.equal(crossRead.body?.message,'knowledge_context_not_found');
 const foreignUpdate=await accept(b,aId,2,randomUUID(),base);
 assert.equal(foreignUpdate.body?.message,'stale_context_revision');
 const noAuth=await call('/rest/v1/rpc/get_accepted_study_context',key,'POST',{
  p_context_id:aId
 });
 assert.equal(noAuth.ok,false,'anonymous accepted context read forbidden');
 const race=await Promise.all([
  accept(a,aId,2,randomUUID(),{...base,goals:['Race A']}),
  accept(a,aId,2,randomUUID(),{...base,goals:['Race B']})
 ]);
 assert.equal(race.filter(x=>x.ok&&x.body===3).length,1);
 assert.equal(race.filter(x=>x.body?.message==='stale_context_revision').length,1);
 const history=await must('/rest/v1/study_context_revisions?'+new URLSearchParams({
  context_id:'eq.'+aId,select:'revision,accepted_json,context_markdown',order:'revision.asc'
 }),a.token);
 assert.deepEqual(history.map(x=>x.revision),[1,2,3]);
 assert.equal(history[0].accepted_json,null);
 assert.deepEqual(history[1].accepted_json.goals,base.goals);
 assert.equal(history[0].context_markdown,'Legacy accepted text');
 const latest=await get(a,aId);
 assert.equal(latest.body.revision,3);
 assert.deepEqual((await get(a,aId,2)).body,anotherTutor.body);
 assert.equal((await get(a,aId,100)).body?.message,'context_revision_unavailable');
 const direct=await call('/rest/v1/study_context_files?id=eq.'+aId,a.token,
  'PATCH',{accepted_json:{schema_version:1},revision:100});
 assert.equal(direct.ok,false,'direct accepted context update must stay revoked');
 const tamper=await call('/rest/v1/study_context_revisions?context_id=eq.'+aId,
  a.token,'PATCH',{accepted_json:{schema_version:1}});
 assert.equal(tamper.ok,false,'immutable revision ledger must stay readonly');
 const contextB=await get(b,bId);
 assert.equal(contextB.body.format,'legacy_markdown');
 const noCrossHistory=await must('/rest/v1/study_context_revisions?context_id=eq.'+aId,
  b.token);
 assert.deepEqual(noCrossHistory,[]);
 assert.ok(sid,'synthetic scope');
 console.log('PASS K2c: local GoTrue owner isolation, structured schema/CAS, source/skill reference validation, immutable pinned snapshots and legacy-safe reads');
}
if(require.main===module)main().catch(e=>{
 console.error('FAIL K2c structured local auth: '+e.message);
 process.exitCode=1;
});
module.exports={main};
