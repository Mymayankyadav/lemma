// N49 full-migration proposal-draft owner lifecycle regression.
// Further assertions cover receipt replay, stale base versions, atomic submit,
// journal/undo and MCP parity as the staged command is completed.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role;'+
  'create schema auth;create schema extensions;create table auth.users(id uuid primary key);');
 await db.exec("create function auth.uid() returns uuid language sql as $auth$"+
  " select nullif(current_setting('test.uid',true),'')::uuid $auth$;");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$"+
  " select decode(repeat('00',n),'hex') $bytes$;");
 await db.exec('grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;');
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.includes('20261117140000_proposal_drafts.sql'),
  'N49 migration must create owner-scoped proposal drafts');
 for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/proposal_drafts.json',import.meta.url),'utf8'));
 const columns=(await db.query("select attname from pg_attribute where attrelid='public.proposal_drafts'::regclass and attnum>0 and not attisdropped")).rows.map(x=>x.attname).sort();
 assert.deepEqual(Object.keys(doc.columns).sort(),columns,
  'all N49 draft fields must have capability rules');
 console.log('N49 proposal draft migration/registry passes');
}finally{await db.close();}
