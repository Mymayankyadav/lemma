// Run locally in PGlite and on CI's disposable PostgreSQL database (including two-connection retries).
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {openN191Postgres} from './fixtures/n191-pg-fixture.mjs';

const db = process.env.NOTIF_TEST_DATABASE_URL ? await openN191Postgres(process.env.NOTIF_TEST_DATABASE_URL) :
  new (await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')).PGlite();
const owner = randomUUID(), other = randomUUID();
const tables = ['exam_sittings','exam_attempts','card_ideas'];
const functions = ['exam_sitting_command','exam_attempt_command','card_idea_command'];
const query = async (sql, values = [], connection = db) => (await connection.query(sql,values)).rows;
const one = async (sql, values = [], connection = db) => (await query(sql,values,connection))[0]?.value;
const command = (resource, operation, patch = {}, id, expectedVersion) => ({schemaVersion:1,resource,operation,operationId:randomUUID(),patch,
  ...(id ? {target:{id}} : {}), ...(expectedVersion === undefined ? {} : {expectedVersion})});
async function mcp(cmd, user=owner, connection=db) {
  await connection.query('set role service_role');
  try {return await one("select public.mcp_command($1,'claude',$2::jsonb) value",[user,JSON.stringify(cmd)],connection);}
  finally {await connection.query('reset role');}
}
const write = (...args) => mcp(command(...args));
async function undo(no) {
  await query("select set_config('test.uid',$1,false)",[owner]);
  await query('set role authenticated');
  try {await query('select public.undo_action($1,$2)',[owner,no]);} finally {await query('reset role');}
}
try {
  for (const role of ['anon','authenticated','service_role']) if (!(await query('select 1 from pg_roles where rolname=$1',[role])).length) await db.exec('create role '+role);
  await db.exec(`create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select coalesce(
      nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
      nullif(current_setting('test.uid',true),'')::uuid) $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  if (db.native) await db.exec('create extension pgcrypto with schema extensions');
  else await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(repeat('00',n),'hex') $$");
  const dir = new URL('../../../supabase/migrations/',import.meta.url);
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.sql') && !n.includes('_storage')).sort()) await db.exec(await readFile(new URL(name,dir),'utf8'));
  await query('insert into auth.users(id) values ($1),($2)',[owner,other]);
  for (const [id,secret] of [[owner,'a'.repeat(48)],[other,'b'.repeat(48)]]) await query('insert into public.settings(user_id,connector_secret) values ($1,$2)',[id,secret]);
  const project = await one("insert into public.projects(user_id,slug,title,goal,status) values ($1,'linear-algebra','Linear algebra','Pass','active') returning id value",[owner]);
  const subject = await one("insert into public.subjects(user_id,name,glyph,hue) values($1,'Algebra','A','cyan') returning id value",[owner]);
  await query('update public.projects set subject_id=$2 where id=$1',[project,subject]);
  const cp = await one("insert into public.checkpoints(user_id,project_id,code,position,title,objective,criterion,status,steps,current_step) values ($1,$2,'CP4',1,'Eigenbases','Find a basis','Justify','in_progress','[\"Find\",\"Justify\"]',2) returning id value",[owner,project]);
  await query("insert into public.sessions(user_id,project_id,checkpoint_id,number,goal,style,resume_step,resume_question) values ($1,$2,$3,7,'Review','socratic',2,'Find a basis?')",[owner,project,cp]);
  for (const [i,t] of tables.entries()) {
    assert.equal(await one('select command_fn value from public.lemma_command_resources where resource=$1 and mcp_ok',[t]),functions[i]);
    for (const registry of ['public.lemma_undo_tables','lemma_export_private.resources']) assert.equal(await one(`select count(*)::int value from ${registry} where table_name=$1`,[t]),1);
    for (const trigger of ['lemma_log_change','lemma_account_delete_write_guard']) assert.equal(await one('select count(*)::int value from pg_trigger where tgrelid=$1::regclass and tgname=$2',[t,trigger]),1);
    for (const role of ['anon','authenticated']) for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal(await one('select has_table_privilege($1,$2,$3) value',[role,t,privilege]),false);
    for (const role of ['anon','authenticated','service_role']) assert.equal(await one("select has_function_privilege($1,$2,'EXECUTE') value",[role,functions[i]+'(jsonb)']),role !== 'anon');
  }
  assert.equal(await one("select count(*)::int value from pg_proc where pronamespace='public'::regnamespace and proname like 'lemma_exam_%' and (has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE'))"),0);
  const rows = [{key:'diag',title:'Justify diagonalizability',marks:20,concepts:['eigenbasis'],level:'use'},{key:'rank',title:'Find rank',marks:12}];
  const base = {project:'linear-algebra',title:'Linear algebra final',starts_at:'2026-11-27',time_zone:'Asia/Kolkata',study_minutes:90,blueprint:rows};
  const invalid = patch => write('exam_sittings','create',{...base,...patch});
  for (const [patch,message] of [[{project:'unknown'},/project/i],[{colour:'red'},/colour/],[{time_zone:'Unknown/Zone'},/zone/i],[{objective:'pass_threshold'},/pass_marks/],
    ...[[[rows[0],rows[0]],/duplicate/i],[[{...rows[0],key:'?'}],/key/i],[[{...rows[0],marks:0}],/marks/i],[[{...rows[0],marks_low:22}],/marks/i],
      [[{...rows[0],colour:'red'}],/colour/],[[{...rows[0],prereqs:['missing']}],/prereq/i],[[{...rows[0],chance:2}],/chance/i]].map(([blueprint,re])=>[{blueprint},re])]) await assert.rejects(invalid(patch), message);
  const create = command('exam_sittings','create',{...base,activate:true});
  const created = await mcp(create), sitting = created.id;
  assert.deepEqual(await mcp(create),created);
  assert.equal((await mcp({...create,patch:{...create.patch,title:'Different'}})).status,'conflict');
  assert.equal(await one('select count(*)::int value from public.exam_sittings'),1);
  assert.deepEqual([created.version,created.sittingStatus,created.bookmark.checkpoint,created.bookmark.step,created.bookmark.steps,created.bookmark.session,created.bookmark.question],[1,'active','CP4',2,2,7,'Find a basis?']);
  assert.equal(await one("select starts_at='2026-11-27T03:30:00Z'::timestamptz value from public.exam_sittings where id=$1",[sitting]),true);
  assert.deepEqual(await query('select source,tool from public.actions where no=$1',[created.actionNo]),[{source:'claude',tool:'study'}]);
  // The read crosses projects only through owner+subject concepts and honours the as-of cutoff.
  const concept = await one("insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,'eigenbasis','Eigenbasis') returning id value",[owner,subject]);
  const unrelated = await one("insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,'series','Series') returning id value",[owner,subject]);
  const instant='2026-11-25T12:00:00Z';
  await query(`insert into public.evidence(user_id,concept_id,occurred_at,level,outcome,origin)
    select $1,$2,$3::timestamptz - n * interval '1 second','use','pass','tutor' from generate_series(1,2001) n`,[owner,concept,instant]);
  await query(`insert into public.evidence(user_id,concept_id,occurred_at,level,outcome,origin)
    values($1,$2,$4::timestamptz,'use','fail','tutor'),($1,$3,$4::timestamptz+interval '1 minute','use','fail','tutor'),($1,$3,$4::timestamptz-interval '121 days','use','fail','tutor')`,[owner,unrelated,concept,instant]);
  await query("insert into public.evidence(user_id,concept_id,occurred_at,level,outcome,origin,voided_at) values($1,$2,$3,'use','fail','tutor',now())",[owner,concept,instant]);
  await query("select set_config('test.uid',$1,false)",[owner]); await query('set role authenticated');
  const observations = await one('select public.exam_row_evidence($1,$2,$3) value',[owner,sitting,instant]);
  const homeRows=await one('select public.exam_home_rows($1,$2) value',[sitting,instant]);
  assert.deepEqual(homeRows.coverage,{accounted:32,secure:20,deferred:0});
  assert.equal(homeRows.nextStudy.code,'CP4'); assert.equal(homeRows.topRows[0].row.key,'rank');
  const home=await one('select public.exam_home_summary() value');
  assert.ok(Array.isArray(home.exam.sittings));assert.ok(home.projects);
  assert.equal(observations.length,2000);
  assert(observations.every(e=>e.outcome==='pass' && e.concept==='eigenbasis' && !('user_id' in e)));
  assert.equal(Date.parse(observations.at(-1).occurred_at),Date.parse(instant)-2_000_000);
  await query("select set_config('test.uid',$1,false)",[other]);
  assert.deepEqual(await one('select public.exam_row_evidence($1,$2,$3) value',[owner,sitting,instant]),[]);
  await query('reset role');
  for(const role of ['anon','authenticated','service_role'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])
    assert.equal(await one('select has_table_privilege($1,$2,$3) value',[role,'exam_decisions',privilege]),false);
  assert.equal(await one("select count(*)::int value from lemma_export_private.resources where table_name='exam_decisions'"),1);
  assert.equal(await one("select count(*)::int value from public.lemma_undo_tables where table_name='exam_decisions'"),0);
  const prediction={inputs_hash:'a'.repeat(64),inputs:{},candidates:[{action:'teach'}],chosen:{action:'teach',rationale:'Timed lesson'},
    runner_up:null,qualitative:{kind:'probe'},predictions:[],policy:'selector-v1',shadow:true};
  await query('set role service_role');
  await query('select public.log_exam_decision($1,$2,$3,$4)',[owner,sitting,instant,prediction]);
  await assert.rejects(query('select public.log_exam_decision($1,$2,$3,$4)',[other,sitting,instant,prediction]),/permission|privilege/i);
  await query('reset role');
  await assert.rejects(query('update public.exam_decisions set shadow=true'),/append-only/);
  await query('set role authenticated');
  assert.equal(await one('select count(*)::int value from public.exam_decisions'),0);
  assert.deepEqual((await one('select public.exam_home_summary() value')).exam.sittings,[]);
  await query('reset role');
  await assert.rejects(invalid({activate:true}),/pause/i);
  const stale = await write('exam_sittings','update',{title:'Different'},sitting,2);
  assert.equal(stale.conflict.currentVersion,1); assert.equal('user_id' in stale.current,false);
  const edit = (operation,patch,version) => write('exam_sittings',operation,patch,sitting,version);
  for (const item of [{key:'rank',disposition:'skip'},{key:'rank',disposition:'defer',reason:'Low weight'},{key:'unknown',disposition:'pin'}]) await assert.rejects(edit('set_disposition',{rows:[item]},1));
  const ledger = await edit('set_disposition',{rows:[{key:'rank',disposition:'defer',reason:'No time',reopen:'More minutes'}]},1);
  assert.equal(ledger.version,2);
  const trimmed = await edit('update',{blueprint:[rows[0]]},2);
  assert.equal(trimmed.blueprintVersion,2); assert.equal(await one("select ledger='{}'::jsonb value from public.exam_sittings where id=$1",[sitting]),true);
  const same = await edit('update',{title:base.title},3);
  assert.deepEqual([same.unchanged,same.version,same.actionNo],[true,3,null]);
  const record = {sitting_id:sitting,row_key:'diag',outcome:'correct',delivery_ref:'turn:42',marks_awarded:2,marks_possible:2};
  for (const invalid of [{row_key:'rank'},{outcome:null},{outcome:'exposure',independence:'reading'},{marks_awarded:3},{session:'S999'}]) await assert.rejects(write('exam_attempts','record',{...record,...invalid}));
  const scored = await write('exam_attempts','record',record);
  const duplicate = await write('exam_attempts','record',record);
  assert.deepEqual([duplicate.status,duplicate.id,duplicate.actionNo],['duplicate',scored.id,null]);
  assert.deepEqual(await query('select concept,level,blueprint_version from public.exam_attempts where id=$1',[scored.id]),[{concept:'eigenbasis',level:'use',blueprint_version:2}]);
  await assert.rejects(write('exam_attempts','correct',{outcome:'partial'},scored.id,1),/reason/i);
  const correction = await write('exam_attempts','correct',{outcome:'partial',marks_awarded:1,reason:'One method mark'},scored.id,1); assert.equal(correction.version,2);
  await write('exam_attempts','void',{reason:'Repeated'},scored.id,2);
  const replacement = await write('exam_attempts','record',record);
  await assert.rejects(write('exam_attempts','restore',{},scored.id,3));
  await write('exam_attempts','void',{reason:'Use original'},replacement.id,1); await write('exam_attempts','restore',{},scored.id,3);
  const read = await write('exam_attempts','record',{sitting_id:sitting,row_key:'diag',outcome:'exposure',independence:'reading'});
  assert.equal(await one('select marks_awarded value from public.exam_attempts where id=$1',[read.id]),null);
  const idea = {project_id:project,sitting_id:sitting,target:'Find a basis',evidence:[{attempt:scored.id}]};
  const saved = await write('card_ideas','save',idea), merged = await write('card_ideas','save',{...idea,target:'FIND  A  BASIS',evidence:[{note:'Again'}]});
  assert.deepEqual([merged.id,merged.merged,merged.sightings],[saved.id,true,2]);
  assert.equal(await one('select jsonb_array_length(evidence) value from public.card_ideas where id=$1',[saved.id]),2);
  await assert.rejects(write('card_ideas','draft',{},saved.id,2),/front/i);
  const draft = await write('card_ideas','draft',{front:'Find a basis?',back:'Use the eigenspaces.',checkpoint:'CP4'},saved.id,2);
  const proposal = (await query('select status,origin,payload from public.proposals where no=$1',[draft.proposalNo]))[0];
  assert.deepEqual([proposal.status,proposal.origin,proposal.payload.front,proposal.payload.checkpoint,proposal.payload.cardIdea],['pending','claude','Find a basis?','CP4',saved.id]);
  assert.equal((await write('card_ideas','draft',{front:'Find a basis?'},saved.id,2)).status,'conflict');
  await undo(draft.actionNo);
  assert.equal(await one('select count(*)::int value from public.proposals where no=$1',[draft.proposalNo]),0);
  const restored = (await query('select status,version from public.card_ideas where id=$1',[saved.id]))[0];
  assert.equal(restored.status,'saved');
  await write('card_ideas','dismiss',{},saved.id,restored.version);
  const again = await write('card_ideas','save',idea); assert.notEqual(again.id,saved.id);
  await assert.rejects(write('card_ideas','restore',{},saved.id,restored.version+1));
  const secondDraft=await write('card_ideas','draft',{front:'One retrieval target?',back:'Use it.'},again.id,1);
  await query("select set_config('test.uid',$1,false)",[owner]);
  await query("select public.approve_proposal(id) from public.proposals where user_id=$1 and no=$2",[owner,secondDraft.proposalNo]);
  assert.equal(await one("select count(*)::int value from public.card_ideas i join public.notes n on n.id=i.note_id where i.id=$1 and i.status='linked' and n.front='One retrieval target?' ",[again.id]),1);
  const approval=await one("select max(no) value from public.actions where user_id=$1",[owner]);
  await undo(approval);
  assert.equal(await one("select status value from public.card_ideas where id=$1",[again.id]),'drafted');
  const noteNo = await one("insert into public.notes(user_id,project_id,front,back) values($1,$2,'Known theorem','A proof') returning no value",[owner,project]);
  const known = await write('card_ideas','save',{project_id:project,target:'Known theorem',front:'Known theorem'});
  assert.equal(known.existingCard,'N'+noteNo);
  await assert.rejects(write('card_ideas','draft',{},known.id,1),/link/i);
  await write('card_ideas','link',{card:'N'+noteNo},known.id,1);
  for (const [table,id,op] of [[tables[0],sitting,'pause'],[tables[1],scored.id,'void'],[tables[2],again.id,'dismiss']]) {
    await assert.rejects(mcp(command(table,op,{reason:'Other'},id,1),other),/not found/i);
  }
  const paused=await edit('pause',{},3);
  await query("update public.sessions set resume_question='New course question' where user_id=$1 and number=7",[owner]);
  const active=await edit('activate',{},paused.version); assert.equal(active.bookmark.question,'New course question');
  let version=(await edit('pause',{},active.version)).version;
  await assert.rejects(edit('finish',{},version),/happened/i);
  const finished=await edit('finish',{happened:true},version); await assert.rejects(write('exam_attempts','record',record),/reopen/i);
  await undo(finished.actionNo);
  const undone=(await query('select status,version from public.exam_sittings where id=$1',[sitting]))[0]; assert.equal(undone.status,'paused');
  version=(await edit('finish',{happened:false},undone.version)).version;
  version=(await edit('update',{result_marks:10},version)).version;
  version=(await edit('reopen',{starts_at:'2026-11-29T09:00'},version)).version;
  assert.deepEqual(await query('select happened,result_marks,finished_at from public.exam_sittings where id=$1',[sitting]),[{happened:null,result_marks:null,finished_at:null}]);
  await edit('cancel',{},version);
  await query("select set_config('test.uid',$1,false)",[other]); await query('set role authenticated');
  for (const t of tables) assert.equal(await one(`select count(*)::int value from public.${t}`),0);
  await assert.rejects(query('insert into public.exam_sittings default values'),/permission denied/i);
  await query("select set_config('test.uid',$1,false),set_config('lemma.source','claude',false)",[owner]);
  const direct=await one('select public.exam_sitting_command($1) value',[JSON.stringify(command('exam_sittings','create',base))]); await query('reset role');
  assert.deepEqual(await query('select source,tool from public.actions where no=$1',[direct.actionNo]),[{source:'app',tool:'exam_sitting_command'}]);
  if (db.native) {
    const request=command('exam_sittings','create',base);
    const receipts=await Promise.all([1,2].map(()=>db.transaction(c=>mcp(request,owner,c))));
    assert.deepEqual(receipts[0],receipts[1]);
  }
  console.log('PASS exam command lifecycle, permissions, retry, scored responses, proposals and undo');
} finally {await db.close();}
