'use strict';
// SYNC-04 L5: inspect only the disposable local Postgres instance.
// No project ref, Supabase access token, or remote database URL is accepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const DB = ['notes', 'profiles', 'review_events', 'review_retractions'];

function psql(sql) {
  // CLI flags (not PG* environment variables) fix the connection to loopback.
  return execFileSync('psql', [
    '--no-psqlrc', '--no-password', '--no-align', '--tuples-only',
    '--set', 'ON_ERROR_STOP=1', '--host', '127.0.0.1', '--port', '54322',
    '--username', 'postgres', '--dbname', 'postgres', '--command', sql
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, PGPASSWORD: 'postgres', PGSSLMODE: 'disable' }
  }).trim().split('\n').map(s => s.trim()).filter(Boolean);
}

function main() {
  const local = psql("select current_setting('server_version_num')::int / 10000");
  assert.deepEqual(local, ['17'], 'local database must match hosted PostgreSQL major version 17');

  const expected = fs.readdirSync(MIGRATIONS)
    .filter(file => file.endsWith('.sql'))
    .map(file => {
      assert.match(file, /^\d{14}_.+\.sql$/, 'unexpected migration filename: ' + file);
      return file.split('_')[0];
    }).sort();
  assert.ok(expected.length > 0, 'migration files absent');
  const applied = psql('select version from supabase_migrations.schema_migrations order by version');
  assert.deepEqual(applied, expected,
    'local db reset did not apply exactly the checked-in migrations; never use --linked');

  const rows = psql(
    "select c.relname || ':' || (case when c.relrowsecurity then 'on' else 'off' end) " +
    "from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
    "where n.nspname='public' and c.relkind in ('r','p') " +
    "and c.relname in ('notes','profiles','review_events','review_retractions') " +
    "order by c.relname"
  );
  assert.deepEqual(rows, DB.map(t => t + ':on').sort(),
    'every expected sync table must exist and have RLS enabled');
  console.log('ok: local PostgreSQL 17, ' + applied.length +
    ' exact applied migrations, RLS enabled on all four sync tables (local CI only)');
}

if (require.main === module) {
  try { main(); } catch (err) { console.error('SYNC-04 L5 local smoke FAILED: ' + err.message); process.exitCode = 1; }
}
module.exports = { main };
