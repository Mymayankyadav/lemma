// N103: owner cascade and browser-denied deletion request SQL contracts.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const A='11111111-1111-1111-1111-111111111111';
const B='22222222-2222-2222-2222-222222222222';
try{
 await db.exec('create role anon;create role authenticated;create role service_role;'+
  'create schema auth;create schema extensions;'+
  'create table auth.users(id uuid primary key)');
 await db.exec("create function auth.uid() returns uuid language sql as $auth$"+
  "select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,"+
  "nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql "+
  "as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated;"+
  "grant execute on function auth.uid() to authenticated");
 const directory=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(directory)).filter(n=>n.endsWith('.sql')&&
  !n.includes('_storage')).sort();
 assert(names.includes('20261120010000_account_delete_guard.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,directory),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[A,B]);
 for(const id of [A,B])
  await q("insert into public.settings(user_id,connector_secret) values($1,$2)",
   [id,id===A?'a'.repeat(48):'b'.repeat(48)]);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[A]);
 assert.equal((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,true);
 await assert.rejects(q('select public.lemma_begin_account_delete($1::uuid)',[A]),
  /permission denied|Service role required/);
 await assert.rejects(q("insert into public.account_deletion_requests(user_id) values($1)",[A]),
  /permission denied|row.level security/);
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await db.exec('set role service_role');
 await q('select public.lemma_begin_account_delete($1::uuid)',[A]);
 await q('select public.lemma_begin_account_delete($1::uuid)',[A]);
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,1);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[A]);
 assert.equal((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,false);
 assert.equal((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,1);
 await q("select set_config('test.uid',$1,false)",[B]);
 assert.equal((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,true);
 assert.equal((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,0);
 await db.exec('reset role');
 await q('delete from auth.users where id=$1',[A]);
 assert.equal((await q('select count(*)::int n from public.settings where user_id=$1',[A]))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.settings where user_id=$1',[B]))[0].n,1);
 assert.equal((await q('select count(*)::int n from public.account_deletion_requests'))[0].n,0);
 await db.exec('set role authenticated');
 await q("select set_config('test.uid',$1,false)",[A]);
 assert.equal((await q('select public.lemma_storage_owner_can_write() ok'))[0].ok,false,
  'stale JWT must not re-enable Storage writes after Auth deletion');
 await db.exec('reset role');
 const source=await readFile(new URL('../../../supabase/functions/account-delete/index.ts',import.meta.url),'utf8');
 assert(source.includes("admin.auth.getUser(token)"));
 assert(source.includes("admin.storage.from(bucket.id)"));
 assert(source.includes("storage.remove(paths.slice(i,i+100))"));
 assert(source.includes("admin.auth.admin.deleteUser(userId,false)"));
 assert(!source.includes("delete from storage.objects"));
 console.log('PASS N103 service-only begin, owner RLS isolation, auth cascade, stale-JWT Storage guard and Storage API');
}finally{await db.close()}
