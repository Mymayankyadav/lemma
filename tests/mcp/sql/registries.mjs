// N36.1 / D8(a): new registry metadata only, verified against the final D7
// undo_action allowlists. All SQL executes in fresh in-memory PGlite, never Supabase.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = async (query, values = []) => (await db.query(query, values)).rows;
const migrationDir = new URL('../../../supabase/migrations/', import.meta.url);
const docsDir = new URL('../../../docs/v6/capability-registry/', import.meta.url);
const parseList = text => [...text.matchAll(/'([a-z_]+)'/g)].map(match => match[1]);

try {
  await db.exec([
    'create role anon; create role authenticated; create role service_role;',
    'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
    "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
    "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
    'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;',
  ].join('\n'));

  for (const file of (await readdir(migrationDir)).filter(name =>
    name.endsWith('.sql') && !name.includes('_storage')).sort()) {
    await db.exec(await readFile(new URL(file, migrationDir), 'utf8'));
  }

  const old = await readFile(new URL('20261106180000_v6_task_command.sql', migrationDir), 'utf8');
  const lock = old.match(/foreach t in array array\[([^\]]+)\] loop/i);
  const journal = old.match(/c\.table_name <> all\(array\[([^\]]+)\]\)/i);
  assert.ok(lock && journal, 'D7 undo_action must retain both canonical allowlists');
  const canonical = parseList(lock[1]);
  assert.deepEqual(parseList(journal[1]), canonical, 'D7 journal and lock lists must agree');
  assert.equal(canonical.length, 24);

  const undoDoc = JSON.parse(await readFile(new URL('lemma_undo_tables.json', docsDir), 'utf8'));
  const resourceDoc = JSON.parse(await readFile(new URL('lemma_command_resources.json', docsDir), 'utf8'));
  const registry = (await sql('select table_name from public.lemma_undo_tables order by table_name'))
    .map(row => row.table_name);
  assert.deepEqual(registry, [...canonical].sort());
  assert.deepEqual(undoDoc.tables.map(row => row.table_name), canonical);
  assert.equal(new Set(registry).size, 24);

  const resources = await sql('select resource, command_fn, mcp_ok, "schema" from public.lemma_command_resources order by resource');
  assert.deepEqual(resources.map(row => row.resource).sort(),
    ['study_entries','study_intervals','calendar_blocks','tasks'].sort());
  assert.equal(resources.length, 4);
  assert.deepEqual(resources.map(row => [row.resource,row.command_fn]),
    [...resourceDoc.resources].sort((a,b) => a.resource.localeCompare(b.resource))
      .map(row => [row.resource,row.command_fn]));
  for (const resource of resources) {
    assert.equal(resource.mcp_ok, true);
    const documented = resourceDoc.resources.find(row => row.resource === resource.resource);
    const shape = typeof resource.schema === 'string' ? JSON.parse(resource.schema) : resource.schema;
    assert.deepEqual(shape, documented.schema);
    assert.ok(Array.isArray(shape.operations) && shape.operations.length > 0);
    assert.ok(Array.isArray(shape.fields) && shape.fields.length > 0);
    assert.ok(['study_command','task_command'].includes(resource.command_fn));
  }

  // The metadata is owner-inaccessible until a reviewed security-definer
  // function uses it. Only the registry tables, not any owner data, are new.
  const rls = await sql("select relname,relrowsecurity from pg_class where relname in ('lemma_undo_tables','lemma_command_resources')");
  assert.equal(rls.length, 2);
  assert.ok(rls.every(row => row.relrowsecurity === true));
  const policies = await sql("select tablename from pg_policies where tablename in ('lemma_undo_tables','lemma_command_resources')");
  assert.deepEqual(policies, []);

  for (const role of ['anon','authenticated']) {
    await db.exec('set role ' + role);
    for (const table of ['lemma_undo_tables','lemma_command_resources']) {
      try {
        const rows = await sql('select * from public.' + table);
        assert.deepEqual(rows, [], role + ' must not read registry ' + table);
      } catch (error) {
        assert.match(String(error), /permission denied/i);
      }
    }
    await db.exec('reset role');
  }

  await assert.rejects(sql("insert into public.lemma_undo_tables(table_name) values('settings;drop')"), /check constraint|violates check/i);
  await assert.rejects(sql("insert into public.lemma_command_resources(resource,command_fn,mcp_ok,\"schema\") values('evil','study_command;drop',true,'{}')"), /check constraint|violates check/i);

  // Registering future table metadata is an INSERT; no function replacement
  // or modification of any existing owner record is involved in this slice.
  await sql("insert into public.lemma_undo_tables(table_name) values('future_registry_fixture')");
  assert.equal((await sql("select count(*)::int n from public.lemma_undo_tables where table_name='future_registry_fixture'"))[0].n, 1);

  // The three deployed functions remain present and untouched by N36.1.
  const funcs = await sql("select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('undo_action','mcp_study_command','mcp_task_command')");
  assert.deepEqual(funcs.map(row => row.proname).sort(),
    ['undo_action','mcp_study_command','mcp_task_command'].sort());
  console.log('PASS N36.1 exact undo/command registry seed, owner isolation, identifier guards and existing function compatibility');
} finally {
  await db.close();
}
