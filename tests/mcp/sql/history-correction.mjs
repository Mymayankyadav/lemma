// N91 history metadata acceptance. Owner correction commands will extend this
// same full-migration regression before the PR can be marked Ready.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const param='33333333-3333-4333-8333-333333333333';
try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions; create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select nullif(current_setting('test.uid',true),'')::uuid $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert(names.includes('20261116010000_n91_history_correction.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 const columns=async table=>(await q("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",['public.'+table])).map(x=>x.attname);
 for(const field of ['occurred_at','superseded_by','voided_at','correction_reason','actor'])
  assert((await columns('session_events')).includes(field),'missing event field '+field);
 for(const field of ['scheduler_version','params_id','operation_id'])
  assert((await columns('reviews')).includes(field),'missing review field '+field);
 const privileges=(await q("select has_table_privilege('authenticated','public.review_parameter_sets','SELECT') read,has_table_privilege('authenticated','public.review_parameter_sets','INSERT') write,has_table_privilege('authenticated','public.review_parameter_sets','TRUNCATE') truncate"))[0];
 assert.equal(privileges.read,true);
 assert.equal(privileges.write,false);
 assert.equal(privileges.truncate,false);
 await q('insert into public.review_parameter_sets(id,user_id,scheduler_version,params) values($1,$2,$3,$4::jsonb)',[param,owner,'fsrs-v1',JSON.stringify({weights:Array(21).fill(1)})]);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[other]);
 assert.equal((await q('select count(*)::int n from public.review_parameter_sets'))[0].n,0);
 await assert.rejects(q("insert into public.review_parameter_sets(scheduler_version,params) values('forged','{}')"),/permission denied|row.level security/i);
 await q("select set_config('test.uid',$1,false)",[owner]);
 assert.equal((await q('select count(*)::int n from public.review_parameter_sets'))[0].n,1);
 await db.exec('reset role');
 const registry=(await q("select count(*)::int n from public.lemma_undo_tables where table_name='review_parameter_sets'"))[0].n;
 assert.equal(registry,1);
 console.log('PASS N91 owner-scoped historical metadata and parameter snapshots');
}finally{await db.close()}
