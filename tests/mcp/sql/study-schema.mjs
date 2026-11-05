// N10 isolated PGlite acceptance: never connect to production.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const a='11111111-1111-1111-1111-111111111111';
const b='99999999-9999-9999-9999-999999999999';
const subject='22222222-2222-2222-2222-222222222222';
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const as=async(id)=>{await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[id]);await db.exec('set role authenticated')};
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create schema extensions; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
   await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values ($1),($2)',[a,b]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values ($1,$2,'Math','M','amber')",[subject,a]);
 await as(a);
 const entry=(await q("insert into public.study_entries(subject_id,source,status,intent) values ($1,'timer','running','Proof') returning id",[subject]))[0].id;
 assert.equal((await q('select count(*)::int n from public.study_entries'))[0].n,1);
 await assert.rejects(q("insert into public.study_entries(source,status) values ('timer','paused')"),/unique constraint/);
 const interval=(await q("insert into public.study_intervals(entry_id,kind,started_at,ended_at) values ($1,'focus',now()-interval '10 minutes',now()) returning id",[entry]))[0].id;
 await assert.rejects(q("insert into public.study_intervals(entry_id,kind,started_at,ended_at) values ($1,'focus',now(),now()-interval '1 minute')",[entry]),/check constraint/);
 await q("update public.study_intervals set kind='break' where id=$1",[interval]);
 assert.equal((await q('select kind from public.study_intervals where id=$1',[interval]))[0].kind,'break');
 const block=(await q("insert into public.calendar_blocks(kind,title,starts_at,ends_at,time_zone,subject_id) values ('study','Read',now(),now()+interval '1 hour','Asia/Kolkata',$1) returning id",[subject]))[0].id;
 await q("update public.calendar_blocks set status='done' where id=$1",[block]);
 assert.equal((await q('select status from public.calendar_blocks where id=$1',[block]))[0].status,'done');
 await q("insert into public.command_receipts(operation_id,resource,result) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','study_entries','{}')");
 await assert.rejects(q("insert into public.command_receipts(operation_id,resource,result) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','study_entries','{}')"),/unique constraint/);
 await as(b);
 for(const table of ['study_entries','study_intervals','calendar_blocks','command_receipts'])
   assert.equal((await q(`select count(*)::int n from public.${table}`))[0].n,0,table+' hidden');
 await assert.rejects(q("insert into public.study_entries(subject_id,source) values ($1,'manual')",[subject]),/foreign key|row-level security/);
 await assert.rejects(q("insert into public.calendar_blocks(kind,title,starts_at,ends_at,time_zone,subject_id) values ('busy','X',now(),now()+interval '1 hour','UTC',$1)",[subject]),/foreign key|row-level security/);
 assert.equal((await q('update public.study_entries set intent=\'stolen\' where id=$1 returning id',[entry])).length,0);
 assert.equal((await q('delete from public.calendar_blocks where id=$1 returning id',[block])).length,0);
 await assert.rejects(q("insert into public.study_intervals(entry_id,kind,started_at) values ($1,'focus',now())",[entry]),/foreign key|row-level security/);
 await as(a);
 await q('delete from public.study_intervals where id=$1',[interval]);
 await q('delete from public.calendar_blocks where id=$1',[block]);
 await q('delete from public.command_receipts');
 await q('update public.study_entries set status=\'saved\' where id=$1',[entry]);
 await q('delete from public.study_entries where id=$1',[entry]);
 assert.equal((await q('select count(*)::int n from public.study_entries'))[0].n,0);
 console.log('PASS N10 owner CRUD, cross-owner links, active uniqueness and interval bounds');
} finally {await db.close()}
