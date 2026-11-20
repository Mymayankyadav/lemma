// A staged tutor install must be safe before the shared N191 release exists.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const dir=new URL('../../../supabase/migrations/',import.meta.url);
const tutorFile='20261120045827_n193_tutor_threads.sql';
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const value=async(sql,params=[])=>(await q(sql,params))[0].result;
const roles=['anon','authenticated','service_role'];

try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$select null::uuid$$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $$select decode(repeat('00',n),'hex')$$;
  grant usage on schema auth to authenticated;`);
 // Reproduce the deployed pre-foundation schema, rather than stubbing the
 // release function which caused the original migration-time failure.
 const files=(await readdir(dir)).filter(name=>name.endsWith('.sql')&&name<tutorFile&&
  !name.includes('_storage')&&!name.includes('_n191_')).sort();
 for(const name of files)await db.exec(await readFile(new URL(name,dir),'utf8'));
 assert.equal(await value("select to_regprocedure('public.lemma_plan_released()') is null result"),true);
 const tutor=await readFile(new URL(tutorFile,dir),'utf8');
 const existingRegistry=`create schema lemma_export_private;
  create table lemma_export_private.additional_tables(table_name text primary key,
   owner_column text not null default 'user_id',redact_columns text[] not null default '{}');`;
 // A dependent migration must not silently rewrite a shared registry's grants.
 for(const exposure of [
  'grant usage on schema lemma_export_private to public',
  'grant create on schema lemma_export_private to authenticated',
  'grant select on lemma_export_private.additional_tables to service_role',
  'grant insert on lemma_export_private.additional_tables to anon',
 ]) {
  await db.exec('begin');
  try {
   await db.exec(existingRegistry+exposure);
   await assert.rejects(db.exec(tutor),error=>error.code==='42501'&&/private owner export registry/.test(error.message));
  } finally {await db.exec('rollback')}
 }
 await db.exec(tutor);
 assert.equal(await value('select public.tutor_plan_released() result'),false);
 for(const role of roles){
  assert.equal(await value("select has_schema_privilege($1,'lemma_export_private','USAGE,CREATE') result",[role]),false);
  assert.equal(await value("select has_table_privilege($1,'lemma_export_private.additional_tables','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') result",[role]),false);
 }
 await db.exec('set role service_role');
 assert.equal(await value("select public.tutor_grant_active($1) result",['a'.repeat(64)]),false);
 await assert.rejects(q('select public.tutor_plan_released()'),error=>error.code==='42501');
 await db.exec('reset role');
 // The same installed helper observes the later release without replacement.
 await db.exec("create function public.lemma_plan_released() returns boolean language sql stable as 'select false'");
 assert.equal(await value('select public.tutor_plan_released() result'),false);
 await db.exec("create or replace function public.lemma_plan_released() returns boolean language sql stable as 'select true'");
 assert.equal(await value('select public.tutor_plan_released() result'),true);
 console.log('N193 migration order: absent release fails closed; exposed registries rejected; private ACLs preserved.');
} finally {await db.close()}
