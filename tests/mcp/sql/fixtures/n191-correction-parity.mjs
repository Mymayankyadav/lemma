// Compare append-only candidate replay against the canonical N169/N181 writer.
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';

export async function checkCorrectionParity(db, {owner, project, operationId, as}) {
  const {replayEvidence} = await tsImport('../../../../src/lib/evidence/replay.ts', import.meta.url);
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const t = day => `2020-02-${day}T10:00:00Z`;
  const session = (await q(`insert into public.sessions(user_id,project_id,number,goal,style)
    values ($1,$2,1,'Correction fixture','socratic') returning id`, [owner, project]))[0].id;
  const original = (await q(`insert into public.session_events(user_id,session_id,kind,body,outcome,occurred_at)
    values ($1,$2,'attempt','Fixture','demonstrated',$3) returning id`, [owner, session, t(10)]))[0].id;
  await q(`insert into public.evidence(user_id,session_id,session_event_id,project_id,occurred_at,level,outcome,kind,origin)
    values ($1,$2,$3,$4,$5,'use','pass','attempt','tutor')`, [owner, session, original, project, t(10)]);

  const live = async () => (await q(`select session_event_id::text as event, outcome from public.evidence
    where user_id=$1 and session_id=$2 and voided_at is null order by id`, [owner, session]));
  const snapshots = [];
  const visible = async (cutoff = null, watermark = null) => {
    await as('authenticated', owner);
    const [row] = await q('select public.lemma_evidence_snapshot($1,$2,$3) as snapshot', [project, cutoff, watermark]);
    await as();
    const snap = row.snapshot;
    const active = replayEvidence(owner, snap.events, snap.asOf).active
      .filter(event => event.source === 'evidence' && event.payload.session_id === session);
    return {snap, outcomes: active.map(event => event.payload.outcome)};
  };
  const expectPersisted = async expected => {
    const {snap, outcomes} = await visible();
    assert.deepEqual(outcomes, expected);
    snapshots.push({snap, expected});
  };
  const entries = [];
  // Deterministic capture times for this parity test only, not inferred historical clocks.
  const capture = (outcome, revision, day) => {
    const base = {ownerId: owner, source: 'session_events', eventId: 'correction-fixture:' + revision,
      lineageId: String(original), revision, occurredAt: t(10), reportedAt: t(day), knownAt: t(day)};
    entries.push(outcome ? {...base, kind: 'record', payload: {outcome}} : {...base, kind: 'void'});
  };
  const actionsContainEvidence = async no => (await q(`select distinct table_name from public.action_changes
    where action_no=$1 order by table_name`, [no])).some(row => row.table_name === 'evidence');
  const command = async (operation, id, patch, n) => {
    await as('authenticated', owner);
    const envelope = {operationId: operationId(n), schemaVersion: 1, resource: 'session_event_corrections',
      operation, target: {id: String(id)}, patch};
    const [first] = await q('select public.correct_session_event($1::jsonb) as value', [JSON.stringify(envelope)]);
    const [retry] = await q('select public.correct_session_event($1::jsonb) as value', [JSON.stringify(envelope)]);
    assert.equal(first.value.status, 'ok');
    assert.deepEqual(retry.value, first.value);
    await as();
    assert.ok(await actionsContainEvidence(first.value.actionNo));
    return first.value;
  };
  const undo = async no => {
    await as('authenticated', owner);
    await q('select public.undo_action($1,$2,false)', [owner, no]);
    await as();
  };

  assert.deepEqual(await live(), [{event: String(original), outcome: 'pass'}]);
  await expectPersisted(['pass']);
  capture('pass', 1, 11);
  const corrected = await command('correct', original, {reason: 'Incorrect grade', outcome: 'failed'}, 21);
  assert.deepEqual(await live(), [{event: String(corrected.revisedEventId), outcome: 'fail'}]);
  await expectPersisted(['fail']);
  capture('fail', 2, 12);
  const removed = await command('void', corrected.revisedEventId, {reason: 'Discard this attempt'}, 22);
  assert.deepEqual(await live(), []);
  await expectPersisted([]);
  capture(null, 3, 13);
  await undo(removed.actionNo);
  assert.deepEqual(await live(), [{event: String(corrected.revisedEventId), outcome: 'fail'}]);
  await expectPersisted(['fail']);
  capture('fail', 4, 14);
  assert.deepEqual([11, 12, 13, 14].map(day =>
    replayEvidence(owner, entries, t(day)).active.map(event => event.payload.outcome)),
  [['pass'], ['fail'], [], ['fail']]);

  // Use a separate event for correction undo; the previous branch already
  // has a later inverse action touching the same rows.
  const standalone = (await q(`insert into public.session_events(user_id,session_id,kind,body,outcome,occurred_at)
    values ($1,$2,'attempt','Standalone','demonstrated',$3) returning id`, [owner, session, t(10)]))[0].id;
  await q(`insert into public.evidence(user_id,session_id,session_event_id,project_id,occurred_at,level,outcome,kind,origin)
    values ($1,$2,$3,$4,$5,'use','pass','attempt','tutor')`, [owner, session, standalone, project, t(10)]);
  const standaloneFix = await command('correct', standalone, {reason: 'Incorrect grade', outcome: 'partial'}, 23);
  assert.deepEqual((await live()).find(row => row.event === String(standaloneFix.revisedEventId)),
    {event: String(standaloneFix.revisedEventId), outcome: 'partial'});
  await undo(standaloneFix.actionNo);
  assert.deepEqual((await live()).find(row => row.event === String(standalone)),
    {event: String(standalone), outcome: 'pass'});
  assert.equal((await q('select count(*)::int n from public.evidence where session_id=$1 and session_event_id=$2',
    [session, standaloneFix.revisedEventId]))[0].n, 0, 'legacy undo removes the corrected evidence row');
  for (const {snap, expected} of snapshots) {
    const historical = await visible(snap.asOf, snap.watermark);
    assert.deepEqual(historical.outcomes, expected);
    assert.deepEqual(historical.snap.events, snap.events);
  }
  console.log('N191 canonical correct/void/undo RPC and persisted historical snapshots agree');
}
