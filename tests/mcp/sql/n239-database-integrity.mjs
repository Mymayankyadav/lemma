// N239: reported data-loss reproductions against the complete migrated database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const one=async(sql,values=[])=>(await q(sql,values))[0].result;
const as=async(owner=null,role='authenticated')=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false),set_config('request.jwt.claims','{}',false)",[owner??'']);
 if(owner||role==='service_role')await db.exec('set role '+role);
};
const command=(resource,operation,id,patch,expectedVersion)=>({schemaVersion:1,
 resource,operation,operationId:randomUUID(),target:{id:String(id)},patch,
 ...(expectedVersion===undefined?{}:{expectedVersion})});
const invoke=(name,p)=>one('select public.'+name+'($1::jsonb) result',[JSON.stringify(p)]);
async function seed(label){
 await as();
 const owner=randomUUID(),subject=randomUUID(),project=randomUUID(),checkpoint=randomUUID();
 await q('insert into auth.users(id) values($1)',[owner]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,owner.replaceAll('-','')+'a'.repeat(16)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,$4,'Proofs','Study')",[project,owner,subject,label]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,$3,'CP1',1,'Proof','Prove the claim','Explain the proof','[\"Prove\"]')",[checkpoint,owner,project]);
 return {owner,subject,project,checkpoint,slug:label};
}
async function reviewCorrection(){
 const {owner,project}=await seed('corrections');
 const note=await one("insert into public.notes(user_id,project_id,front,back) values($1,$2,'Q','A') returning id result",[owner,project]);
 const card=await one('insert into public.cards(user_id,note_id,ord) values($1,$2,1) returning id result',[owner,note]);
 const schedule=reps=>({state:2,due:`2026-12-${String(reps+1).padStart(2,'0')}T00:00:00Z`,stability:reps*2,
  difficulty:4,last_review:`2026-11-${String(reps+1).padStart(2,'0')}T09:00:00Z`,step:0,reps,lapses:0});
 const state=async()=>(await q('select state,due,stability,difficulty,last_review,step,reps,lapses,version from public.cards where id=$1',[card]))[0];
 const grade=async reps=>one('select public.record_review($1,3,\'sure\',1000,$2::jsonb) result',
  [card,JSON.stringify({...schedule(reps),expected_version:(await state()).version})]);
 await as(owner);
 const original=await grade(1),preparedVersion=(await state()).version;
 const preparedSchedule=await one(`select jsonb_build_object(
  'state',state,'due',due,'stability',stability,'difficulty',difficulty,
  'last_review',last_review,'step',step,'reps',reps,'lapses',lapses) result
  from public.cards where id=$1`,[card]);
 await assert.rejects(one('select public.n239_mcp_review_correction_snapshot($1,$2) result',[owner,original]),
  /permission denied/,'the MCP snapshot reader is service-only');
 await as(null,'service_role');
 const readSnapshot=async user=>one('select public.n239_mcp_review_correction_snapshot($1,$2) result',[user,original]);
 const snapshot=await readSnapshot(owner);
 assert.equal(snapshot.review.id,String(original),'review IDs remain exact decimal strings');
 assert.equal(snapshot.review.cardId,card);
 assert.equal(snapshot.card.id,card);
 assert.equal(snapshot.card.version,preparedVersion);
 assert.equal(snapshot.expectedVersion,preparedVersion);
 assert.deepEqual(snapshot.card.schedule,preparedSchedule,'the snapshot returns all eight current schedule fields exactly');
 assert.ok(Number.isFinite(Date.parse(snapshot.readAt)));
 assert.equal(JSON.stringify(snapshot).includes(owner),false,'the read omits owner identifiers');
 await as(owner);
 const stale=command('review_corrections','correct',original,
  {reason:'Correct the first grade',rating:4,replacementState:schedule(1)},preparedVersion);
 await grade(2);
 const committed=await state();
 await as(null,'service_role');
 const newerSnapshot=await readSnapshot(owner);
 assert.equal(newerSnapshot.expectedVersion,committed.version);
 assert.equal(newerSnapshot.card.schedule.reps,2,'rereading returns the newer schedule with its matching version');
 await as(owner);
 assert.equal((await invoke('correct_review',stale)).status,'conflict',
  '#1820: a correction prepared before another grade must conflict');
 assert.deepEqual(await state(),committed,'#1820: preserve the complete newer schedule');
 assert.equal(await one('select count(*)::int result from public.reviews where user_id=$1 and card_id=$2 and undone_at is null',[owner,card]),2);
 await assert.rejects(invoke('correct_review',command('review_corrections','correct',original,
  stale.patch)),/expectedVersion/i,'unversioned replacements fail closed');
 const fresh=command('review_corrections','correct',original,
  {...stale.patch,replacementState:schedule(2)},committed.version);
 const corrected=await invoke('correct_review',fresh);
 assert.equal(corrected.status,'ok');
 await grade(3);
 const afterThird=await state();
 assert.deepEqual(await invoke('correct_review',fresh),corrected,
  'a lost acknowledgement replays the committed receipt before testing current version');
 assert.deepEqual(await state(),afterThird,'receipt replay cannot rewind a later grade');
 assert.equal((await invoke('void_review',command('review_corrections','void',original,
  {reason:'Void from stale draft',replacementState:schedule(1)},committed.version))).status,'conflict');
 const foreign=await seed('foreign-correction');
 await as(null,'service_role');
 await assert.rejects(readSnapshot(foreign.owner),/not found for owner/,'MCP reads cannot inspect another owner\'s review');
 await as(foreign.owner);
 await assert.rejects(invoke('correct_review',command('review_corrections','correct',original,
  stale.patch,afterThird.version)),/not found for owner/);
 await as(owner);
 const toVoid=command('review_corrections','void',original,
  {reason:'Remove a mistaken observation',replacementState:schedule(2)},afterThird.version);
 const voided=await invoke('void_review',toVoid);
 assert.equal(voided.status,'ok');
 assert.deepEqual(await invoke('void_review',toVoid),voided);
 assert.equal((await one('select public.undo_action($1,$2,false) result',[owner,voided.actionNo])).undone,voided.actionNo);
 assert.equal((await state()).reps,3,'undo restores the current schedule');
 assert.equal(await one('select undone_at result from public.reviews where id=$1',[original]),null);
}
async function tutorRemoval(){
 const {owner,project,checkpoint,slug}=await seed('tutor-removal');
 await db.exec("insert into public.tutor_release_controls(capability,enabled) values('manual',true) on conflict(capability) do update set enabled=true");
 // Isolated test release only; the application release gate is unchanged.
 await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select true'");
 await as(owner);
 const tutor=p=>one('select public.tutor_owner_command($1,$2,$3,$4::jsonb) result',[owner,slug,checkpoint,JSON.stringify(p)]);
 const started=await tutor({operation:'start',operationId:randomUUID(),expectedVersion:0,question:'Why does the converse hold?'});
 assert.equal(started.status,'submitted');
 assert.equal((await tutor({operation:'manual',operationId:randomUUID(),turnId:started.turnId,
  expectedVersion:1,messageId:randomUUID(),body:'A saved explanation of the converse.'})).status,'completed');
 assert.equal(await one('select status result from public.checkpoints where id=$1',[checkpoint]),'not_started');
 await as();
 const proposal=await one("insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'plan_change',$3::jsonb,'other') returning id result",
  [owner,project,JSON.stringify({ops:[{op:'remove',code:'CP1'}]})]);
 const before=await q('select turn_id,id,body from public.tutor_replies where user_id=$1',[owner]);
 const actionCount=await one('select count(*)::int result from public.actions where user_id=$1',[owner]);
 await as(owner);
 await assert.rejects(one('select public.approve_proposal($1) result',[proposal]),/tutor|conversation/i,
  '#1815: a saved tutor conversation makes a checkpoint touched');
 assert.equal(await one('select status result from public.proposals where id=$1',[proposal]),'pending');
 assert.equal(await one('select count(*)::int result from public.checkpoints where id=$1',[checkpoint]),1);
 await as();
 assert.deepEqual(await q('select turn_id,id,body from public.tutor_replies where user_id=$1',[owner]),before);
 assert.equal(await one('select count(*)::int result from public.actions where user_id=$1',[owner]),actionCount,
  'rejected removal leaves no successful action to undo');
 // Empty checkpoints retain their existing reversible removal behavior.
 await q("insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,'CP2',2,'Empty','Nothing saved','Explain','[\"Read\"]')",[owner,project]);
 const empty=await one("insert into public.proposals(user_id,project_id,kind,payload,origin) values($1,$2,'plan_change',$3::jsonb,'other') returning id result",
  [owner,project,JSON.stringify({ops:[{op:'remove',code:'CP2'}]})]);
 await as(owner);assert.equal((await one('select public.approve_proposal($1) result',[empty])).applied,1);
 const action=await one("select c.action_no result from public.action_changes c join public.actions a on a.no=c.action_no where a.user_id=$1 and c.table_name='proposals' and c.row_pk->>'id'=$2 order by c.action_no desc limit 1",[owner,empty]);
 await one('select public.undo_action($1,$2,false) result',[owner,action]);
 assert.equal(await one("select count(*)::int result from public.checkpoints where project_id=$1 and code='CP2'",[project]),1);
 // Owner-account deletion may still remove the full account and its transcript.
 await as(null,'service_role');
 await q('select public.lemma_begin_account_delete($1)',[owner]);
 await q('select public.lemma_purge_account_rows($1)',[owner]);
 await as();
 await q('delete from auth.users where id=$1',[owner]);
 assert.equal(await one('select count(*)::int result from public.tutor_replies where user_id=$1',[owner]),0);
}
async function atlasMerge(){
 const {owner,subject}=await seed('atlas-merge');
 const make=name=>one('insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,$3,$3) returning id result',[owner,subject,name]);
 const source=await make('source'),keep=await make('keep'),third=await make('third');
 const attempt=await one('insert into public.attempts(user_id) values($1) returning id result',[owner]);
 await q("insert into public.attempt_tags(user_id,attempt_id,concept_id,facet,result) values($1,$2,$3,'use','ok')",[owner,attempt,source]);
 await q("insert into public.instruction_events(user_id,concept_id,origin) values($1,$2,'tutor')",[owner,source]);
 await q("insert into public.atlas_links(user_id,from_id,to_id,kind,status,origin) values($1,$2,$3,'analogous','approved','tutor')",[owner,source,third]);
 const counts=()=>q('select (select count(*)::int from public.attempt_tags where user_id=$1) tags,(select count(*)::int from public.instruction_events where user_id=$1) instructions,(select count(*)::int from public.atlas_links where user_id=$1) links',[owner]);
 const before=await counts();
 await as(owner);
 const preview=await invoke('concepts_command',command('concepts','preview_merge',source,{keep_id:keep}));
 await assert.rejects(invoke('concepts_command',command('concepts','merge',source,
  {keep_id:keep,keep_version:preview.keepVersion},preview.sourceVersion)),/learning evidence|semantic links/i,
  '#1757: N226 already blocks destructive merge; keep this regression');
 assert.deepEqual(await counts(),before,'failed merge preserves all newer learning facts');
 assert.equal(preview.protectedDependencies.attemptTags,1,'preview exposes the reason merging is unsafe');
 assert.equal(preview.protectedDependencies.instructionEvents,1);
 assert.equal(preview.protectedDependencies.typedLinks,1);
 assert.equal(preview.mergeAllowed,false);
 await as();
 assert.equal(await one("select count(*)::int result from public.command_receipts where user_id=$1 and resource='concepts'",[owner]),0);
 const foreign=await seed('foreign-atlas');await as(foreign.owner);
 await assert.rejects(invoke('concepts_command',command('concepts','preview_merge',source,{keep_id:keep})),/not found for owner/);
}
try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec('grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated');
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort())
  await db.exec(await readFile(new URL(name,dir),'utf8'));
 for(const name of ['correct_review(jsonb)','concepts_command(jsonb)']){
  const privileges=await q("select has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') authenticated,has_function_privilege('service_role',$1,'EXECUTE') service",['public.'+name]);
  assert.deepEqual(privileges,[{anon:false,authenticated:true,service:true}],name+' retains its original restricted ACL');
 }
 assert.deepEqual(await q("select has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') authenticated,has_function_privilege('service_role',$1,'EXECUTE') service",['public.n239_mcp_review_correction_snapshot(uuid,bigint)']),
  [{anon:false,authenticated:false,service:true}],'the new read grants execution only to service_role');
 const failed=[];
 for(const [name,test] of [['#1820 schedule correction',reviewCorrection],['#1815 tutor preservation',tutorRemoval],['#1757 Atlas merge safety',atlasMerge]]){
  try{await test();console.log('PASS '+name)}catch(error){failed.push(name);console.error('FAIL '+name+': '+error.message)}
 }
 assert.deepEqual(failed,[],'critical database regressions');
}finally{await db.close()}
