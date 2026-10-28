'use strict';
// All writes/fault injection are pinned to disposable localhost. Never production.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {localCredentials,isLocalAnonKey}=require('./auth_http_rls');
const {TABLES,makeArchive}=require('./release_workspace_archive');
const path=require('node:path');
function sql(statement){
  return execFileSync('psql',['--no-psqlrc','--no-password','--quiet','--tuples-only',
    '--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','54322',
    '--username','postgres','--dbname','postgres','--command',statement],
    {encoding:'utf8',timeout:20000,env:{...process.env,PGPASSWORD:'postgres',PGSSLMODE:'disable'}}).trim();
}
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
async function main(){
  const {key}=localCredentials();assert.ok(isLocalAnonKey(key));
  async function call(route,token,payload){
    const res=await fetch('http://127.0.0.1:54321'+route,{method:'POST',redirect:'error',
      headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload)});
    const data=await res.json();return {ok:res.ok,status:res.status,data};
  }
  async function must(route,token,payload){const r=await call(route,token,payload);
    assert.ok(r.ok,route+': '+JSON.stringify(r.data));return r.data;}
  async function signup(){const r=await must('/auth/v1/signup',key,{
    email:'restore-'+randomUUID()+'@example.test',password:'Synthetic-'+randomUUID()+'-9A!'});
    assert.ok(r.user?.id&&r.access_token);return {id:r.user.id,token:r.access_token};}
  const [a,b]=await Promise.all([signup(),signup()]);
  const ids=Object.fromEntries(['plan','context','source','section','session','event','review','undo','receipt'].map(k=>[k,randomUUID()]));
  const u=quote(a.id),q=k=>quote(ids[k]),note='restore-'+randomUUID();
  const hash=quote(createHash('sha256').update('Synthetic excerpt').digest('hex'));
  // Populate every public table, with accepted historical revisions, scheduling,
  // a tombstone, retry receipts, review/Undo and tutor provenance. SQL seeding is
  // a test fixture only. Capture and restore use real authenticated HTTP.
  sql(`begin;
    insert into public.notes(user_id,id,data,revision) values(${u},${quote(note)},'{"front":"Synthetic theorem","cards":{"1":{"reps":5,"due":123456,"st":2}},"log":[[100,1,3]],"requires":["Earlier lemma"]}',7);
    insert into public.notes(user_id,id,data,revision,deleted_at) values(${u},'deleted','{}',3,'2026-10-27Z');
    insert into public.profiles(user_id,data,revision) values(${u},'{"settings":{"retention":0.92}}',4);
    insert into public.client_mutation_receipts(user_id,request_id,entity_type,entity_id,payload_hash,revision) values(${u},${quote(randomUUID())},'note',${quote(note)},'original-payload',7);
    insert into public.study_plans(user_id,id,title,revision) values(${u},${q('plan')},'Synthetic plan',2);
    insert into public.study_context_files(user_id,id,title,revision) values(${u},${q('context')},'Synthetic context',2);
    insert into public.study_context_revisions(user_id,context_id,revision,title,context_markdown,source_refs,origin) values(${u},${q('context')},1,'Old context','Old accepted proof','[]','legacy_current_baseline');
    insert into public.study_context_revisions(user_id,context_id,revision,title,context_markdown,source_refs,origin,request_id,payload_hash) values(${u},${q('context')},2,'New context','Accepted proof','[]','accepted_write',${quote(randomUUID())},'original');
    insert into public.learning_sources(user_id,id,title,source_type) values(${u},${q('source')},'Synthetic reference','manual');
    insert into public.learning_sections(user_id,id,source_id,locator,text_content) values(${u},${q('section')},${q('source')},'p1','Synthetic excerpt');
    insert into public.knowledge_source_versions(user_id,context_id,context_revision,source_id,revision,title,source_type,citation,request_id,payload_hash) values(${u},${q('context')},2,${q('source')},1,'Synthetic reference','manual','{}',${quote(randomUUID())},'source-payload');
    insert into public.knowledge_section_versions(user_id,source_id,source_revision,section_id,locator,text_content,text_sha256) values(${u},${q('source')},1,${q('section')},'p1','Synthetic excerpt',${hash});
    insert into public.study_plan_versions(user_id,plan_id,revision,context_id,context_revision,snapshot,creation_kind) values(${u},${q('plan')},1,${q('context')},1,'{"source_refs":[]}', 'initial'),(${u},${q('plan')},2,${q('context')},2,'{"source_refs":[]}', 'amendment');
    insert into public.learning_sessions(user_id,id,plan_id,topic) values(${u},${q('session')},${q('plan')},'Synthetic proof');
    insert into public.learning_events(user_id,event_id,session_id,event_type,payload) values(${u},${q('event')},${q('session')},'attempt','{"text":"Unfinished proof","hintLevel":2}');
    insert into public.study_checkpoints(user_id,plan_id,checkpoint_id,title,status,last_evidence_event_id,plan_revision) values(${u},${q('plan')},'c1','Synthetic checkpoint','in_progress',${q('event')},2);
    insert into public.tutor_handoffs(user_id,session_id,from_model,summary) values(${u},${q('session')},'Synthetic tutor','{"hintLevel":2}');
    insert into public.tutor_handoff_receipts(user_id,receipt_id,plan_id,plan_revision,checkpoint_id,action,artifact_id) values(${u},${q('receipt')},${q('plan')},2,'c1','reply_reviewed',${quote(randomUUID())});
    insert into public.review_events(user_id,event_id,note_id,ordinal,occurred_at_ms,grade,state_before) values(${u},${q('review')},${quote(note)},0,100,3,0);
    insert into public.review_retractions(user_id,retraction_id,target_event_id) values(${u},${q('undo')},${q('review')});
    insert into public.learning_card_links(user_id,note_id,session_id,relation) values(${u},${quote(note)},${q('session')},'generated');
    commit;`);
  const capture=token=>must('/rest/v1/rpc/capture_account_workspace_snapshot',token,{});
  const raw=await capture(a.token),otherBefore=await capture(b.token);
  assert.ok(TABLES.every(t=>raw.tables[t].length>0),'REAL nonempty fixture for all 19 tables');
  const archive=makeArchive({ownerId:a.id,tables:raw.tables,exportedAt:raw.capturedAt,
    migrations:require('node:fs').readdirSync(path.join(__dirname,'../supabase/migrations')).filter(x=>x.endsWith('.sql')).map(x=>x.slice(0,14)).sort()});
  const requestId=randomUUID();
  const restore=(token,value=archive,overrides={})=>call('/rest/v1/rpc/restore_account_workspace',token,
    {p_archive:value,p_request_id:requestId,p_dry_run:false,p_confirm:true,...overrides});
  assert.equal((await restore(a.token)).ok,false,'nonempty refuses overwrite');
  assert.equal((await restore(b.token)).ok,false,'foreign owner rejected');
  assert.equal((await restore(key)).ok,false,'anon denied');
  assert.equal((await restore(a.token,archive,{p_confirm:false})).ok,false);
  // Simulate catastrophic loss ONLY for this synthetic identity on localhost.
  // Immutable triggers stay intact in production; session-scoped fixture setup
  // bypasses them solely to model the missing destination for recovery tests.
  const order=['learning_card_links','review_retractions','review_events','tutor_handoff_receipts',
    'tutor_handoffs','study_checkpoints','learning_events','learning_sessions','study_plan_versions',
    'knowledge_section_versions','knowledge_source_versions','learning_sections','learning_sources',
    'study_context_revisions','study_context_files','study_plans','client_mutation_receipts','profiles','notes'];
  sql('begin; set local session_replication_role=replica;'+order.map(t=>`delete from public.${t} where user_id=${u};`).join('')+'commit;');
  const empty=await capture(a.token);assert.ok(TABLES.every(t=>empty.tables[t].length===0));
  const dry=await restore(a.token,archive,{p_dry_run:true});
  assert.ok(dry.ok,JSON.stringify(dry.data));assert.equal(dry.data.status,'validated');
  assert.deepEqual((await capture(a.token)).tables,empty.tables,'dry run rolls back real inserts');
  const malformed=structuredClone(archive);malformed.tables.learning_card_links[0].relation='invalid';
  assert.equal((await restore(a.token,malformed)).ok,false,'last insert fails real check constraint');
  assert.deepEqual((await capture(a.token)).tables,empty.tables,'late failure rolls back ALL prior inserts');
  const missing=structuredClone(archive);delete missing.tables.profiles;
  assert.equal((await restore(a.token,missing)).ok,false);
  const foreign=structuredClone(archive);foreign.tables.notes[0].user_id=b.id;
  assert.equal((await restore(a.token,foreign)).ok,false,'embedded foreign owner rejected');
  const versions=structuredClone(archive);versions.migrations.pop();
  assert.equal((await restore(a.token,versions)).ok,false,'schema mismatch fails closed');
  const results=await Promise.all([restore(a.token),restore(a.token)]);
  assert.ok(results.every(r=>r.ok),JSON.stringify(results));
  assert.deepEqual(results[0].data,results[1].data,'concurrent retry returns one durable receipt');
  assert.equal(results[0].data.status,'restored');
  const after=await capture(a.token);
  const sealed=makeArchive({...archive,tables:after.tables});
  for(const t of TABLES)assert.equal(sealed.manifest.hashes[t],archive.manifest.hashes[t],t+' exact restore');
  assert.deepEqual((await restore(a.token)).data,results[0].data,'lost HTTP response retry after restart');
  assert.equal((await restore(a.token,archive,{p_request_id:randomUUID()})).ok,false,'new key cannot overwrite');
  const changed=structuredClone(archive);changed.tables.notes[0].data.changed=true;
  assert.equal((await restore(a.token,changed)).ok,false,'same request cannot change payload');
  assert.deepEqual((await capture(b.token)).tables,otherBefore.tables,'second owner unchanged');
  for(const table of TABLES){
    const res=await fetch('http://127.0.0.1:54321/rest/v1/'+table+'?user_id=eq.'+a.id,
      {headers:{apikey:key,Authorization:'Bearer '+b.token}});
    assert.ok(res.ok);assert.equal((await res.json()).length,0,'two-owner read denial '+table);
  }
  assert.equal(sql("select has_function_privilege('anon','public.restore_account_workspace(jsonb,uuid,boolean,boolean)','execute'),has_table_privilege('authenticated','lemma_private.workspace_restore_receipts','insert')"),'f|f');
  console.log('PASS RELEASE full workspace restore: real GoTrue, all 19 tables exact, schedules/review/Undo/revisions/events/tutor receipts, atomic dry-run/failure, nonempty/owner denial and restart-safe concurrent retries');
  return {archive,restored:after.tables};
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={main};
