'use strict';
// KNOWLEDGE-01 acceptance: two independent GoTrue sessions for the same owner,
// plus a foreign owner. Uses only disposable loopback HTTP, never production.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const ORIGIN='http://127.0.0.1:54321';

async function main(){
  const {key}=localCredentials();
  assert.ok(isLocalAnonKey(key),'disposable Supabase anon key required');
  async function call(route,token,method='GET',payload){
    assert.ok(route.startsWith('/'),'local relative route required');
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
    const result=await call(route,token,method,payload);
    assert.ok(result.ok,'local endpoint '+route+' failed with status '+result.status+
      ' / '+String(result.body?.message||result.body?.error||'unknown'));
    return result.body;
  }
  async function register(){
    const email='two-tutors-'+randomUUID()+'@example.test';
    const password='Lemma-TwoTutors-'+randomUUID()+'-A9!';
    const first=await must('/auth/v1/signup',key,'POST',{email,password});
    assert.ok(first.user?.id&&first.access_token&&first.refresh_token);
    return {email,password,id:first.user.id,
      first:{id:first.user.id,token:first.access_token,refresh:first.refresh_token}};
  }
  async function secondSession(account){
    const response=await must('/auth/v1/token?grant_type=password',key,'POST',
      {email:account.email,password:account.password});
    assert.equal(response.user?.id,account.id,'second tutor must be same owner');
    assert.ok(response.access_token&&response.refresh_token);
    assert.notEqual(response.refresh_token,account.first.refresh,
      'tutors need separate authenticated refresh sessions');
    assert.notEqual(response.access_token,account.first.token,
      'tutors need independently issued access tokens');
    return {id:response.user.id,token:response.access_token};
  }
  const account=await register(),intruder=await register();
  const tutors=[account.first,await secondSession(account)];
  assert.notEqual(intruder.id,account.id,'cross-owner check requires another identity');
  const contextId=randomUUID(),sourceId=randomUUID(),sectionIds=[
    randomUUID(),randomUUID(),randomUUID(),randomUUID()
  ];
  const r1=await must('/rest/v1/rpc/commit_study_context',tutors[0].token,'POST',{
    p_context_id:contextId,p_expected_revision:0,p_request_id:randomUUID(),
    p_title:'Disposable maths context',p_context_markdown:'A synthetic theorem'
  });
  assert.equal(r1,1);
  function source(revision,contextRevision,text){
    return call('/rest/v1/rpc/commit_knowledge_source',tutors[0].token,'POST',{
      p_context_id:contextId,p_expected_context_revision:contextRevision,
      p_source_id:sourceId,p_expected_source_revision:revision-1,
      p_request_id:randomUUID(),p_title:'Synthetic lecture notes',
      p_source_type:'manual',p_citation:{type:'synthetic',page:'1'},
      p_sections:sectionIds.map((section_id,i)=>({
        section_id,locator:'page-1/section-'+i,title:'Synthetic section '+i,
        text:text+' #'+i
      }))
    });
  }
  assert.equal((await source(1,1,'Proved by compactness')).body,1);
  function payload(sourceRevision){
    return {schema_version:1,goals:['Prove a synthetic topology lemma'],
      notation:['X is compact'],background:[],
      source_refs:[{source_id:sourceId,revision:sourceRevision}],
      learning_preferences:[],constraints:[],planning_requests:[],
      summary:'Accepted by synthetic local fixture'};
  }
  async function accept(revision,sourceRevision){
    return must('/rest/v1/rpc/commit_structured_study_context',
      tutors[0].token,'POST',{
        p_context_id:contextId,p_expected_revision:revision-1,
        p_request_id:randomUUID(),p_title:'Accepted local context',
        p_context_markdown:'Cited mathematical context',p_payload:payload(sourceRevision)
      });
  }
  assert.equal(await accept(2,1),2);
  const readContext=(tutor,revision)=>call(
    '/rest/v1/rpc/get_accepted_study_context',tutor.token,'POST',
    {p_context_id:contextId,p_revision:revision});
  const readExcerpts=(tutor,revision,limit=2,after=null)=>call(
    '/rest/v1/rpc/get_knowledge_excerpts',tutor.token,'POST',{
      p_context_id:contextId,p_source_id:sourceId,p_source_revision:revision,
      p_after_section_id:after,p_limit:limit
    });
  const [c1,c2]=await Promise.all(tutors.map(u=>readContext(u,2)));
  assert.ok(c1.ok&&c2.ok,'both tutors must read the accepted context');
  assert.deepEqual(c2.body,c1.body,'independent sessions must see identical context');
  assert.equal(c1.body.revision,2);
  assert.deepEqual(c1.body.accepted_json.source_refs,payload(1).source_refs);
  const [e1,e2]=await Promise.all(tutors.map(u=>readExcerpts(u,1)));
  assert.ok(e1.ok&&e2.ok,'both tutors must retrieve the pinned excerpts');
  assert.deepEqual(e2.body,e1.body,'independent tutors must see byte-identical citations');
  assert.equal(e1.body.source_revision,1);
  assert.equal(e1.body.excerpts.length,2,'never retrieve an entire source implicitly');
  assert.equal(e1.body.has_more,true);
  for(const e of e1.body.excerpts){
    assert.match(e.locator,/^page-1\/section-\d$/);
    assert.equal(e.sha256,createHash('sha256').update(e.text).digest('hex'));
  }
  const after=e1.body.excerpts.at(-1).section_id;
  const [page2a,page2b]=await Promise.all(tutors.map(u=>readExcerpts(u,1,2,after)));
  assert.deepEqual(page2a.body,page2b.body,'continuation cursor is session-independent');
  assert.equal(page2a.body.excerpts.length,2);
  assert.equal(page2a.body.has_more,false);
  assert.equal((new Set([...e1.body.excerpts,...page2a.body.excerpts]
    .map(e=>e.section_id))).size,4,'each accepted section is delivered once');
  assert.equal((await source(2,2,'Changed by new acceptance')).body,2);
  // Publishing a new source version cannot silently alter the existing
  // structured context's pinned source revision or its immutable excerpts.
  assert.deepEqual((await readContext(tutors[1],2)).body,c1.body);
  assert.deepEqual((await readExcerpts(tutors[1],1)).body,e1.body);
  assert.equal(await accept(3,2),3);
  const latest=await readContext(tutors[1],null);
  assert.equal(latest.body.revision,3);
  assert.deepEqual(latest.body.accepted_json.source_refs,payload(2).source_refs);
  assert.deepEqual((await readContext(tutors[0],2)).body,c1.body,
    'historical context is stable even after a newer acceptance');
  const old=(await readExcerpts(tutors[0],1)).body;
  const newer=(await readExcerpts(tutors[1],2)).body;
  assert.deepEqual(old,e1.body,'immutable original source citation remains pinned');
  assert.notDeepEqual(newer.excerpts,old.excerpts,'new source requires explicit new version');
  const denied=await readContext(intruder.first,2);
  assert.equal(denied.body?.message,'knowledge_context_not_found');
  assert.equal((await readExcerpts(intruder.first,1)).body?.message,
    'knowledge_source_not_found');
  const anon=await readContext({token:key},2);
  assert.equal(anon.ok,false,'anonymous user cannot read accepted context');
  const exposed=await must('/rest/v1/knowledge_section_versions?source_id=eq.'+sourceId,
    intruder.first.token);
  assert.deepEqual(exposed,[],'RLS must hide all foreign source revisions');
  console.log('PASS: two independent owner sessions share exact accepted context/citations;'+
    ' immutable pinned history and bounded pagination; other owner/anon denied');
}
if(require.main===module)main().catch(error=>{
  console.error('FAIL two-tutor local gate: '+error.message);
  process.exitCode=1;
});
module.exports={main};
