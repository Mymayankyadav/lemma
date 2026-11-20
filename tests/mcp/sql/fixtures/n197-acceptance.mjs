// Acceptance of the real receipt cutover, including historical public entry
// points. Native races use independently connected backends and an observed
// lock wait; the in-memory adapter never claims concurrency evidence.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const names = ['task_command', 'presets_command', 'notify_command', 'edit_note_atomic',
  'study_command_lifecycle', 'study_command_correction', 'lemma_study_timer_command',
  'calendar_occurrence_changes_command'];
const request = (resource, operation, patch, extra = {}) => ({
  schemaVersion: 1, operationId: randomUUID(), resource, operation, patch, ...extra,
});
const publicResult = value => {
  assert.ok(value && typeof value === 'object');
  assert.equal(Object.hasOwn(value, '_request'), false, 'command must not disclose its stored request');
  assert.equal(Object.hasOwn(value, '_request_sha256'), false, 'command must not disclose its fingerprint');
  return value;
};

export async function checkN197Acceptance(db, {owner, other, as, legacyOperationId, trustedOperationId}) {
  const q = async (sql, values = []) => (await db.query(sql, values)).rows;
  const scalar = async (sql, values = []) => (await q(sql, values))[0].result;
  const call = async (sql, values = []) => publicResult(await scalar(sql, values));
  const stored = op => scalar('select result from public.command_receipts where user_id=$1 and operation_id=$2', [owner, op]);
  const actionCount = () => scalar('select count(*)::int result from public.actions where user_id=$1', [owner]);
  const undo = no => scalar('select public.undo_action($1,$2,false) result', [owner, no]);
  const app = input => call('select public.study_command($1::jsonb) result', [JSON.stringify(input)]);
  const occurrence = input => call('select public.calendar_occurrence_changes_command($1::jsonb) result', [JSON.stringify(input)]);

  const makeSeries = async () => {
    const id = randomUUID();
    const created = await app(request('calendar_blocks', 'create', {
      kind: 'busy', title: 'N197 recurrence fixture', time_zone: 'UTC',
      starts_at: '2026-01-05T09:00:00Z', ends_at: '2026-01-05T10:00:00Z',
      weekly_rule: {firstDate: '2026-01-05', lastDate: '2026-01-05', weekdays: [1],
        start: {time: '09:00'}, end: {time: '10:00'}},
    }, {target: {id}}));
    assert.equal(created.status, 'ok');
    return id;
  };
  const changeRequest = (series, extra = {}) => request('calendar_occurrence_changes', 'create', {
    series_id: series, original_date: '2026-01-05', original_zone: 'UTC', revision: 1,
    kind: 'move', starts_local: '2026-01-05T11:00', ends_local: '2026-01-05T12:00',
  }, {expectedVersion: 0, ...extra});

  // Each scenario uses the public signature being protected, not a hand-written
  // substitute. Its read projection records the actual domain effect and undo.
  const scenario = async name => {
    await as('authenticated', owner);
    const id = randomUUID();
    let input, sql, values, read;
    if (name === 'task_command') {
      input = request('tasks', 'create', {title: 'N197 ' + id}, {target: {id}});
      read = () => q('select id,title,version from public.tasks where user_id=$1 and id=$2', [owner, id]);
    } else if (name === 'presets_command') {
      input = request('presets', 'create', {label: 'N197 ' + id}, {target: {id}});
      read = () => q('select id,label,version from public.presets where user_id=$1 and id=$2', [owner, id]);
    } else if (name === 'notify_command') {
      input = request('notify_holds', 'create', {scope: 'n197-' + id, until: '2028-01-01T00:00:00Z'});
      read = () => q('select scope,"until",version from public.notify_holds where user_id=$1 and scope=$2', [owner, input.patch.scope]);
    } else if (name === 'edit_note_atomic') {
      const project = await scalar('select id result from public.projects where user_id=$1 order by id limit 1', [owner]);
      await q("insert into public.notes(id,user_id,project_id,front,back) values($1,$2,$3,'Before N197','Answer')", [id, owner, project]);
      input = {operationId: randomUUID()};
      sql = 'select public.edit_note_atomic($1::uuid,1,$2::jsonb,$3::uuid) result';
      values = [id, JSON.stringify({front: 'After N197'}), input.operationId];
      read = () => q('select id,front,back from public.notes where user_id=$1 and id=$2', [owner, id]);
    } else if (name === 'study_command_lifecycle') {
      input = request('study_entries', 'create', {source: 'timer', intent: 'N197 lifecycle'}, {target: {id}});
      read = () => q('select id,intent,status from public.study_entries where user_id=$1 and id=$2', [owner, id]);
    } else if (name === 'study_command_correction') {
      input = request('study_entries', 'create_manual', {intent: 'N197 saved study', intervals: [
        {kind: 'focus', started_at: '2026-01-05T09:00:00Z', ended_at: '2026-01-05T09:05:00Z'},
      ]}, {target: {id}});
      read = () => q(`select e.id,e.intent,e.status,
        (select count(*)::int from public.study_intervals i where i.entry_id=e.id and i.user_id=$1) intervals
        from public.study_entries e where e.user_id=$1 and e.id=$2`, [owner, id]);
    } else if (name === 'lemma_study_timer_command') {
      const draft = await app(request('study_entries', 'create', {source: 'timer', intent: 'N197 lease'}, {target: {id}}));
      assert.equal(draft.status, 'ok');
      input = request('study_entries', 'take_lease', {device: 'n197-' + id}, {target: {id}, expectedVersion: 1});
      read = () => q('select id,lease_device,lease_version,lease_expires_at,version from public.study_entries where user_id=$1 and id=$2', [owner, id]);
    } else if (name === 'calendar_occurrence_changes_command') {
      const series = await makeSeries();
      input = changeRequest(series, {target: {id}});
      read = () => q('select id,series_id,revision,kind,starts_local,ends_local from public.calendar_occurrence_changes where user_id=$1 and series_id=$2', [owner, series]);
    } else throw Error('Unknown N197 writer ' + name);
    if (!sql) {
      const helper = ['study_command_lifecycle', 'study_command_correction', 'lemma_study_timer_command'].includes(name);
      sql = `select public.${name}($1::jsonb${helper ? ',$2::uuid,$3::uuid' : ''}) result`;
      values = helper ? [JSON.stringify(input), owner, input.operationId] : [JSON.stringify(input)];
    }
    return {name, input, sql, values, read};
  };

  for (const name of names) {
    const test = await scenario(name);
    const before = await test.read();
    const first = await call(test.sql, test.values);
    assert.equal(first.status, 'ok', name + ' normal write');
    const changed = await test.read();
    assert.notDeepEqual(changed, before, name + ' changes domain state');
    const receipt = await stored(test.input.operationId);
    const actions = await actionCount();
    assert.deepEqual(await call(test.sql, test.values), first, name + ' exact retry');
    assert.equal(await actionCount(), actions, name + ' retry creates no journal');
    assert.deepEqual(await test.read(), changed, name + ' retry does not repeat domain writes');
    // The direct lifecycle helper preserves null actionNo, while the dispatcher
    // stores its real audit action in the immutable receipt.
    const actionNo = first.actionNo ?? receipt.actionNo;
    assert.ok(Number(actionNo) > 0, name + ' has an undoable action');
    await undo(actionNo);
    assert.deepEqual(await test.read(), before, name + ' domain undo remains available');
    assert.deepEqual(await stored(test.input.operationId), receipt, name + ' undo preserves receipt history');
    assert.deepEqual(await call(test.sql, test.values), first, name + ' retry after undo returns original acknowledgement');
    assert.deepEqual(await test.read(), before, name + ' retry after undo does not recreate effect');
    await as('anon');
    await assert.rejects(call(test.sql, test.values), name + ' refuses anonymous caller');
  }
  console.log('PASS N197 all eight public writers: normal write, retry, undo, historical acknowledgement and anon denial');

  // Real service dispatch uses the registered command rather than pretending
  // that a browser-controlled lemma.source setting authenticates a connector.
  for (const name of names.filter(value => value !== 'edit_note_atomic')) {
    const test = await scenario(name);
    await as('service_role');
    const invoke = () => call('select public.mcp_command($1,$2,$3::jsonb) result', [owner, 'claude', JSON.stringify(test.input)]);
    const first = await invoke();
    assert.equal(first.status, 'ok', name + ' service writer');
    assert.deepEqual(await invoke(), first, name + ' service replay');
    await as('authenticated', owner);
    assert.equal(await scalar('select source result from public.actions where no=$1', [first.actionNo]), 'claude', name + ' service provenance');
  }
  console.log('PASS N197 registered service dispatch and connector provenance for every service-supported writer');

  await as('authenticated', owner);
  const series = await makeSeries();
  const move = changeRequest(series);
  const moved = await occurrence(move);
  assert.equal(moved.status, 'ok');
  const history = () => q('select id,revision,kind,starts_local,ends_local from public.calendar_occurrence_changes where user_id=$1 and series_id=$2 order by revision,id', [owner, series]);
  const firstHistory = await history();
  assert.deepEqual(await occurrence(move), moved);
  assert.equal((await occurrence({...move, patch: {...move.patch, starts_local: '2026-01-05T11:15'}})).status, 'conflict');
  assert.equal((await occurrence({...move, operationId: randomUUID()})).status, 'conflict');
  assert.deepEqual(await history(), firstHistory, 'calendar retry and stale revision have no extra effect');
  await as('authenticated', other);
  await assert.rejects(occurrence({...move, operationId: randomUUID()}), /not found/i);
  assert.deepEqual(await history(), [], 'calendar history is owner scoped');
  await as('service_role');
  await assert.rejects(call('select public.mcp_command($1,$2,$3::jsonb) result', [other, 'chatgpt', JSON.stringify({...move, operationId: randomUUID()})]), /not found/i);
  await as('authenticated', owner);
  const cancel = request('calendar_occurrence_changes', 'create', {
    series_id: series, original_date: '2026-01-05', original_zone: 'UTC', revision: 2, kind: 'cancel',
  }, {expectedVersion: 1});
  const cancelled = await occurrence(cancel);
  assert.equal(cancelled.status, 'ok');
  assert.equal((await history()).length, 2);
  await undo(cancelled.actionNo);
  assert.deepEqual(await history(), firstHistory);
  assert.deepEqual(await occurrence(cancel), cancelled);
  assert.deepEqual(await history(), firstHistory, 'undone cancellation is not recreated by receipt replay');
  await undo(moved.actionNo);
  assert.deepEqual(await history(), []);
  assert.deepEqual(await occurrence(move), moved);
  assert.deepEqual(await history(), []);
  console.log('PASS N197 calendar revisions, payload conflicts, owner/service isolation and undo');

  // Assert actual commands are denied, in addition to pg_catalog grant checks.
  for (const role of ['authenticated', 'anon']) {
    await as(role, role === 'authenticated' ? owner : '');
    for (const [sql, values] of [
      ["insert into public.command_receipts(user_id,operation_id,resource,result) values($1,$2,'fixture','{}')", [owner, randomUUID()]],
      ["insert into public.command_receipts(user_id,operation_id,resource,result,trusted_writer_version) values($1,$2,'fixture','{}',1)", [owner, randomUUID()]],
      ["update public.command_receipts set result='{}' where user_id=$1", [owner]],
      ['update public.command_receipts set trusted_writer_version=1 where user_id=$1', [owner]],
      ['delete from public.command_receipts where user_id=$1', [owner]],
      ['truncate public.command_receipts', []],
    ]) await assert.rejects(q(sql, values), error => error.code === '42501', role + ' cannot mutate receipts');
    await assert.rejects(q('select public.lemma_trusted_receipt_begin($1,$2,$3,$4::jsonb)', [owner, randomUUID(), 'fixture', '{}']), error => error.code === '42501');
  }
  await as('authenticated', owner);

  if (db.connect) {
    for (const name of names) {
      for (const rollback of [false, true]) {
        const test = await scenario(name);
        const initial = await test.read();
        const actions = await actionCount();
        const left = await db.connect();
        const right = await db.connect();
        let pending;
        try {
          for (const client of [left, right]) {
            await client.query('reset role');
            await client.query("select set_config('test.uid',$1,false),set_config('request.jwt.claims','{}',false)", [owner]);
            await client.query('set role authenticated');
            await client.query('begin');
            await client.query("set local statement_timeout='15s'");
          }
          const first = publicResult((await left.query(test.sql, test.values)).rows[0].result);
          assert.equal(first.status, 'ok');
          const pid = (await right.query('select pg_backend_pid() pid')).rows[0].pid;
          let settled = false;
          pending = right.query(test.sql, test.values).then(value => {
            settled = true;
            return {value};
          }, error => { settled = true; return {error}; });
          const deadline = Date.now() + 10000;
          let blocked = false;
          do {
            blocked = await scalar("select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) result", [pid]);
            if (blocked || settled) break;
            await new Promise(resolve => setTimeout(resolve, 15));
          } while (Date.now() < deadline);
          assert.equal(blocked, true, name + ' duplicate waits on the real owner-operation lock');
          await left.query(rollback ? 'rollback' : 'commit');
          const outcome = await pending;
          if (outcome.error) throw outcome.error;
          const second = publicResult(outcome.value.rows[0].result);
          assert.equal(second.status, 'ok');
          await right.query('commit');
          if (!rollback) assert.deepEqual(second, first, name + ' concurrent duplicate replays committed response');
          assert.equal(await scalar('select count(*)::int result from public.command_receipts where user_id=$1 and operation_id=$2', [owner, test.input.operationId]), 1);
          assert.equal(await actionCount(), actions + 1, name + ' leaves one committed journal action');
          assert.notDeepEqual(await test.read(), initial, name + ' leaves one real domain effect');
          assert.deepEqual(await call(test.sql, test.values), second);
          const receipt = await stored(test.input.operationId);
          await undo(second.actionNo ?? receipt.actionNo);
          assert.deepEqual(await test.read(), initial, name + ' concurrent result remains undoable');
        } finally {
          await left.query('rollback').catch(() => {});
          if (pending) await pending;
          await right.query('rollback').catch(() => {});
          await left.end();
          await right.end();
        }
      }
    }
    console.log('PASS N197 PostgreSQL: eight writers each pass separate-backend duplicate-commit and first-writer-rollback races');
  } else console.log('N197 separate-backend races require NOTIF_TEST_DATABASE_URL; PGlite covers the single-connection cases only');

  await as('authenticated', owner);
  const rawRows = () => q('select operation_id,to_jsonb(r) payload from public.command_receipts r where user_id=$1 order by operation_id', [owner]);
  const beforeExport = await rawRows();
  assert.ok(beforeExport.some(row => row.operation_id === legacyOperationId));
  assert.ok(beforeExport.some(row => row.operation_id === trustedOperationId && row.payload.trusted_writer_version === 1));
  const expected = beforeExport.map(({payload}) => {
    const result = {...payload.result};
    delete result._request;
    delete result._request_sha256;
    return {...payload, result};
  });
  const order = rows => [...rows].sort((a, b) => a.operation_id.localeCompare(b.operation_id));
  const paged = async readPage => {
    const result = [], seen = new Set();
    let cursor = null;
    do {
      const page = await readPage(cursor);
      assert.ok(page.rows.length <= 3);
      result.push(...page.rows);
      const next = page.nextCursor;
      if (!next || page.rows.length === 0) break;
      assert.equal(seen.has(next), false, 'receipt export cursor advances');
      seen.add(next);
      cursor = next;
      assert.ok(seen.size < 1000, 'bounded receipt export');
    } while (true);
    return order(result);
  };
  const browserRows = await paged(cursor => scalar('select public.lemma_export_page($1,$2,3) result', ['command_receipts', cursor]));
  assert.deepEqual(browserRows, order(expected), 'browser keyset export includes both receipt formats with private metadata redacted');
  const snapshot = await scalar('select public.begin_owner_export() result');
  const stableRead = cursor => scalar('select public.owner_export_page($1,$2,$3,3) result', [snapshot, 'command_receipts', cursor === null ? 0 : Number(cursor)]);
  assert.deepEqual(await paged(stableRead), order(expected), 'stable owner snapshot exports all receipt histories');
  await as('service_role');
  const serviceRows = await paged(cursor => scalar('select public.lemma_export_page_for($1,$2,$3,3) result', [owner, 'command_receipts', cursor]));
  assert.deepEqual(serviceRows, order(expected), 'service export matches browser export');
  await as('authenticated', other);
  const foreignRows = await paged(cursor => scalar('select public.lemma_export_page($1,$2,3) result', ['command_receipts', cursor]));
  assert.ok(foreignRows.every(row => row.user_id === other));
  assert.ok(foreignRows.every(row => !beforeExport.some(prior => prior.operation_id === row.operation_id)));
  await assert.rejects(stableRead(null), /Export expired/);
  await assert.rejects(scalar('select public.lemma_export_page_for($1,$2,null,3) result', [owner, 'command_receipts']));
  await as('anon');
  await assert.rejects(scalar('select public.lemma_export_page($1,null,3) result', ['command_receipts']));
  await as('authenticated', owner);
  assert.deepEqual(await rawRows(), beforeExport, 'all export routes leave private receipt storage untouched');
  const newInput = request('tasks', 'create', {title: 'After stable receipt snapshot'});
  await call('select public.task_command($1) result', [JSON.stringify(newInput)]);
  assert.deepEqual(await paged(stableRead), order(expected), 'existing export snapshot remains frozen after a new receipt');
  assert.equal(await scalar('select count(*)::int result from public.command_receipts where operation_id=$1', [newInput.operationId]), 1);
  await q('select public.end_owner_export($1)', [snapshot]);
  console.log('PASS N197 receipt history export: browser/service/stable pagination, owner isolation, private metadata redaction and immutable replay storage');
}
