// N12 / #912 owner-bound study MCP SQL acceptance. PGlite only; never production.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const owner = '11111111-1111-1111-1111-111111111111';
const other = '99999999-9999-9999-9999-999999999999';
const unknown = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const role = async (name) => { await db.exec('reset role'); if (name) await db.exec('set role ' + name); };
const envelope = (id, operation, extra = {}) => ({
  operationId: id, schemaVersion: 1, resource: 'study_entries', operation, ...extra,
});
const bridge = async (user, source, command) =>
  (await q('select public.mcp_study_command($1::uuid,$2::text,$3::jsonb) result',
    [user, source, JSON.stringify(command)]))[0].result;
const direct = async command =>
  (await q('select public.study_command($1::jsonb) result', [JSON.stringify(command)]))[0].result;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    -- Match Supabase auth.uid() reading transaction-local request claims, while
    -- retaining a test.uid fallback for existing SQL fixtures.
    create function auth.uid() returns uuid language sql as $uid$
      select coalesce(
        nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
        nullif(current_setting('test.uid',true),'')::uuid
      )
    $uid$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as
      $bytes$select decode(repeat('00',n),'hex')$bytes$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter(name => name.endsWith('.sql') && !name.includes('_storage')).sort();
  assert.ok(files.includes('20261106170000_mcp_study_command.sql'), 'D6 migration must exist');
  for (const file of files) await db.exec(await readFile(new URL(file, dir), 'utf8'));
  await q('insert into auth.users(id) values ($1),($2)', [owner, other]);
  // log_change enforces one owner per transaction; seed distinct owners
  // in separate statements without relaxing that production invariant.
  await q('insert into public.settings(user_id,connector_secret) values ($1,$2)',
    [owner, '1'.repeat(48)]);
  await q('insert into public.settings(user_id,connector_secret) values ($1,$2)',
    [other, '2'.repeat(48)]);
  // SECURITY DEFINER is not a license for ordinary users to supply a p_user.
  const acl = await q(`select
    has_function_privilege('anon','public.mcp_study_command(uuid,text,jsonb)','EXECUTE') as anon,
    has_function_privilege('authenticated','public.mcp_study_command(uuid,text,jsonb)','EXECUTE') as authenticated,
    has_function_privilege('service_role','public.mcp_study_command(uuid,text,jsonb)','EXECUTE') as service`);
  assert.equal(acl[0].anon, false, 'anon must have no EXECUTE privilege');
  assert.equal(acl[0].authenticated, false, 'authenticated must have no EXECUTE privilege');
  assert.equal(acl[0].service, true, 'service_role alone can invoke the bridge');

  const create = envelope('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'create',
    { patch: { source: 'manual', intent: 'Proof writing' } });
  await role('authenticated');
  await assert.rejects(bridge(owner, 'chatgpt', create), /permission denied/);
  await role('anon');
  await assert.rejects(bridge(owner, 'chatgpt', create), /permission denied/);

  await role('service_role');
  // The confirmed bug: service-role direct study_command is not authenticated as owner.
  // PGlite's isolated service role has no privilege on study_command; either a
  // permission failure or Authentication required is acceptable for this check.
  await assert.rejects(direct(create), /Authentication required|permission denied/);
  await assert.rejects(bridge(unknown, 'chatgpt', create), /Owner not found/);
  const created = await bridge(owner, 'chatgpt', create);
  assert.equal(created.status, 'ok');
  assert.equal(created.changed[0].version, 1);
  assert.ok(Number.isSafeInteger(created.actionNo) && created.actionNo > 0,
    'the receipt needs a real actionNo for undo');
  const id = created.changed[0].id;
  assert.deepEqual(await bridge(owner, 'chatgpt', { ...create,
    patch: { source: 'timer', intent: 'must ignore replay payload' } }), created,
    'receipt replay must be byte-for-byte identical, including actionNo');
  await assert.rejects(bridge(owner, 'chatgpt', envelope(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'create',
    { patch: { source: 'manual', user_id: other } }
  )), /Unknown patch field/);

  await role(null);
  const row = (await q('select id,user_id,version,status from public.study_entries where id=$1', [id]))[0];
  assert.equal(row.user_id, owner, 'service role cannot be coerced into writing for a foreign owner');
  assert.equal(row.version, 1);
  const settings = (await q('select connector_last_client,connector_last_seen_at from public.settings where user_id=$1', [owner]))[0];
  assert.equal(settings.connector_last_client, 'chatgpt');
  assert.ok(settings.connector_last_seen_at);
  const journal = (await q('select user_id,tool,source from public.actions where no=$1', [created.actionNo]))[0];
  assert.equal(journal.user_id, owner);
  assert.equal(journal.tool, 'study');
  assert.equal(journal.source, 'chatgpt');

  await role('service_role');
  const otherCreate = envelope('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'create',
    { patch: { source: 'manual', intent: 'Other owner' } });
  const another = await bridge(other, 'claude', otherCreate);
  assert.equal(another.changed[0].version, 1);
  const attempted = envelope('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'update',
    { target: { id }, expectedVersion: 1, patch: { intent: 'Steal it' } });
  await assert.rejects(bridge(other, 'claude', attempted), /not found/i);
  await role(null);
  assert.equal((await q('select intent from public.study_entries where id=$1', [id]))[0].intent,
    'Proof writing', 'second owner could not change first owner');
  assert.equal((await q('select user_id from public.study_entries where id=$1',
    [another.changed[0].id]))[0].user_id, other);

  // An app-authenticated write is visible on the next owner read, retaining version.
  await q("select set_config('test.uid',$1,false)", [owner]);
  await role('authenticated');
  const changed = await direct(envelope('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    'update', { target: { id }, expectedVersion: 1, patch: { intent: 'App edit' } }));
  assert.equal(changed.changed[0].version, 2);
  const reads = await q('select id,intent,version from public.study_entries where id=$1', [id]);
  assert.equal(reads[0].intent, 'App edit');
  assert.equal(reads[0].version, 2);
  await role(null);
  await q("select set_config('test.uid','',false)");
  await assert.rejects(direct(envelope('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    'create', { patch: { source: 'manual' } })), /Authentication required/);
  console.log('PASS N12 owner-bound service-role MCP bridge: ACL, receipts, owner isolation, replay, app sync');
} finally { await db.close(); }
