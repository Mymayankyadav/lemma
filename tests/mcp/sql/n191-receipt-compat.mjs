// N191 receipt compatibility baseline in a disposable, in-memory PGlite DB.
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {checkLocalIngress} from './fixtures/n191-local-ingress.mjs';
import {checkCorrectionParity} from './fixtures/n191-correction-parity.mjs';
import {openN191Postgres} from './fixtures/n191-pg-fixture.mjs';

const localPostgres = process.env.NOTIF_TEST_DATABASE_URL;
const db = localPostgres ? await openN191Postgres(localPostgres) :
  new (await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')).PGlite();
const owner = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const operationId = n => `0c211901-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const as = async (role, id = '') => {
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)", [id]);
  if (role) await db.exec('set role ' + role);
};
const taskEnvelope = (n, title) => ({
  schemaVersion: 1, operationId: operationId(n), resource: 'tasks', operation: 'create', patch: {title},
});
const call = async (resource, request) => (await q(
  `select public.${resource === 'tasks' ? 'task_command' : 'review_runs_command'}($1::jsonb) as result`,
  [JSON.stringify(request)],
))[0].result;
const receipt = async (id, op) => (await q(
  'select resource,result from public.command_receipts where user_id=$1 and operation_id=$2', [id, op],
))[0];
const audit = async no => (await q('select user_id, source from public.actions where no=$1', [no]))[0];
const count = async sql => (await q(sql))[0].n;

try {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!(await q('select 1 from pg_roles where rolname=$1', [role])).length) await db.exec('create role ' + role);
  }
  await db.exec(`create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $auth$
      select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
                      nullif(current_setting('test.uid',true),'')::uuid) $auth$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$
      select decode(repeat('00',n),'hex') $bytes$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.sql') && !n.includes('_storage')).sort()) {
    await db.exec(await readFile(new URL(name, dir), 'utf8'));
  }
  await q('insert into auth.users(id) values ($1),($2)', [owner, other]);
  for (const [id, key] of [[owner, 'a'], [other, 'b']]) {
    await q('insert into public.settings(user_id,connector_secret) values ($1,$2)', [id, key.repeat(48)]);
  }
  const project = (await q(`insert into public.projects(user_id,slug,title,goal,status)
    values ($1,'n191-receipt','Fixture path','Review','active') returning id`, [owner]))[0].id;
  const note = (await q(`insert into public.notes(user_id,project_id,front,back)
    values ($1,$2,'Q','A') returning id`, [owner, project]))[0].id;
  await q('insert into public.cards(user_id,note_id,ord) values ($1,$2,1)', [owner, note]);
  const reviewEnvelope = {
    schemaVersion: 1, operationId: operationId(2), resource: 'review_runs', operation: 'start', target: {},
    patch: {filters: {includeNew: true}, selected_deck_ids: ['project:n191-receipt'],
      card_budget: 5, minute_budget: 5, scheduler_version: 'fsrs-5', settings_version: 1},
  };

  // Observe the privilege boundary without attempting unapproved receipt-table writes.
  const privileges = (await q(`select c.relrowsecurity as rls,
    has_table_privilege('authenticated',c.oid,'INSERT') as auth_insert,
    has_table_privilege('authenticated',c.oid,'UPDATE') as auth_update,
    has_table_privilege('authenticated',c.oid,'DELETE') as auth_delete
    from pg_class c where c.oid='public.command_receipts'::regclass`))[0];
  assert.equal(privileges.rls, true);
  console.log('N191 authenticated receipt-table privilege audit:', JSON.stringify(privileges));

  await as('authenticated', owner);
  const input = taskEnvelope(1, 'Owner receipt');
  const first = await call('tasks', input);
  assert.equal(first.status, 'ok');
  assert.ok(first.actionNo > 0);
  assert.equal('_request' in first, false);
  const saved = await receipt(owner, input.operationId);
  assert.equal(saved.resource, 'tasks');
  assert.deepEqual(saved.result._request, input);
  const actionCount = await count('select count(*)::int n from public.actions');
  const duplicateShape = {...input, patch: {title: input.patch.title}};
  assert.deepEqual(await call('tasks', duplicateShape), first, 'exact replay returns the original DTO');
  assert.equal((await call('tasks', {...input, patch: {title: 'Changed'}})).status, 'conflict');
  assert.equal((await call('review_runs', {...reviewEnvelope, operationId: input.operationId})).status, 'conflict');
  assert.equal(await count('select count(*)::int n from public.actions'), actionCount, 'no additional journal on retry/conflict');

  const review = await call('review_runs', reviewEnvelope);
  assert.equal(review.status, 'ok');
  assert.ok(review.actionNo > 0);
  assert.equal('_request' in review, false);
  assert.deepEqual(await call('review_runs', reviewEnvelope), review);
  assert.equal((await receipt(owner, reviewEnvelope.operationId)).resource, 'review_runs');

  const rolledBack = taskEnvelope(3, 'Temporary rollback');
  await db.exec('begin');
  const provisional = await call('tasks', rolledBack);
  assert.equal(provisional.status, 'ok');
  assert.ok(await receipt(owner, rolledBack.operationId));
  await db.exec('rollback');
  assert.equal(await receipt(owner, rolledBack.operationId), undefined);
  assert.equal(await count("select count(*)::int n from public.tasks where title='Temporary rollback'"), 0);
  assert.equal(await audit(provisional.actionNo), undefined);

  await as('authenticated', other);
  assert.equal(await receipt(owner, input.operationId), undefined, 'owner receipts are not visible across owners');
  const otherResult = await call('tasks', taskEnvelope(1, 'Second owner'));
  assert.equal(otherResult.status, 'ok', 'the same UUID is independent for another owner');
  assert.notEqual(otherResult.changed[0].id, first.changed[0].id);

  await as('service_role');
  const serviceInput = taskEnvelope(4, 'Server command');
  const serviceResult = (await q('select public.mcp_task_command($1::uuid,$2::text,$3::jsonb) result',
    [owner, 'chatgpt', JSON.stringify(serviceInput)]))[0].result;
  assert.equal(serviceResult.status, 'ok');

  await as();
  assert.deepEqual(await audit(first.actionNo), {user_id: owner, source: 'app'});
  assert.deepEqual(await audit(review.actionNo), {user_id: owner, source: 'app'});
  assert.deepEqual(await audit(otherResult.actionNo), {user_id: other, source: 'app'});
  assert.deepEqual(await audit(serviceResult.actionNo), {user_id: owner, source: 'chatgpt'});
  assert.equal((await receipt(owner, serviceInput.operationId)).resource, 'tasks');
  console.log('N191 existing task/review writers: owner attribution, replay, conflicts and rollback passed');
  await checkLocalIngress(db, {owner, other, project, precedingReceiptId: input.operationId, operationId});
  await checkCorrectionParity(db, {owner, project, operationId, as});
} finally {
  await db.close();
}
