// N48.2 receipt, version, owner, queue and undo regression in isolated PGlite.
// The N48.1 read-only snapshot assumptions are tracked separately as bug #1086.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const uid=()=>randomUUID();
// Surface the exact failing assertion in CI's compact first-error-line feedback.
const checkEqual=(actual,expected,why)=>{
  const where=new Error().stack?.split('\n')[2]||'';
  const line=where.match(/:(\d+):\d+\)?$/)?.[1]||'unknown';
  return assert.equal(actual,expected,why??('REVIEW_RUN_ASSERT_LINE_'+line));
};

const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const as=async(id,role='authenticated')=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role '+role);
};
const cmd=async(operation,patch={},target={},expectedVersion,operationId=uid())=>{
  const envelope={schemaVersion:1,resource:'review_runs',operationId,operation,
    target,patch,...(expectedVersion===undefined?{}:{expectedVersion})};
  return [(await q('select public.review_runs_command($1::jsonb) as receipt',
    [JSON.stringify(envelope)]))[0].receipt,envelope];
};
try {
  await db.exec([
    'create role anon; create role authenticated; create role service_role;',
    'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
    "create function auth.uid() returns uuid language sql as $a$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $a$;",
    "create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$ select decode(repeat('00',n),'hex') $b$;",
    'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
  ].join('\n'));
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
  assert.ok(files.includes('20261111020000_review_runs_command.sql'));
  for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
  await q('insert into auth.users(id) values($1),($2)',[owner,other]);
  // The isolated extensions.gen_random_bytes test stub returns zeros; assign
  // distinct valid owner secrets rather than triggering settings' unique key.
  for(const [id,secret] of [[owner,'a'.repeat(48)],[other,'b'.repeat(48)]])
    await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[id,secret]);
  async function seed(uidValue,slug){
    const subject=(await q("insert into public.subjects(user_id,name,glyph,hue) values($1,$2,'☆','amber') returning id",[uidValue,'R '+slug]))[0].id;
    const project=(await q("insert into public.projects(user_id,subject_id,slug,title,goal,status) values($1,$2,$3,$4,'Review','active') returning id",[uidValue,subject,slug,'R '+slug]))[0].id;
    const note=(await q("insert into public.notes(user_id,project_id,front,back) values($1,$2,'Q','A') returning id",[uidValue,project]))[0].id;
    return (await q('insert into public.cards(user_id,note_id,ord) values($1,$2,1) returning id,version',[uidValue,note]))[0];
  }
  const card=await seed(owner,'rr-a');
  const foreign=await seed(other,'rr-b');
  for(const table of ['review_runs','review_run_items']){
    checkEqual((await q('select relrowsecurity from pg_class where oid=($1)::regclass',['public.'+table]))[0].relrowsecurity,true);
    checkEqual((await q("select count(*)::int n from public.lemma_undo_tables where table_name=$1",[table]))[0].n,1);
  }
  checkEqual((await q("select command_fn,mcp_ok from public.lemma_command_resources where resource='review_runs'"))[0].command_fn,'review_runs_command');
  await as(owner);
  const startPatch={filters:{includeNew:true},selected_deck_ids:['project:rr-a'],card_budget:5,
    minute_budget:5,scheduler_version:'fsrs-5',settings_version:1};
  const [started,startEnvelope]=await cmd('start',startPatch);
  checkEqual(started.status,'ok');checkEqual(started.itemCount,1);
  checkEqual(started.run.status,'running');assert.ok(started.actionNo);
  const id=started.run.id;
  const entries=await q('select * from public.review_run_items where run_id=$1',[id]);
  checkEqual(entries.length,1);checkEqual(entries[0].card_id,card.id);
  checkEqual(entries[0].expected_card_version,card.version);
  const replay=(await q('select public.review_runs_command($1::jsonb) as receipt',
    [JSON.stringify(startEnvelope)]))[0].receipt;
  assert.deepEqual(replay,started,'exact retry returns same receipt');
  checkEqual((await q('select count(*)::int n from public.review_runs where id=$1',[id]))[0].n,1);
  const changed={...startEnvelope,patch:{...startPatch,card_budget:6}};
  const conflict=(await q('select public.review_runs_command($1::jsonb) receipt',[JSON.stringify(changed)]))[0].receipt;
  checkEqual(conflict.status,'conflict');
  const [wrongVersion]=await cmd('pause',{}, {id},started.run.version+1);
  checkEqual(wrongVersion.status,'conflict','stale version does not change a run');
  const [paused]=await cmd('pause',{}, {id},started.run.version);
  checkEqual(paused.run.status,'paused');assert.ok(paused.run.paused_at);
  const [resumed]=await cmd('resume',{}, {id},paused.run.version);
  checkEqual(resumed.run.status,'running');
  await assert.rejects(
    cmd('advance',{kind:'graded',item_id:entries[0].id,review_id:'1'}, {id},resumed.run.version),
    /new, committed owner review/);
  // Grade only through the existing card/review write path: the command links
  // its committed review receipt rather than repeating the schedule mutation.
  await db.exec('reset role');
  const receipt=(await q("insert into public.reviews(user_id,card_id,rating,state_before,duration_ms,prev) values($1,$2,3,0,1000,'{}'::jsonb) returning id",[owner,card.id]))[0].id;
  await q('update public.cards set reps=reps+1 where id=$1',[card.id]);
  await as(owner);
  const [advanced]=await cmd('advance',
    {kind:'graded',item_id:entries[0].id,review_id:String(receipt)}, {id},resumed.run.version);
  checkEqual(advanced.run.status,'exhausted');
  checkEqual(advanced.run.position,1);checkEqual(advanced.item.state,'graded');
  checkEqual(String(advanced.item.review_id),String(receipt));
  await assert.rejects(cmd('advance',{kind:'graded',item_id:entries[0].id,
    review_id:String(receipt)}, {id},advanced.run.version),/Run must be running/);
  // A stale card may be skipped, with the reason preserved. No schedule write
  // is generated by the review-run command during that transition.
  const [staleStarted]=await cmd('start',startPatch);
  checkEqual(staleStarted.itemCount,1);
  const staleItem=(await q('select id from public.review_run_items where run_id=$1',[staleStarted.run.id]))[0];
  await db.exec('reset role');
  await q('update public.cards set reps=reps+1 where id=$1',[card.id]);
  await as(owner);
  const [staleSkipped]=await cmd('advance',
    {kind:'stale',item_id:staleItem.id,reason:'Card version changed'},
    {id:staleStarted.run.id},staleStarted.run.version);
  checkEqual(staleSkipped.run.status,'exhausted');
  checkEqual(staleSkipped.item.state,'stale');
  checkEqual(staleSkipped.item.stale_reason,'Card version changed');
  checkEqual(staleSkipped.item.review_id,null);
  // Complete and abandon are distinct, versioned terminal transitions.
  const [toComplete]=await cmd('start',startPatch);
  checkEqual(toComplete.run.status,'running');
  const [completed]=await cmd('complete',{}, {id:toComplete.run.id},toComplete.run.version);
  checkEqual(completed.run.status,'completed');
  await assert.rejects(cmd('resume',{}, {id:toComplete.run.id},completed.run.version),
    /Invalid review-run transition/);
  const [toAbandon]=await cmd('start',startPatch);
  const [pauseForAbandon]=await cmd('pause',{}, {id:toAbandon.run.id},toAbandon.run.version);
  const [abandoned]=await cmd('abandon',{}, {id:toAbandon.run.id},pauseForAbandon.run.version);
  checkEqual(abandoned.run.status,'abandoned');
  checkEqual(abandoned.run.paused_at,null);
  assert.ok(abandoned.run.ended_at);
  // Invalid filters are never silently ignored by the authoritative selector.
  await assert.rejects(cmd('start',{...startPatch,filters:{unexpected:true}}),
    /Unsupported filter/);
  await assert.rejects(cmd('start',{...startPatch,selected_deck_ids:['project:rr-a','project:rr-a']}),
    /Invalid or duplicated deck IDs/);
  // No direct authenticated DML even after the command is installed.
  try {
    assert.deepEqual(await q('update public.review_runs set position=99 where id=$1 returning id',[id]),[]);
  } catch(e){assert.match(String(e),/permission denied|row.level security/i);}
  await as(other);
  assert.deepEqual(await q('select id from public.review_runs where id=$1',[id]),[]);
  await assert.rejects(cmd('pause',{}, {id},advanced.run.version),/not found/i);
  await db.exec('reset role');
  await db.exec('set role service_role');
  const p={schemaVersion:1,resource:'review_runs',operation:'start',operationId:uid(),
    patch:{...startPatch,selected_deck_ids:['project:rr-b']}};
  const mcp=(await q("select public.mcp_command($1,'chatgpt',$2::jsonb) receipt",[other,JSON.stringify(p)]))[0].receipt;
  checkEqual(mcp.status,'ok');checkEqual(mcp.run.source,'mcp');
  checkEqual(mcp.itemCount,1);assert.ok(mcp.actionNo);
  // PGlite's fixture service_role is deliberately *not* a production BYPASSRLS
  // role. Inspect the protected journal as the test harness, not as a client.
  await db.exec('reset role');
  const mcpActions=await q('select user_id,source from public.actions where no=$1',[mcp.actionNo]);
  checkEqual(mcpActions.length,1,'MCP command must produce one journal action');
  checkEqual(mcpActions[0].user_id,other,'journal action must belong to MCP owner');
  checkEqual(mcpActions[0].source,'chatgpt','journal must retain MCP provenance');
  await db.exec('set role service_role');
  const mcpReplay=(await q("select public.mcp_command($1,'chatgpt',$2::jsonb) receipt",[other,JSON.stringify(p)]))[0].receipt;
  assert.deepEqual(mcpReplay,mcp,'service-role retry replays the same receipt');
  await db.exec('reset role');
  checkEqual((await q('select count(*)::int n from public.action_changes where action_no=$1',[mcp.actionNo]))[0].n,2,
    'start should journal one run and one queue item, even after replay');
  // Undo MUST operate on both run rows and their snapshotted queue without
  // touching the other owner (and without calling card grading).
  await db.exec('set role service_role');
  const undone=(await q('select public.undo_action($1,$2,false) result',[other,mcp.actionNo]))[0].result;
  checkEqual(Number(undone.undone),Number(mcp.actionNo));
  await db.exec('reset role');
  checkEqual((await q('select count(*)::int n from public.review_runs where id=$1',[mcp.run.id]))[0].n,0);
  checkEqual((await q('select count(*)::int n from public.review_runs where id=$1',[id]))[0].n,1);
  checkEqual((await q('select count(*)::int n from public.review_run_items where run_id=$1',[mcp.run.id]))[0].n,0);
  checkEqual((await q('select count(*)::int n from public.reviews where id=$1',[receipt]))[0].n,1);
  console.log('PASS N48.2 review queue, lifecycle, retry, RLS, registry, MCP and undo');
} finally { await db.close(); }
