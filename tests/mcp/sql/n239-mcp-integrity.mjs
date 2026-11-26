process.on('uncaughtException',e=>{console.error(e.message);if(e.where)console.error(e.where);process.exit(1)});
// N239: all migrations, disposable synthetic owners, real mcp_commit transactions.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner=randomUUID(),other=randomUUID(),project=randomUUID(),cp=randomUUID(),session=randomUUID(),source=randomUUID();
const service=async fn=>{await db.exec('set role service_role');try{return await fn();}finally{await db.exec('reset role')}};
const commit=(tool,commands)=>service(async()=>(await q('select public.mcp_commit($1,$2,$3,$4,$5::jsonb) r',[owner,tool,'chatgpt','N239 test',JSON.stringify(commands)]))[0].r);
const preview=(table,key,user=owner)=>service(async()=>(await q('select public.n239_mcp_delete_scope($1,$2,$3::jsonb,false) r',[user,table,JSON.stringify(key)]))[0].r);
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $a$select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$a$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$select decode(repeat('00',n),'hex')$b$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort()){
  if(process.env.N239_WITHOUT_MCP_FIX==='1'&&file.includes('_n239_mcp_integrity'))continue;
  try{await db.exec(await readFile(new URL(file,dir),'utf8'));}catch(e){throw Error(file+': '+e.message)}
 }
 const commitAcl=(await q("select has_function_privilege('anon','public.mcp_commit(uuid,text,text,text,jsonb)','EXECUTE') anon,has_function_privilege('authenticated','public.mcp_commit(uuid,text,text,text,jsonb)','EXECUTE') authenticated,has_function_privilege('service_role','public.mcp_commit(uuid,text,text,text,jsonb)','EXECUTE') service"))[0];
 assert.deepEqual(commitAcl,{anon:false,authenticated:false,service:true},'replacement preserves service-role-only commit authority');
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [id,secret] of [[owner,'a'.repeat(48)],[other,'b'.repeat(48)]])await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[id,secret]);
 await q("insert into public.projects(id,user_id,slug,title,goal,status,prompt) values($1,$2,'n239-mcp','MCP','Proof','active','Base')",[project,owner]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,status,recheck_level,recheck_due) values($1,$2,$3,'CP1',1,'Proof','Prove','Proof accepted','[\"Proof\"]','demonstrated',2,current_date+30)",[cp,owner,project]);
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'Proof','socratic',$4)",[session,owner,project,cp]);
 const progress=[{op:'rpc',fn:'save_progress',args:{p_user_id:owner,p_project_id:project,p_session_id:session,p_payload:{events:[{kind:'recheck',text:'One clean delayed proof',outcome:'demonstrated'}]}}}];
 const receipt=await commit('save_progress',progress),retry=await commit('save_progress',progress);
 assert.deepEqual(retry,receipt,'lost acknowledgement replays exact action/receipt');
 assert.equal((await q('select count(*)::int n from public.session_events where session_id=$1',[session]))[0].n,1,'one learner answer creates one event');
 const checkpoint=(await q('select recheck_level,recheck_due from public.checkpoints where id=$1',[cp]))[0];
 assert.equal(checkpoint.recheck_level,3);assert.ok(checkpoint.recheck_due,'retry cannot retire scheduled recheck');
 const intentional=structuredClone(progress);intentional[0].args.operation_id=randomUUID();
 await commit('save_progress',intentional);
 assert.equal((await q('select count(*)::int n from public.session_events where session_id=$1',[session]))[0].n,2,'explicit different operation records a second real observation');
 intentional[0].args.p_payload.events[0].text='Different retry';
 await assert.rejects(commit('save_progress',intentional),/Operation ID reused/);
 console.log('PASS #1819 owner-scoped replay, intentional repeat and changed-payload conflict');

 await q("insert into public.sources(id,user_id,project_id,title,short,filename,status) values($1,$2,$3,'Scan','scan','scan.pdf','ready')",[source,owner,project]);
 await q("insert into public.source_pages(user_id,source_id,page,body,label,confidence) select $1,$2,n,'','00'||n,'check' from generate_series(1,10)n",[owner,source]);
 const pages=who=>Array.from({length:10},(_,i)=>({op:'update',table:'source_pages',where:{source_id:source,page:i+1},expected:{body:''},values:{body:who+' '+(i+1)}}));
 await commit('save_pages',pages('First'));
 await assert.rejects(commit('save_pages',pages('Second')),/Row changed/);
 assert.equal((await q("select count(*)::int n from public.source_pages where source_id=$1 and body like 'First %'",[source]))[0].n,10);
 console.log('PASS #1818 all ten first-committed page bodies survive a conflicting batch');

 const prompt=text=>[{op:'update',table:'projects',where:{id:project},expected:{prompt:'Base'},values:{prompt:'Base\n'+text}}];
 await commit('set_prompt',prompt('First'));
 await assert.rejects(commit('set_prompt',prompt('Second')),/Row changed/);
 assert.equal((await q('select prompt from public.projects where id=$1',[project]))[0].prompt,'Base\nFirst');
 console.log('PASS #1809 stale prompt append reports conflict and preserves committed instruction');

 const note=(await q("insert into public.notes(user_id,project_id,type,front,back) values($1,$2,'basic','Original','Proof') returning *",[owner,project]))[0];
 const proposal=(await q("insert into public.proposals(user_id,project_id,kind,origin,payload) values($1,$2,'card_edit','chatgpt',$3::jsonb) returning *",[owner,project,JSON.stringify({note_no:note.no,front:'Older suggestion'})]))[0];
 assert.equal(proposal.base_target_versions.notes[note.id],note.version,'old clients receive target snapshot at insertion');
 await q("update public.notes set type='cloze',front='{{c1::A}} and {{c2::B}}' where id=$1",[note.id]);
 await q('select public.lemma_reconcile_cards($1,$2)',[owner,note.id]);
 const second=(await q('select * from public.cards where note_id=$1 and ord=2',[note.id]))[0];
 await q("insert into public.reviews(user_id,card_id,rating,reviewed_at,state_before,duration_ms,prev) values($1,$2,3,now(),0,0,'{}')",[owner,second.id]);
 await assert.rejects(commit('decide',[{op:'rpc',fn:'approve_proposal',args:{p_id:proposal.id}}]),/target changed/);
 assert.equal((await q('select count(*)::int n from public.reviews where card_id=$1',[second.id]))[0].n,1);
 assert.equal((await q('select count(*)::int n from public.cards where id=$1',[second.id]))[0].n,1);
 assert.equal((await q('select status from public.proposals where id=$1',[proposal.id]))[0].status,'pending');
 await q("update public.proposals set base_target_versions='{}' where id=$1",[proposal.id]);
 await assert.rejects(commit('decide',[{op:'rpc',fn:'approve_proposal',args:{p_id:proposal.id}}]),/old card edit has no target version/);
 assert.equal((await q('select count(*)::int n from public.reviews where card_id=$1',[second.id]))[0].n,1,'pre-upgrade versionless proposal refuses rather than destroying the later grade');
 console.log('PASS #1814 stale proposal preserves cloze sibling, grade and pending approval');

 const empty=randomUUID();await q("insert into public.projects(id,user_id,slug,title,goal,status) values($1,$2,'n239-delete','Delete','Proof','active')",[empty,owner]);
 const initial=await preview('projects',{id:empty});
 assert.equal(initial.counts.projects,1);assert.equal(initial.counts.notes,0);
 await q("insert into public.notes(user_id,project_id,type,front,back) select $1,$2,'basic','Proof '||n,'Proof' from generate_series(1,25)n",[owner,empty]);
 await assert.rejects(commit('delete',[{op:'delete',table:'projects',where:{id:empty},expectedScope:initial.token}]),/scope changed/);
 assert.equal((await q('select count(*)::int n from public.notes where project_id=$1',[empty]))[0].n,25);
 await assert.rejects(preview('projects',{id:empty},other),/not found/);
 const current=await preview('projects',{id:empty});assert.equal(current.counts.notes,25);
 const deleted=await commit('delete',[{op:'delete',table:'projects',where:{id:empty},expectedScope:current.token}]);
 assert.equal((await q('select count(*)::int n from public.notes where project_id=$1',[empty]))[0].n,0);
 await service(()=>q('select public.undo_action($1,$2,false)',[owner,deleted.action]));
 assert.equal((await q('select count(*)::int n from public.notes where project_id=$1',[empty]))[0].n,25,'confirmed cascade remains undoable');
 const modified=await preview('projects',{id:empty});
 await q("update public.notes set back='Updated proof' where project_id=$1",[empty]);
 await assert.rejects(commit('delete',[{op:'delete',table:'projects',where:{id:empty},expectedScope:modified.token}]),/scope changed/);
 await q("insert into public.styles(user_id,key,name,instructions,icon) values($1,'ncritical','Critical test','Ask one proof','sparkles')",[owner]);
 const stylePreview=await preview('styles',{user_id:owner,key:'ncritical'});
 await q("update public.projects set style='ncritical' where id=$1",[empty]);
 await assert.rejects(commit('delete',[{op:'delete',table:'styles',where:{user_id:owner,key:'ncritical'},expectedScope:stylePreview.token}]),/Style is used/);
 await assert.rejects(preview('styles',{user_id:owner,key:'ncritical'}),/Style is used/);
 assert.equal((await q("select count(*)::int n from public.styles where user_id=$1 and key='ncritical'",[owner]))[0].n,1,'logical style references survive even without an FK');
 await db.exec('set role authenticated');
 await assert.rejects(q('select public.n239_mcp_delete_scope($1,$2,$3::jsonb,false)',[owner,'projects',JSON.stringify({id:empty})]),/permission denied/);
 await db.exec('reset role');
 console.log('PASS #1817 changed children/content refuse stale consent; exact preview/delete/Undo and owner ACL pass');

 // Incident #1514's cascade-count coverage belongs at the actual database
 // reader now. Populate every original link plus unrelated and foreign graphs.
 const pageBody='N239_PAGE_SECRET_'.repeat(1250).slice(0,20000);
 const transcript='N239_TRANSCRIPT_SECRET_'.repeat(30).slice(0,600);
 const graph=async(user,slug)=>{
  const g=Object.fromEntries(['subject','project','source','first','second','concept','related','session','note','comment'].map(key=>[key,randomUUID()]));
  await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,$3,'M','cyan')",[g.subject,user,slug]);
  await q("insert into public.projects(id,user_id,subject_id,slug,title,goal,status) values($1,$2,$3,$4,'Graph','Count the dependency scope','active')",[g.project,user,g.subject,slug]);
  await q("insert into public.sources(id,user_id,project_id,title,short,filename,status) values($1,$2,$3,'Scan','scan','scan.pdf','ready')",[g.source,user,g.project]);
  await q("insert into public.source_pages(user_id,source_id,page,body) values($1,$2,1,$3),($1,$2,2,$3)",[user,g.source,pageBody]);
  await q("insert into public.concepts(id,user_id,subject_id,slug,name) values($1,$2,$3,'first','First'),($4,$2,$3,'second','Second')",[g.concept,user,g.subject,g.related]);
  await q("insert into public.concept_links(user_id,from_id,to_id,kind) values($1,$2,$3,'related')",[user,g.concept,g.related]);
  await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps,source_id) values($1,$2,$3,'CP1',1,'First','Prove','Proof accepted','[\"Proof\"]',$4),($5,$2,$3,'CP2',2,'Second','Prove','Proof accepted','[\"Proof\"]',$4)",[g.first,user,g.project,g.source,g.second]);
  await q('insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id) values($1,$2,$3)',[user,g.second,g.first]);
  await q('insert into public.checkpoint_concepts(user_id,checkpoint_id,concept_id) values($1,$2,$3),($1,$4,$5)',[user,g.first,g.concept,g.second,g.related]);
  await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'Proof','socratic',$4)",[g.session,user,g.project,g.first]);
  await q("insert into public.session_events(user_id,session_id,checkpoint_id,kind,body) values($1,$2,$3,'note',$4),($1,$2,$3,'note',$4)",[user,g.session,g.first,transcript]);
  await q("insert into public.misconceptions(user_id,project_id,concept_id,label) values($1,$2,$3,'Check the converse')",[user,g.project,g.concept]);
  await q("insert into public.notes(id,user_id,project_id,checkpoint_id,session_id,concept_id,source_id,type,front,back) values($1,$2,$3,$4,$5,$6,$7,'reverse','A statement','Its converse')",[g.note,user,g.project,g.first,g.session,g.concept,g.source]);
  await q('select public.lemma_reconcile_cards($1,$2)',[user,g.note]);
  await q("insert into public.card_comments(id,user_id,note_id,body) values($1,$2,$3,'Please explain the converse')",[g.comment,user,g.note]);
  await q("insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) select $1,id,3,0,0,'{}' from public.cards where user_id=$1 and note_id=$2",[user,g.note]);
  return g;
 };
 const targetGraph=await graph(owner,'n239-count-target');
 const unrelatedGraph=await graph(owner,'n239-count-unrelated');
 const foreignGraph=await graph(other,'n239-count-target');
 // Both FK endpoints matter: an outside checkpoint depending on the target
 // contributes the edge, without pulling the outside checkpoint into deletion.
 await q('insert into public.checkpoint_prereqs(user_id,checkpoint_id,prereq_id) values($1,$2,$3)',[owner,unrelatedGraph.first,targetGraph.first]);
 await q("insert into public.concept_links(user_id,from_id,to_id,kind) values($1,$2,$3,'related')",[owner,unrelatedGraph.concept,targetGraph.concept]);
 const graphScope=await preview('projects',{id:targetGraph.project});
 const nonempty=counts=>Object.fromEntries(Object.entries(counts).filter(([,count])=>count>0));
 assert.deepEqual(nonempty(graphScope.counts),{
  projects:1,sources:1,source_pages:2,checkpoints:2,checkpoint_prereqs:2,
  checkpoint_concepts:2,checkpoint_sources:2,sessions:1,session_events:2,misconceptions:1,
  notes:1,cards:2,card_comments:1,reviews:2
 },'project scope follows every dependency once and excludes unrelated/foreign rows');
 const conceptScope=await preview('concepts',{id:targetGraph.concept});
 assert.deepEqual(nonempty(conceptScope.counts),{
  concepts:1,concept_links:2,checkpoint_concepts:1,misconceptions:1,
  notes:1,cards:2,card_comments:1,reviews:2
 },'concept scope includes incoming and outgoing links without following links back to unrelated parents');
 for(const result of [graphScope,conceptScope]){
  assert.deepEqual(Object.keys(result).sort(),['counts','token']);
  assert.match(result.token,/^[0-9a-f]{64}$/);
  const serialized=JSON.stringify(result);
  assert.ok(serialized.length<4096,'the database returns compact counts and a hash');
  assert.ok(!serialized.includes('N239_PAGE_SECRET_')&&!serialized.includes('N239_TRANSCRIPT_SECRET_'),'page and transcript bodies never enter the preview response');
 }
 for(const g of [unrelatedGraph,foreignGraph]){
  await q("update public.source_pages set body='Outside edit' where source_id=$1",[g.source]);
  await q("update public.session_events set body='Outside observation' where session_id=$1",[g.session]);
  await q("update public.notes set back='Outside proof' where id=$1",[g.note]);
 }
 assert.deepEqual(await preview('projects',{id:targetGraph.project}),graphScope,'unrelated and foreign data changes cannot alter the consent scope');
 assert.equal((await q('select count(*)::int n from public.source_pages where source_id=$1 and body=$2',[targetGraph.source,pageBody]))[0].n,2,'read-only preview retains both full source pages');
 assert.equal((await q('select count(*)::int n from public.session_events where session_id=$1 and body=$2',[targetGraph.session,transcript]))[0].n,2,'read-only preview retains both full transcript rows');
 console.log('PASS #1514 migrated full dependency counts, both link endpoints, owner isolation and compact body-free preview');
}finally{await db.close()}
