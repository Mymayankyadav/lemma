// N169: the manual down script restores the previous functions and removes only what N169 added; up → down → up is stable.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const U=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const shape=async()=>q(`select 'col' k,table_name||'.'||column_name x from information_schema.columns where table_schema='public'
  union all select 'fn',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all select 'tbl',tablename from pg_tables where schemaname='public' order by 1,2`);
try{
 await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions; create table auth.users(id uuid primary key)");
 await db.exec("create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$");
 await db.exec("create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$");
 await db.exec("grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated");
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 const mine=names.filter(n=>n.startsWith('20261216')&&n.includes('_n169_'));
 assert.equal(mine.length,7,'the seven N169 migrations');
 const earlier=names.filter(n=>!mine.includes(n));
 for(const n of earlier)await db.exec(await readFile(new URL(n,dir),'utf8'));
 const before=await shape();
 // data that must survive the round trip
 await q('insert into auth.users(id) values($1)',[owner]);
 await q("insert into public.settings(user_id,connector_secret) values($1,$2)",[owner,'a'.repeat(48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','cyan')",[U(1),owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'pp','P','G')",[U(2),owner,U(1)]);
 await q("insert into public.checkpoints(id,user_id,project_id,code,position,title,objective,criterion,steps) values($1,$2,$3,'CP1',1,'T','O','C','[\"a\"]')",[U(3),owner,U(2)]);
 for(const n of mine)await db.exec(await readFile(new URL(n,dir),'utf8'));
 const up=await shape();
 assert.ok(up.length>before.length);
 assert.equal((await q("select count(*)::int n from public.checkpoints where kind='learn' and plan_state='active'"))[0].n,1,'existing rows get the defaults');
 await db.exec(await readFile(new URL('../../../supabase/rollback/N169.down.sql',import.meta.url),'utf8'));
 assert.deepEqual(await shape(),before,'the down script removes exactly what N169 added');
 assert.equal((await q('select count(*)::int n from public.checkpoints'))[0].n,1,'existing data is untouched');
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name in ('evidence','capacity_overrides','recheck_decisions','plan_baselines')"))[0].n,0);
 // the restored save_progress is the legacy one: a demonstrated checkpoint schedules the old +3 day recheck
 await q("insert into public.sessions(id,user_id,project_id,number,goal,style,checkpoint_id) values($1,$2,$3,1,'g','s',$4)",[U(4),owner,U(2),U(3)]);
 await q("select public.save_progress($1,$2,$3,$4::jsonb)",[owner,U(2),U(4),JSON.stringify({events:[{kind:'evidence',text:'ok',outcome:'demonstrated'}]})]);
 assert.ok((await q("select recheck_due from public.checkpoints where id=$1",[U(3)]))[0].recheck_due,'legacy behaviour is back');
 // up again
 for(const n of mine)await db.exec(await readFile(new URL(n,dir),'utf8'));
 assert.deepEqual(await shape(),up,'up → down → up gives the same schema');
 console.log('PASS N169 rollback: restores previous functions, removes only N169 objects, up/down/up stable');
}finally{await db.close()}
