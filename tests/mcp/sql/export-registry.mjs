// N95: integration guard for the authoritative dynamic undo registry.
// The owner export must be based on this registry, never a hardcoded table list.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
  "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
  "create function auth.uid() returns uuid language sql as $auth$ "+
  "select nullif(current_setting('test.uid',true),'')::uuid $auth$;"+
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$ "+
  "select decode(repeat('00',n),'hex') $bytes$;"+
  "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
 // Registry discovery is an intentionally unresolved server-authorization
 // blocker (#1156): an authenticated browser must not gain this grant via N95.
 const registryAcl=(await q("select has_table_privilege('authenticated','public.lemma_undo_tables','SELECT') as can_read,has_table_privilege('authenticated','public.lemma_undo_tables','INSERT') as can_write"))[0];
 assert.deepEqual(registryAcl,{can_read:false,can_write:false});
 await db.exec('set role authenticated');
 await assert.rejects(q('select table_name from public.lemma_undo_tables limit 1'),
  /permission denied|not authorized/i,'browser cannot read the undo registry today');
 await db.exec('reset role');
 const registry=(await q('select table_name from public.lemma_undo_tables order by table_name'))
  .map(r=>r.table_name);
 assert.ok(registry.length>20,'registry includes v6 owner resources');
 for(const expected of ['settings','tasks','study_entries','study_intervals','reviews','proposals'])
  assert.ok(registry.includes(expected),'required registered owner table '+expected);
 assert.equal(new Set(registry).size,registry.length,'registry has no duplicate names');
 for(const name of registry){
  assert.match(name,/^[a-z_][a-z0-9_]*$/);
  const exists=(await q('select to_regclass($1) is not null as found',['public.'+name]))[0].found;
  assert.equal(exists,true,'registered table has real owner schema: '+name);
 }
 const active=(await q('select count(*)::int total from public.lemma_undo_tables'))[0].total;
 assert.equal(active,registry.length);
 // A dynamically registered table must become discoverable without changing
 // a client-side array or shipping a new frontend build.
 await q("insert into public.lemma_undo_tables(table_name) values('test_export_resource')");
 const extended=(await q('select table_name from public.lemma_undo_tables order by table_name'))
  .map(r=>r.table_name);
 assert.ok(extended.includes('test_export_resource'));
 assert.equal(extended.length,registry.length+1);
 console.log('PASS N95 database registry names, dynamic registration and bounded schema identifiers');
}finally{await db.close()}
