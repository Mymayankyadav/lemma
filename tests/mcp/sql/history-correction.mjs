// N91 owner-bound historical correction work starts with a full-migration
// regression that will expand to rederived checkpoint and review state.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec([
  'create role anon; create role authenticated; create role service_role;',
  'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $x$select nullif(current_setting('test.uid',true),'')::uuid$x$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $x$select decode(repeat('00',n),'hex')$x$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const folder=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(folder)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261117120000_history_corrections.sql'),
  'The N91 additive history migration must exist');
 for(const name of migrations)
  await db.exec(await readFile(new URL(name,folder),'utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 for(const table of ['session_events','reviews','review_parameter_sets']){
  const docs=JSON.parse(await readFile(new URL(
   '../../../docs/v6/capability-registry/'+table+'.json',import.meta.url),'utf8'));
  const rows=await q("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",
   ['public.'+table]);
  assert.deepEqual(Object.keys(docs.columns).sort(),rows.map(r=>r.attname).sort(),
   table+' owner capability registry must cover all SQL columns');
 }
 const fields=(await q("select attname from pg_attribute where attrelid='public.session_events'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname);
 for(const field of ['occurred_at','superseded_by','voided_at','correction_reason','actor'])
  assert.ok(fields.includes(field),'N91 must create '+field);
 console.log('N91 historical metadata schema: passes');
} finally { await db.close(); }
