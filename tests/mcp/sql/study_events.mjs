// N50.1: full-migration PGlite owner-safe study events and validations.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const entry='33333333-3333-3333-3333-333333333333';
const otherEntry='44444444-4444-4444-4444-444444444444';
const at='2026-11-07T10:00:00Z';
const add=async({
 user_id=owner,entry_id=entry,kind='notice',occurred_at=at,
 duration_minutes=null,note=null,voided_at=null
}={})=>q(
 'insert into public.study_events(user_id,entry_id,kind,occurred_at,duration_minutes,note,voided_at) values($1,$2,$3,$4,$5,$6,$7) returning *',
 [user_id,entry_id,kind,occurred_at,duration_minutes,note,voided_at]);
const bad=async(data)=>assert.rejects(add(data),/constraint|violates|permission denied|row-level security/i);
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
   nullif(current_setting('test.uid',true),'')::uuid)$auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(names.includes('20261107120116_study_events.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 // Each owner write uses a distinct statement/txid: an action must never mix owners.
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Own focus')",
  [entry,owner]);
 await q("insert into public.study_entries(id,user_id,source,intent) values($1,$2,'manual','Other focus')",
  [otherEntry,other]);
 const notice=(await add())[0];
 const drift=(await add({kind:'drift',duration_minutes:17,note:'Time lost'}))[0];
 const urge=(await add({kind:'urge',note:'Noticed and resumed'}))[0];
 const theirs=(await add({user_id:other,entry_id:otherEntry,kind:'notice'}))[0];
 assert.equal(notice.version,1);assert.equal(drift.duration_minutes,17);
 assert.equal(urge.duration_minutes,null);assert.equal(theirs.user_id,other);
 assert.equal(notice.voided_at,null);
 assert.ok(notice.created_at&&notice.updated_at);
 await bad({kind:'unknown'});
 await bad({kind:'notice',duration_minutes:1});
 await bad({kind:'urge',duration_minutes:1});
 await bad({kind:'drift',duration_minutes:0});
 await bad({kind:'drift',duration_minutes:-1});
 await bad({kind:'drift',duration_minutes:100001});
 await bad({entry_id:otherEntry});
 await bad({note:'x'.repeat(2001)});
 const touch=(await q('update public.study_events set voided_at=now() where id=$1 returning *',
  [drift.id]))[0];
 assert.ok(touch.voided_at);assert.equal(touch.version,2);
 const audit=await q("select count(*)::int n from public.action_changes where table_name='study_events'");
 assert.equal(audit[0].n,5,'four inserts and the void update are journalled');
 const count=(await q("select count(*)::int n from public.study_events where voided_at is null"))[0].n;
 assert.equal(count,3,'voided rows are excluded from active tallies');
 await db.exec(`select set_config('test.uid','${owner}',false);set role authenticated;`);
 const visible=await q('select id from public.study_events order by id');
 assert.deepEqual(visible.map(x=>x.id).sort(),[notice.id,drift.id,urge.id].sort());
 await bad({kind:'notice'});
 await db.exec(`reset role;select set_config('test.uid','${other}',false);set role authenticated;`);
 assert.deepEqual((await q('select id from public.study_events')).map(x=>x.id),[theirs.id]);
 await db.exec('reset role');
 const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/study_events.json',import.meta.url),'utf8'));
 const cols=(await q("select attname from pg_attribute where attrelid='public.study_events'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname);
 assert.deepEqual(Object.keys(docs.columns).sort(),cols.sort(),'registry covers every column');
 const policies=await q("select policyname from pg_policies where tablename='study_events'");
 assert.deepEqual(policies.map(x=>x.policyname),['study_events_owner_read']);
 // bug #1109: the generic undo path restores the exact prior version and timestamp;
 // every other update still advances them.
 const before=(await q('select version,updated_at from public.study_events where id=$1',[drift.id]))[0];
 const restored=(await q(`with c as (select set_config('lemma.tool','undo',true))
   update public.study_events set version=1,voided_at=null,updated_at='2026-11-01T00:00:00Z'
   from c where id=$1 returning version,voided_at,updated_at`,[drift.id]))[0];
 assert.equal(restored.version,1,'undo keeps the restored version');
 assert.equal(restored.voided_at,null);
 assert.equal(new Date(restored.updated_at).toISOString(),'2026-11-01T00:00:00.000Z','undo keeps the restored timestamp');
 const ordinary=(await q(`with c as (select set_config('lemma.tool','study',true))
   update public.study_events set version=1 from c where id=$1 returning version,updated_at`,[drift.id]))[0];
 assert.equal(ordinary.version,2,'an ordinary update still advances the version and ignores a caller-supplied one');
 assert.ok(new Date(ordinary.updated_at)>new Date('2026-11-02T00:00:00Z'));
 assert.ok(before.version>=1);

 console.log('PASS N50.1 notices, drift-only durations, audit/void, FK and owner RLS');
}finally{await db.close()}
