// N47.2.1: bounded owner read of live stale/fresh acknowledgements.
// Keeps N47.1's original full-migration regression unchanged.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const firstEntry='33333333-3333-3333-3333-333333333333';
const firstBlock='44444444-4444-4444-4444-444444444444';
const secondEntry='55555555-5555-5555-5555-555555555555';
const secondBlock='66666666-6666-6666-6666-666666666666';
const foreignEntry='77777777-7777-7777-7777-777777777777';
const foreignBlock='88888888-8888-8888-8888-888888888888';
const pair=(entry,block)=>[
  {kind:'entry',id:entry,version:1},{kind:'block',id:block,version:1},
];
const as=async user=>{
  await db.exec('reset role');
  await q("select set_config('request.jwt.claims','{}',false)");
  await q("select set_config('test.uid',$1,false)",[user]);
  await db.exec('set role authenticated');
};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(
    nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid)
   $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(names.includes('20261108001000_overlap_ack_read.sql'));
 assert.ok(names.includes('20261107120000_overlap_acknowledgements.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [id,user] of [[firstEntry,owner],[secondEntry,owner],[foreignEntry,other]]){
  await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Study')",[id,user]);
 }
 for(const [id,user] of [[firstBlock,owner],[secondBlock,owner],[foreignBlock,other]]){
  await q(`insert into public.calendar_blocks
    (id,user_id,kind,title,starts_at,ends_at,time_zone)
    values($1,$2,'study','Time block','2026-11-07T09:00:00Z',
    '2026-11-07T10:00:00Z','Asia/Kolkata')`,[id,user]);
 }
 const insert=async(user,participants,startsAt,disposition='keep_both',attributedTo=null)=>
   (await q(`insert into public.overlap_acknowledgements
    (user_id,participants,starts_at,ends_at,disposition,attributed_to)
    values($1,$2::jsonb,$3,'2026-11-07T11:30:00Z',$4,$5::jsonb)
    returning id,version`,[
      user,JSON.stringify(participants),startsAt,disposition,
      attributedTo===null?null:JSON.stringify(attributedTo),
    ]))[0];
 const first=await insert(owner,pair(firstEntry,firstBlock),'2026-11-07T09:15:00Z');
 const second=await insert(owner,pair(secondEntry,secondBlock),'2026-11-07T10:15:00Z',
   'attribute_to',{kind:'entry',id:secondEntry});
 const foreign=await insert(other,pair(foreignEntry,foreignBlock),'2026-11-07T10:30:00Z');
 assert.ok(first.id&&second.id&&foreign.id);
 await as(owner);
 const initial=await q('select * from public.overlap_acknowledgements_read()');
 assert.deepEqual(initial.map(x=>x.id),[second.id,first.id],
   'both acknowledgements remain visible in deterministic order');
 assert.deepEqual(initial.map(x=>x.stale),[false,false]);
 assert.equal(initial[0].disposition,'attribute_to');
 assert.equal(initial[0].version,1);
 assert.equal((await q('select id from public.overlap_acknowledgements_read(1,1)'))[0].id,
   first.id,'bounded offset is stable');
 assert.deepEqual((await q('select id from public.overlap_acknowledgements_read(1,0)')).map(x=>x.id),
   [second.id],'bounded first page does not hide remaining conflicts');
 await assert.rejects(
   q(`insert into public.overlap_acknowledgements
     (participants,starts_at,ends_at,disposition)
     values($1::jsonb,'2026-11-07T08:00:00Z','2026-11-07T09:00:00Z','keep_both')`,
     [JSON.stringify(pair(firstEntry,firstBlock))]),
   /permission denied|row.level security/i,'listing must not grant DML');
 await db.exec('reset role');
 await q('update public.study_entries set version=2 where id=$1',[firstEntry]);
 await as(owner);
 const updated=await q('select id,stale,version from public.overlap_acknowledgements_read()');
 assert.equal(updated.find(x=>x.id===first.id).stale,true,
   'changed participant invalidates only its acknowledgement');
 assert.equal(updated.find(x=>x.id===second.id).stale,false,
   'an independent acknowledged overlap remains current');
 assert.equal(updated.find(x=>x.id===first.id).version,1,
   'read recomputes stale without mutating the recorded version');
 await as(other);
 assert.deepEqual((await q('select id from public.overlap_acknowledgements_read()')).map(x=>x.id),
   [foreign.id],'RLS and auth.uid exclude the other owner');
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 assert.deepEqual(await q('select id from public.overlap_acknowledgements_read()'),[],
   'without an owner the invoker function returns no rows');
 assert.equal((await q("select count(*)::int n from public.overlap_acknowledgements"))[0].n,3,
   'the read never persists or removes acknowledgements');
 console.log('PASS N47.2.1 owner-scoped bounded stale/fresh overlap reads');
}finally{await db.close()}
