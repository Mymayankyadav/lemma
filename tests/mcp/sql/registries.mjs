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

  const migrations = (await readdir(migrationDir)).filter(name =>
    name.endsWith('.sql') && !name.includes('_storage')).sort();
  const seedIndex = migrations.indexOf('20261106200000_lemma_command_registries.sql');
  assert.ok(seedIndex >= 0, 'N36.1 seed migration required');
  // The original 24 tables and four resources are an exact baseline, not a
  // permanent cap: later migrations are allowed to register additional ones.
  for (const file of migrations.slice(0, seedIndex + 1))
    await db.exec(await readFile(new URL(file, migrationDir), 'utf8'));

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
  const documentedUndo = undoDoc.tables.map(row => row.table_name);
  assert.deepEqual(documentedUndo.slice(0, canonical.length), canonical);
  assert.equal(new Set(registry).size, 24);

  const resources = await sql('select resource, command_fn, mcp_ok, "schema" from public.lemma_command_resources order by resource');
  assert.deepEqual(resources.map(row => row.resource).sort(),
    ['study_entries','study_intervals','calendar_blocks','tasks'].sort());
  assert.equal(resources.length, 4);
  assert.deepEqual(resources.map(row => [row.resource,row.command_fn]),
    resourceDoc.resources.filter(doc => resources.some(row => row.resource === doc.resource))
      .sort((a,b) => a.resource.localeCompare(b.resource))
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
  await db.exec(`create table public.future_registry_fixture(
    id uuid primary key, user_id uuid not null references auth.users(id)
  );
  create trigger lemma_log_change after insert or update or delete on public.future_registry_fixture
    for each row execute function public.log_change();`);
  await sql("insert into public.lemma_undo_tables(table_name) values('future_registry_fixture')");
  assert.equal((await sql("select count(*)::int n from public.lemma_undo_tables where table_name='future_registry_fixture'"))[0].n, 1);

  // The three deployed functions remain present and untouched by N36.1.
  const funcs = await sql("select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('undo_action','mcp_study_command','mcp_task_command')");
  assert.deepEqual(funcs.map(row => row.proname).sort(),
    ['undo_action','mcp_study_command','mcp_task_command'].sort());

  // Exercise the full migration sequence after the exact seed checks. The
  // fixture itself also makes the old full-schema fixed-count test fail.
  for (const file of migrations.slice(seedIndex + 1))
    await db.exec(await readFile(new URL(file, migrationDir), 'utf8'));
  const expanded = (await sql('select table_name from public.lemma_undo_tables order by table_name'))
    .map(row => row.table_name);
  for (const name of canonical) assert.ok(expanded.includes(name), 'lost original undo table '+name);
  for (const name of documentedUndo) assert.ok(expanded.includes(name), 'missing documented undo table '+name);
  assert.equal(new Set(expanded).size, expanded.length);
  assert.ok(expanded.length > canonical.length, 'fixture must extend the undo registry');
  for (const name of expanded.filter(table => !canonical.includes(table))) {
    const row = (await sql(`select c.relkind,
      exists(select 1 from pg_attribute a where a.attrelid=c.oid
        and a.attname='user_id' and not a.attisdropped) owner_column,
      exists(select 1 from pg_trigger t where t.tgrelid=c.oid
        and t.tgname='lemma_log_change' and not t.tgisinternal) audit_trigger
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=$1`,[name]))[0];
    assert.ok(row && row.relkind==='r' && row.owner_column && row.audit_trigger,
      'new undo table must be a journalled owner table: '+name);
  }
  const finalResources = await sql('select resource,command_fn,mcp_ok,"schema" from public.lemma_command_resources');
  for (const baseline of resources) {
    const next = finalResources.find(row => row.resource === baseline.resource);
    assert.ok(next,'original command resource missing: '+baseline.resource);
    assert.equal(next.command_fn,baseline.command_fn);
    assert.equal(next.mcp_ok,baseline.mcp_ok);
    assert.deepEqual(next.schema,baseline.schema);
  }
  for (const entry of finalResources) {
    const shape = typeof entry.schema === 'string' ? JSON.parse(entry.schema) : entry.schema;
    assert.ok(Array.isArray(shape.operations) && shape.operations.length>0);
    assert.ok(Array.isArray(shape.fields) && shape.fields.length>0);
    assert.equal((await sql("select to_regprocedure('public.'||$1||'(jsonb)') is not null present",
      [entry.command_fn]))[0].present,true,'registered function missing: '+entry.resource);
    const doc = resourceDoc.resources.find(row => row.resource===entry.resource);
    if (doc) {
      assert.equal(entry.command_fn,doc.command_fn);
      assert.deepEqual(shape,doc.schema);
    }
  }
  for (const doc of resourceDoc.resources)
    assert.ok(finalResources.some(row => row.resource===doc.resource),'documented command missing: '+doc.resource);
  console.log('PASS N36.1 exact seed and additive registrations, owner isolation and compatibility');
} finally {
  await db.close();
}
