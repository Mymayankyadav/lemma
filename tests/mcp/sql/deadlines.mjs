// N42.1 SQL migration acceptance: fresh in-memory PGlite, no production access.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111',other='99999999-9999-9999-9999-999999999999';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function as(id){await db.exec('reset role');await q("select set_config('request.jwt.claims','{}',false)");await q("select set_config('test.uid',$1,false)",[id]);await db.exec('set role authenticated');}
async function admin(){await db.exec('reset role');await q("select set_config('test.uid','',false)");}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $uid$
 select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid)$uid$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as
 $bytes$select decode(repeat('00',n),'hex')$bytes$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.includes('20261107002500_v6_deadlines_schema.sql'));
 for(const f of files)await db.exec(await readFile(new URL(f,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 const columns=(await q("select attname from pg_attribute where attrelid='public.deadlines'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/deadlines.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(doc.columns).sort(),columns);
 assert.equal((await q("select count(*)::int n from public.lemma_undo_tables where table_name='deadlines'"))[0].n,1);
 assert.equal((await q("select relrowsecurity from pg_class where oid='public.deadlines'::regclass"))[0].relrowsecurity,true);
 assert.equal((await q("select count(*)::int n from pg_policies where tablename='deadlines'"))[0].n,4);
 const fk=await q("select conname,condeferrable from pg_constraint where conrelid='public.deadlines'::regclass and contype='f'");
 assert.ok(fk.filter(x=>x.conname.endsWith('_owner_fk')).length===3);
 assert.ok(fk.filter(x=>x.conname.endsWith('_owner_fk')).every(x=>x.condeferrable));
 await as(owner);
 const day=(await q("insert into public.deadlines(title,kind,due_date,remaining_minutes,estimate_source) values('Exam','exam','2026-11-08',120,'owner') returning *"))[0];
 assert.equal(day.user_id,owner);assert.equal(day.due_at,null);assert.equal(day.status,'open');assert.equal(day.version,1);
 const instant=(await q("insert into public.deadlines(title,due_at) values('Seminar','2026-11-09T18:00:00Z') returning *"))[0];
 assert.equal(instant.due_date,null);assert.ok(instant.due_at);
 for(const statement of [
  "insert into public.deadlines(title) values('Missing')",
  "insert into public.deadlines(title,due_date,due_at) values('Both','2026-11-08','2026-11-08T00:00Z')",
  "insert into public.deadlines(title,due_date,kind) values('Invalid','2026-11-08','birthday')",
  "insert into public.deadlines(title,due_date,remaining_minutes) values('No provenance','2026-11-08',20)",
  "insert into public.deadlines(title,due_date,remaining_minutes,estimate_source) values('Negative','2026-11-08',-1,'owner')",
  "insert into public.deadlines(title,due_date,status) values('Bad','2026-11-08','invented')",
 ])await assert.rejects(q(statement),/check constraint|violates check/i);
 await as(other);
 assert.equal((await q('select count(*)::int n from public.deadlines'))[0].n,0);
 assert.equal((await q('update public.deadlines set title=$1 where id=$2 returning id',['Foreign',day.id])).length,0);
 await assert.rejects(q('insert into public.deadlines(user_id,title,due_date) values($1,$2,$3)',[owner,'Spoof','2026-11-08']),/row-level security|permission denied/i);
 await admin();
 const logged=(await q("select a.no from public.actions a join public.action_changes c on c.action_no=a.no where c.table_name='deadlines' and c.row_pk @> $1::jsonb and c.op='insert' order by a.no desc limit 1",[JSON.stringify({id:day.id})]))[0];
 assert.ok(logged?.no);
 await as(owner);
 const undone=(await q('select public.undo_action($1::uuid,$2::bigint,false) value',[owner,logged.no]))[0].value;
 assert.equal(undone.undone,logged.no);
 assert.equal((await q('select count(*)::int n from public.deadlines where id=$1',[day.id]))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.deadlines where id=$1',[instant.id]))[0].n,1);
 console.log('PASS N42.1 additive deadlines schema, mutually exclusive due variants, owner isolation, journal and undo');
}finally{await db.close();}
