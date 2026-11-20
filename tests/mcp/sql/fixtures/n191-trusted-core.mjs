import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {tsImport} from 'tsx/esm/api';

export async function checkTrustedCore(db, {owner, other, project, as, operationId}) {
  const {normalizeFixedOccurrences} = await tsImport('../../../../src/lib/calendar/fixedOccurrences.ts', import.meta.url);
  const q = async (sql, values = []) => (await db.query(sql, values)).rows;
  const scalar = async (sql, values = []) => (await q(sql, values))[0].result;
  const snapshot = (args = {}) => scalar('select public.lemma_planning_snapshot_mcp($1,$2,$3) result',
    [owner, 'calendar', JSON.stringify(args)]);
  const evidence = () => scalar('select public.lemma_planning_snapshot_mcp($1,$2,$3) result',
    [owner, 'evidence', JSON.stringify({p_project_id: project})]);
  const failCode = code => error => error.code === code;
  await as();
  assert.equal(await scalar(`select has_function_privilege(p.proowner,'public.lemma_session_progress_command(jsonb)','EXECUTE') result
    from pg_proc p where p.oid='public.mcp_command(uuid,text,jsonb)'::regprocedure`),true);
  const registry = (await q("select table_name from public.lemma_undo_tables")).map(row => row.table_name);
  for (const table of ['evidence_revisions','calendar_input_history','calendar_occurrence_changes']) {
    assert.ok(registry.includes(table));
  }
  for (const table of ['evidence_revisions','calendar_input_history']) {
    for (const role of ['anon','authenticated']) {
      assert.equal(await scalar('select has_table_privilege($1,$2,$3) result',
        [role,'public.'+table,'INSERT, UPDATE, DELETE, TRUNCATE']),false);
    }
  }
  // The canonical normalizer and PG resolver independently agree on gaps,
  // both folds, an overnight occurrence and a moved original across a cutoff.
  const series = {seriesId:'fold-check', zone:'America/New_York', firstDate:'2026-11-01', lastDate:'2026-11-01',
    weekdays:[0], start:{time:'01:15',fold:0}, end:{time:'01:45',fold:1}};
  const block = {kind:'busy',time_zone:series.zone,weekly_rule:series,version:1,buffer_before_minutes:0,buffer_after_minutes:0};
  const resolve = (b,c,lo,hi) => scalar('select public.lemma_calendar_occurrences($1,$2,$3,$4,$5) result',
    ['fold-check',JSON.stringify(b),JSON.stringify(c),lo,hi]);
  const match = async (rule,changes,lo,hi) => {
    const actual = await resolve({...block,time_zone:rule.zone,weekly_rule:rule}, changes.map(x => ({
      series_id:x.seriesId,original_zone:x.zone,original_date:x.originalDate,revision:x.revision,kind:x.kind,
      starts_local:x.start && x.start.date+'T'+x.start.time,ends_local:x.end && x.end.date+'T'+x.end.time,
      start_fold:x.start?.fold,end_fold:x.end?.fold,
    })),lo,hi);
    const expected=normalizeFixedOccurrences([rule],changes);
    if (expected.status==='blocked') return assert.equal(actual,null);
    const intervals = expected.occurrences.filter(x => Date.parse(x.startsAt)<Date.parse(hi) && Date.parse(x.endsAt)>Date.parse(lo));
    assert.deepEqual(actual.map(x => [x.originalDate,x.revision,Date.parse(x.startsAt),Date.parse(x.endsAt)]),
      intervals.map(x => [x.originalDate,x.revision,Date.parse(x.startsAt),Date.parse(x.endsAt)]));
  };
  await match(series,[],'2026-11-01','2026-11-02');
  await match({...series,start:{time:'01:15'}},[],'2026-11-01','2026-11-02');
  await match({...series,firstDate:'2026-03-08',lastDate:'2026-03-08',start:{time:'02:15'}},[],'2026-03-08','2026-03-09');
  await match({...series,start:{time:'23:30'},end:{time:'00:30'}},[],'2026-11-02','2026-11-03');
  const moved = {seriesId:series.seriesId,zone:series.zone,originalDate:'2026-11-01',revision:2,kind:'move',
    start:{date:'2026-12-01',time:'12:00'},end:{date:'2026-12-01',time:'13:00'}};
  await match(series,[moved,moved],'2026-12-01','2026-12-02');
  await match(series,[moved,{...moved,kind:'cancel'}],'2026-12-01','2026-12-02');
  await match(series,[moved,{...moved,kind:'cancel',revision:3}],'2026-12-01','2026-12-02');
  await match({...series,zone:'UTC',firstDate:'2026-11-02',lastDate:'2026-11-03',weekdays:[1,2]},
    [{...moved,zone:'UTC',originalDate:'2026-11-02',start:{date:'2026-11-04',time:'12:00'},end:{date:'2026-11-04',time:'13:00'}}],
    '2026-11-02','2026-11-05');

  const anchors = (await q("select (now()+interval '2 hours')::text as lo,(now()+interval '3 hours')::text as hi,(now()+interval '1 day')::text as horizon"))[0];
  await as('service_role');
  const unknown = await snapshot({p_horizon_end:anchors.horizon});
  assert.equal(unknown.status,'ok'); assert.equal(unknown.availability,null);
  await as();
  await q("update public.settings set capacity=$2,time_zone='UTC' where user_id=$1",[owner,JSON.stringify({weekday_minutes:0})]);
  await as('service_role');
  const zero = await snapshot({p_horizon_end:anchors.horizon});
  assert.deepEqual(zero.availability,[]);
  assert.deepEqual(await snapshot({p_horizon_end:anchors.horizon,p_as_of:unknown.asOf,p_watermark:unknown.watermark}),unknown);
  await as();
  await q("update public.settings set capacity=$2 where user_id=$1",[owner,JSON.stringify({weekday_minutes:60})]);
  const insertBlock = (user,kind,pid) => scalar(`insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone,project_id,buffer_before_minutes)
    values ($1,$2,'Private title',$3,$4,'UTC',$5,7) returning id as result`,[user,kind,anchors.lo,anchors.hi,pid]);
  const fixedId = await insertBlock(owner,'busy',null);
  const studyId = await insertBlock(owner,'study',project);
  await insertBlock(other,'busy',null);
  await as('authenticated',owner);
  const current = await scalar('select public.lemma_calendar_snapshot($1) result',[anchors.horizon]);
  assert.deepEqual(current.fixed.map(x=>[x.id,x.bufferBeforeMinutes]),[[fixedId,7]]);
  assert.deepEqual(current.availability.map(x=>[x.id,x.projectId]),[[studyId,project]]);
  assert.equal(JSON.stringify(current).includes('Private title'),false);
  await assert.rejects(snapshot({p_horizon_end:anchors.horizon}),failCode('42501'));
  // A dated exception is appended by the signed owner. The stored source
  // drives the same read, even when the original occurred years ago.
  const originalDate='2020-01-05';
  const durableRule={firstDate:originalDate,lastDate:originalDate,weekdays:[0],start:{time:'10:00'},end:{time:'11:00'}};
  const recurring=await scalar(`insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone,weekly_rule)
    values ($1,'busy','Weekly fixture',$2,$3,'UTC',$4) returning id result`,[owner,anchors.lo,anchors.hi,JSON.stringify(durableRule)]);
  const exceptionSql=`insert into public.calendar_occurrence_changes(user_id,series_id,original_date,original_zone,revision,kind,starts_local,ends_local)
    values ($1,$2,$3,$4,1,'move',date_trunc('minute',$5::timestamptz at time zone 'UTC'),date_trunc('minute',$6::timestamptz at time zone 'UTC')) returning id`;
  await q(exceptionSql,[owner,recurring,originalDate,'UTC',anchors.lo,anchors.hi]);
  await assert.rejects(q(exceptionSql,[owner,recurring,originalDate,'Europe/London',anchors.lo,anchors.hi]),failCode('22023'));
  const movedSnapshot=await scalar('select public.lemma_calendar_snapshot($1) result',[anchors.horizon]);
  const savedException=movedSnapshot.fixed.find(x=>x.seriesId===recurring);
  assert.equal(savedException.originalDate,originalDate); assert.equal(savedException.revision,1);
  // Independent block IDs have the opposite order from their actual starts.
  await q(`insert into public.calendar_blocks(id,user_id,kind,title,starts_at,ends_at,time_zone) values
    ($1,$3,'busy','Earlier',$4::timestamptz-interval '1 hour',$4,'UTC'),
    ($2,$3,'busy','Later',$5,$5::timestamptz+interval '1 hour','UTC')`,
    [operationId(301),operationId(300),owner,anchors.lo,anchors.hi]);
  const ordered=await scalar('select public.lemma_calendar_snapshot($1) result',[anchors.horizon]);
  assert.deepEqual(ordered.fixed.filter(x=>x.id===operationId(300)||x.id===operationId(301)).map(x=>x.id),
    [operationId(301),operationId(300)]);

  await as('authenticated',other);
  assert.equal((await scalar('select public.lemma_calendar_snapshot($1) result',[anchors.horizon])).fixed.length,1);
  await assert.rejects(scalar('select public.lemma_evidence_snapshot($1) result',[project]),failCode('42501'));
  await as('anon');
  await assert.rejects(scalar('select public.lemma_evidence_snapshot() result'),failCode('42501'));
  await as('service_role');
  await assert.rejects(scalar('select public.lemma_planning_snapshot_mcp($1,$2,$3) result',
    [other,'evidence',JSON.stringify({p_project_id:project})]),failCode('42501'));
  assert.ok((await evidence()).events.length>0);
  await assert.rejects(snapshot({p_horizon_end:unknown.asOf,p_as_of:unknown.asOf}),failCode('22023'));

  await as();
  const session = await scalar(`insert into public.sessions(user_id,project_id,number,goal,style)
    values ($1,$2,88,'Ingress fixture','socratic') returning id result`,[owner,project]);
  const subject = await scalar("insert into public.subjects(user_id,name,glyph,hue) values($1,'Study','M','cyan') returning id result",[owner]);
  const concept = await scalar("insert into public.concepts(user_id,subject_id,slug,name) values($1,$2,'limits','Limits') returning id result",[owner,subject]);
  await q('update public.projects set subject_id=$2 where id=$1',[project,subject]);
  await q('update public.settings set atlas_migrated_at=now() where user_id=$1',[owner]);
  await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select false'");
  const request = {schemaVersion:1,operationId:operationId(91),resource:'session_progress',operation:'save',
    target:{id:session},expectedVersion:1,patch:{events:[{kind:'explanation',text:'Private proof text',outcome:'demonstrated',concept}]}};
  // The broad connector passes its authenticated owner; raw text enters only
  // the existing canonical journal/storage and is absent from the saved receipt.
  const call = (payload,user=owner) => scalar("select public.mcp_command($1,'chatgpt',$2) result",[user,JSON.stringify(payload)]);
  await as('service_role');
  await assert.rejects(call(request,other),failCode('42501'));
  await assert.rejects(call(request),failCode('55000'));
  await as('authenticated',owner);
  await assert.rejects(scalar('select public.lemma_session_progress_command($1) result',[JSON.stringify(request)]),failCode('42501'));
  await as();
  // This disposable test database represents the final owner-controlled
  // privilege/launch states. No deployed schema or live grant is changed.
  if (!await scalar("select exists(select 1 from pg_attribute where attrelid='public.command_receipts'::regclass and attname='trusted_writer_version' and not attisdropped) result")) {
    await db.exec(`revoke insert,update,delete,truncate on public.command_receipts from public,anon,authenticated;
      alter table public.command_receipts add column trusted_writer_version smallint;`);
  }
  await as('service_role');
  await assert.rejects(call(request),failCode('55000'));
  await as();
  await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable security invoker set search_path='' as 'select true'");
  // Permission drift after installation closes admission before a write or
  // replay. SET-only memberships are invisible to the role's inherited ACL.
  const alternate='n191_receipt_rights_'+randomUUID().replaceAll('-','');
  for (const setup of [
    'grant trigger on public.command_receipts to authenticated',
    `create role ${alternate}; grant insert(result) on public.command_receipts to ${alternate};
     grant ${alternate} to authenticated with inherit false, set true`,
  ]) {
    await db.exec('begin');
    try {
      await db.exec(setup); await as('service_role');
      await assert.rejects(call(request),failCode('55000'));
    } finally { await db.exec('rollback'); await as(); }
  }
  await as('service_role');
  const first = await call(request);
  assert.equal(first.status,'ok'); assert.equal(first.version,2); assert.equal(first.events,1); assert.ok(first.actionNo>0);
  assert.deepEqual(await call(request),first);
  assert.equal((await call({...request,operationId:operationId(1)})).status,'conflict','unverified legacy receipt cannot admit a new command');
  const legacyReuse={schemaVersion:1,operationId:request.operationId,resource:'calendar_blocks',operation:'create',patch:{
    title:'Collision',kind:'busy',startsAt:anchors.lo,endsAt:anchors.hi,timeZone:'UTC'}};
  const legacyResult=await scalar("select public.mcp_study_command($1,'chatgpt',$2) result",[owner,JSON.stringify(legacyReuse)]);
  assert.equal(legacyResult.status,'conflict'); assert.equal('_request_sha256' in legacyResult,false);
  await assert.rejects(call({...request,operationId:operationId(95),expectedVersion:2,patch:{
    events:[{kind:'explanation',text:'Not a linked concept',concept:other}]}}),/Unknown instruction concept/);

  const nativeFacts=(await evidence()).events.filter(e=>e.kind==='record'&&e.source!=='evidence');
  assert.deepEqual(nativeFacts.map(e=>e.source).sort(),['attempt_tags','attempts','instruction_events']);
  assert.equal(new Set(nativeFacts.map(e=>e.knownAt)).size,1);
  assert.equal((await call({...request,patch:{events:[]}})).status,'conflict');
  assert.equal((await call({...request,operationId:operationId(92)})).status,'conflict');
  await assert.rejects(call(request,other),failCode('42501'));
  await as();
  const stored=await scalar('select result from public.command_receipts where user_id=$1 and operation_id=$2',[owner,request.operationId]);
  assert.ok(stored._request_sha256); assert.equal(stored._request,null); assert.equal(JSON.stringify(stored).includes('Private proof'),false);
  assert.equal(await scalar('select count(*)::int result from public.session_events where session_id=$1',[session]),1);
  assert.equal(await scalar('select count(*)::int result from public.command_receipts where user_id=$1 and operation_id=$2',[owner,operationId(92)]),0);
  assert.equal(await scalar("select public.lemma_receipt_canonical($1)::text=public.lemma_receipt_canonical($2)::text result",
    ['{"n":[1.000,2],"b":0.10}','{"b":0.1,"n":[1,2.0]}']),true);

  // A true rollback undoes the evidence, session version, journal AND receipt.
  const next={...request,operationId:operationId(93),expectedVersion:2};
  await db.exec('begin');
  try {
    await as('service_role'); assert.equal((await call(next)).status,'ok');
  } finally { await db.exec('rollback'); await as(); }
  assert.equal(await scalar('select progress_version result from public.sessions where id=$1',[session]),2);
  assert.equal(await scalar('select count(*)::int result from public.command_receipts where user_id=$1 and operation_id=$2',[owner,next.operationId]),0);
  if (db.native) {
    // An open writer's server clock already precedes this read. Its rows
    // remain absent even after commit when the earlier MVCC token is replayed.
    const visible = Promise.withResolvers(), allowCommit = Promise.withResolvers();
    const pendingFact = db.transaction(async c => {
      const row = await c.query(`insert into public.instruction_events(user_id,session_id,concept_id,occurred_at)
        values ($1,$2,$3,'2020-02-01') returning id::text id`,[owner,session,concept]);
      visible.resolve(); await allowCommit.promise; return row.rows[0].id;
    });
    await Promise.race([visible.promise,pendingFact]);
    await as('service_role');
    let old;
    try { old = await evidence(); } finally { allowCommit.resolve(); }
    const lateId=await pendingFact;
    const replay = await scalar("select public.lemma_planning_snapshot_mcp($1,'evidence',$2) result",[owner,
      JSON.stringify({p_project_id:project,p_as_of:old.asOf,p_watermark:old.watermark})]);
    assert.deepEqual(replay.events,old.events);
    assert.ok(!(old.events.some(x=>x.source==='instruction_events' && x.lineageId===lateId)));
    assert.ok((await evidence()).events.some(x=>x.source==='instruction_events' && x.lineageId===lateId));
    await as();
    // Hold the first actual command before commit. The identical second request
    // travels on another backend and demonstrably waits on the shared UUID lock.
    const {promise:firstDone,resolve:release} = Promise.withResolvers();
    const {promise:written,resolve:markWritten} = Promise.withResolvers();
    const {promise:pidReady,resolve:markPid} = Promise.withResolvers();
    const runCall=async c => (await c.query("select public.mcp_command($1,'chatgpt',$2) result",[owner,JSON.stringify(next)])).rows[0].result;
    const worker1=db.transaction(async c=>{
      await c.query('set local role service_role');
      const result=await runCall(c); markWritten(); await firstDone; return result;
    });
    await Promise.race([written,worker1]);
    const worker2=db.transaction(async c=>{
      await c.query('set local role service_role');
      markPid((await c.query('select pg_backend_pid() pid')).rows[0].pid); return runCall(c);
    });
    try { await db.waitForBlockedLock(await Promise.race([pidReady,worker2])); } finally { release(); }
    const [a,b]=await Promise.all([worker1,worker2]);
    assert.deepEqual(a,b); assert.equal(a.status,'ok');
    assert.equal(await scalar('select count(*)::int result from public.session_events where session_id=$1',[session]),2);
  }
  await as('service_role');
  // Session deletion clears the canonical instruction's link. Its previous
  // project must lose the fact while the owner still retains the instruction.
  const {replayEvidence} = await tsImport('../../../../src/lib/evidence/replay.ts', import.meta.url);
  await as();
  const detachedSession = await scalar(`insert into public.sessions(user_id,project_id,number,goal,style)
    values ($1,$2,89,'Detached instruction','socratic') returning id result`,[owner,project]);
  await as('service_role');
  const accepted = await call({...request,operationId:operationId(96),target:{id:detachedSession}});
  assert.equal(accepted.status,'ok');
  await as();
  const instruction = await scalar('select id::text result from public.instruction_events where user_id=$1 and session_id=$2',
    [owner,detachedSession]);
  const [originalAttempt]=await q('select id::text,session_event_id::text from public.attempts where user_id=$1 and session_id=$2',
    [owner,detachedSession]);
  await assert.rejects(q('insert into public.attempts(user_id,session_event_id) values ($1,$2)',
    [other,originalAttempt.session_event_id]),failCode('23503'));
  await as('service_role');
  const readScope = (user, args) => scalar("select public.lemma_planning_snapshot_mcp($1,'evidence',$2) result",
    [user,JSON.stringify(args)]);
  const activeInstruction = (user,snap) => replayEvidence(user,snap.events,snap.asOf).active
    .filter(e=>e.source==='instruction_events'&&e.lineageId===instruction);
  const scopedBefore = await readScope(owner,{p_project_id:project});
  assert.deepEqual(activeInstruction(owner,scopedBefore).map(e=>e.payload.session_id),[detachedSession]);
  await as();
  await q('delete from public.sessions where id=$1 and user_id=$2',[detachedSession,owner]);
  assert.equal(await scalar('select session_id result from public.instruction_events where id=$1 and user_id=$2',[instruction,owner]),null);
  assert.deepEqual((await q('select id::text,session_id,session_event_id::text from public.attempts where user_id=$1 and id=$2',
    [owner,originalAttempt.id]))[0],{...originalAttempt,session_id:null});
  await assert.rejects(q('insert into public.attempts(user_id,project_id,session_event_id) values ($1,$2,$3)',
    [owner,project,originalAttempt.session_event_id]),failCode('23503'));
  await as('service_role');
  const scopedAfter = await readScope(owner,{p_project_id:project});
  assert.deepEqual(activeInstruction(owner,scopedAfter),[]);
  const allAfter = await readScope(owner,{});
  assert.deepEqual(activeInstruction(owner,allAfter).map(e=>e.payload.session_id),[null]);
  const changes=allAfter.events.filter(e=>e.source==='instruction_events'&&e.lineageId===instruction);
  assert.deepEqual(changes.map(e=>[e.revision,e.kind]),[[1,'record'],[2,'void'],[3,'record']]);
  assert.equal(changes[1].knownAt,changes[2].knownAt);
  const historical = await readScope(owner,{p_project_id:project,p_as_of:scopedBefore.asOf,p_watermark:scopedBefore.watermark});
  assert.deepEqual(historical.events,scopedBefore.events);
  assert.deepEqual(activeInstruction(other,await readScope(other,{})),[]);
  await assert.rejects(readScope(other,{p_project_id:project}),failCode('42501'));
  const seeded = await scalar("select public.lemma_seed_evidence_page($1,'attempts',0,1) result",[owner]);
  assert.equal(seeded.captured,0); assert.ok(seeded.cursor);
  const full = await evidence();
  const page1 = await scalar("select public.lemma_planning_snapshot_mcp($1,'evidence',$2) result",
    [owner,JSON.stringify({p_project_id:project,p_as_of:full.asOf,p_watermark:full.watermark,p_limit:1})]);
  const page2 = await scalar("select public.lemma_planning_snapshot_mcp($1,'evidence',$2) result",
    [owner,JSON.stringify({p_project_id:project,p_as_of:page1.asOf,p_watermark:page1.watermark,p_after:page1.nextAfter,p_limit:1})]);
  assert.deepEqual([...page1.events,...page2.events],full.events.slice(0,2));
  await as('authenticated',owner);
  const exported = await scalar('select public.begin_owner_export() result');
  const page = await scalar("select public.owner_export_page($1,'evidence_revisions',0,100) result",[exported]);
  assert.ok(page.rows.length>0); assert.ok(page.rows.every(row=>row.user_id===owner));
  await q("select public.end_owner_export($1)",[exported]);
  await as('service_role');
  assert.equal(await scalar('select public.lemma_evidence_purge_active($1) result',[owner]),false);
  await q('select public.lemma_begin_account_delete($1)',[owner]);
  assert.equal(await scalar('select public.lemma_evidence_purge_active($1) result',[owner]),false);
  await q('select public.lemma_purge_account_rows($1)',[owner]);
  await as();
  assert.equal(await scalar('select count(*)::int result from public.evidence_revisions where user_id=$1',[owner]),0);
  assert.equal(await scalar('select count(*)::int result from public.calendar_input_history where user_id=$1',[owner]),0);
  assert.ok(await scalar('select count(*)::int result from public.calendar_input_history where user_id=$1',[other])>0);
  console.log('N191 trusted owner/service ingress, calendar parity, MVCC reads, role boundaries, receipts and rollback passed');
}
