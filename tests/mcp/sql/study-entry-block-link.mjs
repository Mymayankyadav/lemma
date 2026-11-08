// N106 owner-composite study-entry -> calendar-block FK, full migrations.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
try{
 await db.exec("create role anon;create role authenticated;create role service_role;"+
  "create schema auth;create schema extensions;create table auth.users(id uuid primary key);"+
  "create function auth.uid() returns uuid language sql as $id$ select nullif(current_setting('test.uid',true),'')::uuid $id$;"+
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;"+
  "grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert(files.includes('20261120110000_study_entry_calendar_block.sql'));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[a,b]);
 const makeBlock=async(owner)=>(
  await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) "+
    "values($1,'study','Study','2026-11-08T10:00:00Z','2026-11-08T11:00:00Z','UTC') returning id",[owner])
 )[0].id;
 const ownBlock=await makeBlock(a),foreignBlock=await makeBlock(b);
 const draft=(await q("insert into public.study_entries(user_id,source,status) values($1,'timer','draft') returning id",[a]))[0].id;
 await q("select set_config('test.uid',$1,false)",[a]);
 await db.exec('set role authenticated');
 await q("update public.study_entries set calendar_block_id=$1 where id=$2",[ownBlock,draft]);
 assert.equal((await q("select calendar_block_id from public.study_entries where id=$1",[draft]))[0].calendar_block_id,ownBlock);
 await assert.rejects(q("update public.study_entries set calendar_block_id=$1 where id=$2",[foreignBlock,draft]),
  /foreign key|violates|not present/);
 assert.equal((await q("select calendar_block_id from public.study_entries where id=$1",[draft]))[0].calendar_block_id,ownBlock);
 await assert.rejects(q("insert into public.study_entries(user_id,source,status,calendar_block_id) values($1,'timer','draft',$2)",[a,foreignBlock]),
  /foreign key|violates|not present/);
 const direct=(await q("insert into public.study_entries(user_id,source,status) values($1,'timer','draft') returning calendar_block_id",[a]))[0];
 assert.equal(direct.calendar_block_id,null,'legacy unlinked draft still allowed');
 await db.exec('reset role');
 await q('delete from public.calendar_blocks where id=$1',[ownBlock]);
 assert.equal((await q("select calendar_block_id from public.study_entries where id=$1",[draft]))[0].calendar_block_id,null,
  'removing the calendar block clears only the optional link');
 console.log('PASS N106 owner-composite FK, foreign owner denial and nullable legacy entries');
}finally{await db.close();}
