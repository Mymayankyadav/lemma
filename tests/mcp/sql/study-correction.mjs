// N51: PGlite regression, additive study entry and task-link schema.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $uid$
   select nullif(current_setting('test.uid',true),'')::uuid $uid$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
   $bytes$ select decode(repeat('00',n),'hex') $bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(names.includes('20261115120000_study_command_v2.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
 for(const [table,column] of [['study_entries','approximate'],['study_entries','voided_at'],['calendar_blocks','task_id']]){
  assert.equal((await q('select count(*)::int n from information_schema.columns where table_schema=\'public\' and table_name=$1 and column_name=$2',[table,column]))[0].n,1);
  const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/'+table+'.json',import.meta.url),'utf8'));
  const columns=(await q('select attname from pg_attribute where attrelid=($1)::regclass and attnum>0 and not attisdropped',['public.'+table])).map(x=>x.attname).sort();
  assert.deepEqual(Object.keys(docs.columns).sort(),columns);
 }
 assert.equal((await q("select condeferrable from pg_constraint where conname='calendar_blocks_task_owner_fk'"))[0].condeferrable,true);
 console.log('PASS N51 additive saved-entry and owner task-link schema');
}finally{await db.close()}
