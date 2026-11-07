// N48.2: the review-run command must exist and be registered once write paths are safe.
// This intentionally fails against N48.1's read-only staging schema.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try {
  await db.exec([
    'create role anon; create role authenticated; create role service_role;',
    'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
    "create function auth.uid() returns uuid language sql as $a$ select nullif(current_setting('test.uid',true),'')::uuid $a$;",
    "create function extensions.gen_random_bytes(n int) returns bytea language sql as $b$ select decode(repeat('00',n),'hex') $b$;"
  ].join('\n'));
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  for (const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
    await db.exec(await readFile(new URL(file,dir),'utf8'));
  const {rows}=await db.query("select to_regprocedure('public.review_runs_command(jsonb)') is not null as installed");
  assert.equal(rows[0].installed,true,'N48.2 must install versioned review_runs_command');
  console.log('PASS N48.2 command installation');
} finally { await db.close(); }
