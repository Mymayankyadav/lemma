'use strict';
// KNOWLEDGE-01 K2b: actual local GoTrue/PostgREST, synthetic data only.
// Strictly localhost; never touches the linked Lemma project or Carrel.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const ORIGIN='http://127.0.0.1:54321';
async function main(){
 const {key}=localCredentials();
 assert.ok(isLocalAnonKey(key),'must use local CLI anon key');
 async function call(path,token,method='GET',data){
  assert.ok(path.startsWith('/'),'local relative path only');
  const r=await fetch(ORIGIN+path,{
   method,redirect:'error',cache:'no-store',
   headers:{apikey:key,Authorization:'Bearer '+token,Accept:'application/json',
     ...(data===undefined?{}:{'Content-Type':'application/json'})},
   ...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  return {ok:r.ok,status:r.status,body:await r.json().catch(()=>null)};
 }
 async function must(path,token,method,data){
  const r=await call(path,token,method,data);
  assert.ok(r.ok,'unexpected local HTTP '+r.status+' '+String(r.body?.message||''));
  return r.body;
 }
 async function signup(){
  const user=await must('/auth/v1/signup',key,'POST',{
   email:'knowledge-k2b-'+randomUUID()+'@example.test',
   password:'Lemma-K2b-'+randomUUID()+'-A9!'
  });
  assert.ok(user.user?.id&&user.access_token,'local GoTrue required');
  return {id:user.user.id,token:user.access_token};
 }
 const [a,b]=await Promise.all([signup(),signup()]);
 assert.notEqual(a.id,b.id);
 const ctxA=randomUUID(),ctxB=randomUUID(),src=randomUUID();
 async function context(user,id){
  return must('/rest/v1/rpc/commit_study_context',user.token,'POST',{
   p_context_id:id,p_expected_revision:0,p_request_id:randomUUID(),
   p_title:'Synthetic source context',p_context_markdown:'User-owned, approved context'
  });
 }
 assert.equal(await context(a,ctxA),1);
 assert.equal(await context(b,ctxB),1);
 const ids=Array.from({length:7},()=>randomUUID());
 const sections=ids.map((id,i)=>({
  section_id:id,locator:'section-'+(i+1),title:'Lemma '+(i+1),
  text:'Accepted proof '+(i+1)+': every finite subcover.'
 }));
 const req=randomUUID();
 const publish=(user,contextId,sourceId,expected,request,items=sections,
   title='Synthetic reference',contextRevision=1)=>call(
   '/rest/v1/rpc/commit_knowledge_source',user.token,'POST',{
    p_context_id:contextId,p_expected_context_revision:contextRevision,
    p_source_id:sourceId,p_expected_source_revision:expected,
    p_request_id:request,p_title:title,p_source_type:'manual',
    p_citation:{edition:'synthetic-v1',author:'owner'},p_sections:items
   });
 const fetchPage=(user,contextId,sourceId,revision,limit=3,after=null)=>call(
   '/rest/v1/rpc/get_knowledge_excerpts',user.token,'POST',{
    p_context_id:contextId,p_source_id:sourceId,p_source_revision:revision,
    p_after_section_id:after,p_limit:limit
   });
 const first=await publish(a,ctxA,src,0,req);
 assert.deepEqual(first.body,1);
 assert.equal((await publish(a,ctxA,src,0,req)).body,1,
  'lost server response/retry must not duplicate a revision');
 const badRetry=await publish(a,ctxA,src,0,req,sections,'Changed payload');
 assert.equal(badRetry.body?.message,'idempotency_key_reused');
 const v1=await fetchPage(a,ctxA,src,1,3);
 assert.ok(v1.ok,JSON.stringify(v1.body));
 assert.equal(v1.body.source_revision,1);
 assert.equal(v1.body.context_revision,1);
 assert.equal(v1.body.excerpts.length,3);
 assert.equal(v1.body.has_more,true);
 assert.deepEqual(v1.body.excerpts.map(s=>s.section_id),
  [...ids].sort().slice(0,3),'UUID pagination must have stable order');
 for(const section of v1.body.excerpts)
  assert.equal(section.sha256,createHash('sha256').update(section.text).digest('hex'));
 const part2=await fetchPage(a,ctxA,src,1,6,v1.body.excerpts.at(-1).section_id);
 assert.ok(part2.ok);
 assert.equal(part2.body.excerpts.length,4);
 assert.equal(part2.body.has_more,false);
 const accepted=[...v1.body.excerpts,...part2.body.excerpts];
 assert.deepEqual(accepted.map(s=>s.section_id),[...ids].sort());
 const duplicateTutor=await fetchPage(a,ctxA,src,1,3);
 assert.deepEqual(duplicateTutor.body,v1.body,'two tutors see the same pinned excerpts');
 const changed=sections.map((s,i)=>({...s,text:'New accepted revision '+i}));
 assert.equal((await publish(a,ctxA,src,1,randomUUID(),changed)).body,2);
 const old=await fetchPage(a,ctxA,src,1,6);
 assert.deepEqual(old.body.excerpts,
  (await fetchPage(a,ctxA,src,1,6)).body.excerpts,
  'old citations remain version pinned after N+1');
 assert.equal(old.body.excerpts[0].text.startsWith('Accepted proof'),true);
 const newer=await fetchPage(a,ctxA,src,2,6);
 assert.equal(newer.body.excerpts[0].text.startsWith('New accepted'),true);
 assert.notEqual(newer.body.excerpts[0].sha256,old.body.excerpts[0].sha256);
 const concurrency=await Promise.all([
  publish(a,ctxA,src,2,randomUUID(),changed,'Race A'),
  publish(a,ctxA,src,2,randomUUID(),changed,'Race B')
 ]);
 assert.equal(concurrency.filter(r=>r.ok&&r.body===3).length,1);
 assert.equal(concurrency.filter(r=>r.body?.message==='stale_source_revision').length,1);
 const records=await must('/rest/v1/knowledge_source_versions?'+new URLSearchParams({
   source_id:'eq.'+src,select:'revision',order:'revision.asc'
 }),a.token);
 assert.deepEqual(records.map(r=>r.revision),[1,2,3]);
 const legacySection=await must('/rest/v1/learning_sections?'+new URLSearchParams({
   id:'eq.'+ids[0],select:'text_content'
 }),a.token);
 assert.equal(legacySection[0].text_content,sections[0].text,
  'original mutable inventory must not be overwritten by accepted revisions');
 // Explicitly owner-scoped even if the caller knows IDs and RPC shape.
 for(const intruder of [b]){
  const denied=await fetchPage(intruder,ctxA,src,1);
  assert.equal(denied.body?.message,'knowledge_source_not_found');
  const foreign=await publish(intruder,ctxA,src,3,randomUUID());
  assert.equal(foreign.body?.message,'knowledge_context_not_found');
  const direct=await call('/rest/v1/knowledge_source_versions',intruder.token,'POST',{
   user_id:a.id,context_id:ctxA,source_id:src,revision:100
  });
  assert.equal(direct.ok,false,'no direct accepted writes');
  const reads=await must('/rest/v1/knowledge_source_versions?source_id=eq.'+src,
   intruder.token);
  assert.deepEqual(reads,[],'cross-owner version enumeration is forbidden');
  const readSections=await must('/rest/v1/knowledge_section_versions?source_id=eq.'+src,
   intruder.token);
  assert.deepEqual(readSections,[],'cross-owner excerpt enumeration is forbidden');
 }
 const anon=await call('/rest/v1/rpc/get_knowledge_excerpts',key,'POST',{
  p_context_id:ctxA,p_source_id:src,p_source_revision:1
 });
 assert.equal(anon.ok,false,'anonymous retrieval must be denied');
 assert.equal((await fetchPage(a,ctxA,src,1,7)).body?.message,'invalid_knowledge_read');
 const huge=await publish(a,ctxA,randomUUID(),0,randomUUID(),
  [{section_id:randomUUID(),locator:'A',title:'B',text:'z'.repeat(2001)}]);
 assert.equal(huge.body?.message,'invalid_knowledge_section');
 const duplicate=await publish(a,ctxA,randomUUID(),0,randomUUID(),
  [sections[0],sections[0]]);
 assert.equal(duplicate.body?.message,'invalid_knowledge_section');
 const wrongContext=await publish(a,ctxA,randomUUID(),0,randomUUID(),
  [sections[0]],'Stale context',2);
 assert.equal(wrongContext.body?.message,'stale_context_revision');
 const wrongSource=await publish(a,ctxA,randomUUID(),0,randomUUID(),
  [sections[0]],'Wrong source');
 assert.equal(wrongSource.body?.message,'section_source_mismatch');
 const patch=await call('/rest/v1/knowledge_section_versions?source_id=eq.'+src,
  a.token,'PATCH',{text_content:'tamper'});
 assert.equal(patch.ok,false,'immutable accepted excerpts cannot be edited');
 console.log('PASS: K2b local owner isolation, CAS race/retry, immutable citations, strict bounded pages and unchanged legacy sections');
}
if(require.main===module)main().catch(e=>{
 console.error('FAIL KNOWLEDGE-01 K2b local security: '+e.message);
 process.exitCode=1;
});
module.exports={main};
