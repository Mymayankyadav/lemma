// bug #1231: the static command manifest mirrors public.lemma_command_resources resource-for-resource
// (operations and fields), so N94 and readers cannot rely on a stale list.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema extensions;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $auth$
    select nullif(current_setting('test.uid',true),'')::uuid $auth$;
   create function extensions.gen_random_bytes(n int) returns bytea language sql as
     $bytes$select decode(repeat('00',n),'hex')$bytes$;
   grant usage on schema auth to authenticated;
   grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 for(const migration of migrations)await db.exec(await readFile(new URL(migration,dir),'utf8'));
 // The static manifest mirrors the database registry exactly.
 const manifest=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/lemma_command_resources.json',import.meta.url),'utf8'));
 const live=await q(`select resource,command_fn,mcp_ok,"schema" from public.lemma_command_resources order by resource`);
 const norm=r=>({resource:r.resource,command_fn:r.command_fn,mcp_ok:r.mcp_ok,
  operations:[...r.schema.operations].sort(),fields:[...r.schema.fields].sort()});
 assert.deepEqual([...manifest.resources].map(norm).sort((a,b)=>a.resource<b.resource?-1:1),live.map(norm),
  'docs/v6/capability-registry/lemma_command_resources.json must mirror public.lemma_command_resources');
 console.log('PASS bug #1231 static command manifest mirrors the database registry');
}finally{await db.close();}
