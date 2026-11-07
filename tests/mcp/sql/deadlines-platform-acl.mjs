// bug #1094: full-migration PGlite run under Supabase-style platform default privileges.
// Production grants every new public table to anon/authenticated by default, so `grant select`
// alone left browser DML privileges on public.deadlines. The owner fix migration revokes them.
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
   grant execute on function auth.uid() to authenticated;
   alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const migrations=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(migrations.includes('20261115130000_owner_fix_provenance_deadline_acl.sql'));
 for(const migration of migrations)await db.exec(await readFile(new URL(migration,dir),'utf8'));
 const acl=(await q(`select
   has_table_privilege('authenticated','public.deadlines','select') sel,
   has_table_privilege('authenticated','public.deadlines','insert') ins,
   has_table_privilege('authenticated','public.deadlines','update') upd,
   has_table_privilege('authenticated','public.deadlines','delete') del,
   has_table_privilege('authenticated','public.deadlines','truncate') trn,
   has_table_privilege('anon','public.deadlines','select') anon_sel,
   has_table_privilege('anon','public.deadlines','insert') anon_ins,
   has_table_privilege('service_role','public.deadlines','select') svc_sel`))[0];
 assert.deepEqual(acl,{sel:true,ins:false,upd:false,del:false,trn:false,anon_sel:false,anon_ins:false,svc_sel:true},
   'browsers may read their deadlines (owner RLS) but never write the table directly');
 console.log('PASS bug #1094 deadlines table privileges under platform default grants');
}finally{await db.close()}
