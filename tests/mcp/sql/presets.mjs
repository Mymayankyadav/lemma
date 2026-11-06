// N41.1: full-migration in-memory PGlite schema, RLS and audit acceptance.
// The N41.2 test covers operation receipts, undo and MCP once command exists.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const migrations=new URL('../../../supabase/migrations/',import.meta.url);
const ownerA='11111111-1111-1111-1111-111111111111';
const ownerB='22222222-2222-2222-2222-222222222222';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const bad=async(sql,values=[])=>assert.rejects(q(sql,values),/violates|constraint|permission denied|row.level security/i);
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
     nullif(current_setting('test.uid',true),'')::uuid) $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
   $bytes$ select decode(repeat('00',n),'hex') $bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const names=(await readdir(migrations)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(names.includes('20261106230000_activity_presets.sql'));
 for(const name of names)await db.exec(await readFile(new URL(name,migrations),'utf8'));

 await q('insert into auth.users(id) values ($1)',[ownerA]);
 await q('insert into auth.users(id) values ($1)',[ownerB]);
 const mine=(await q('insert into public.presets(user_id,label) values($1,$2) returning *',
   [ownerA,'Algebra review']))[0];
 const theirs=(await q('insert into public.presets(user_id,label) values($1,$2) returning *',
   [ownerB,'Biology session']))[0];
 assert.ok(mine.id&&theirs.id&&mine.id!==theirs.id);
 assert.equal(mine.mode,'pomodoro');
 assert.deepEqual([mine.focus_minutes,mine.break_minutes,mine.long_break_minutes,mine.cycles],
  [25,5,15,4]);
 assert.deepEqual([mine.version,mine.position,mine.source],[1,0,'app']);
 assert.equal(mine.archived_at,null);
 assert.ok(mine.created_at&&mine.updated_at);

 const invalid=[
  ['mode','unknown'],['focus_minutes',0],['focus_minutes',481],
  ['break_minutes',0],['break_minutes',181],
  ['long_break_minutes',0],['long_break_minutes',241],['cycles',0],
  ['cycles',25],['position',-1],['version',0],['source','browser'],
 ];
 await bad('update public.presets set label=$1 where id=$2',[' ',mine.id]);
 for(const [field,value] of invalid) {
  await bad(`insert into public.presets(user_id,label,${field}) values($1,$2,$3)`,
   [ownerA,'Invalid preset',value]);
 }
 // Owner-composite link cannot point to a different owner's subject.
 const otherSubject='33333333-3333-3333-3333-333333333333';
 await q('insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,$3,$4,$5)',
  [otherSubject,ownerB,'Biology','B','lime']);
 await bad('insert into public.presets(user_id,label,subject_id) values($1,$2,$3)',
  [ownerA,'Cross-owner link',otherSubject]);

 // Read and write access is owner-scoped for authenticated callers.
 await db.exec(`select set_config('test.uid','${ownerA}',false); set role authenticated;`);
 const visible=await q('select id from public.presets order by id');
 assert.deepEqual(visible.map(row=>row.id),[mine.id]);
 await bad('insert into public.presets(user_id,label) values($1,$2)',
   [ownerB,'Spoofed owner']);
 const blocked=await q('update public.presets set label=$1 where id=$2 returning id',
   ['Cross-owner edit',theirs.id]);
 assert.deepEqual(blocked,[],'RLS hides another owner from UPDATE');
 await db.exec('reset role');

 const changed=(await q('update public.presets set label=$1,archived_at=now() where id=$2 returning *',
   ['Algebra archived',mine.id]))[0];
 assert.equal(changed.label,'Algebra archived');
 assert.ok(changed.archived_at);
 assert.equal((await q("select count(*)::int n from public.action_changes where table_name='presets'"))[0].n,3,
  'both inserts and archived update are journaled without changing unrelated owners');
 // The N55 demo/live input validator permits these exact maximums.
 // Persist them in SQL rather than silently rejecting a valid app command.
 const upper=(await q('update public.presets set focus_minutes=$1,break_minutes=$2,long_break_minutes=$3,cycles=$4,position=$5 where id=$6 returning *',
   [480,180,240,24,2147483647,mine.id]))[0];
 assert.deepEqual([upper.focus_minutes,upper.break_minutes,upper.long_break_minutes,upper.cycles,upper.position],
  [480,180,240,24,2147483647]);
 const lower=(await q('update public.presets set focus_minutes=$1,break_minutes=$2,long_break_minutes=$3,cycles=$4,position=$5 where id=$6 returning *',
   [1,1,1,1,0,mine.id]))[0];
 assert.deepEqual([lower.focus_minutes,lower.break_minutes,lower.long_break_minutes,lower.cycles,lower.position],
  [1,1,1,1,0]);
 await bad('update public.presets set focus_minutes=$1 where id=$2',[481,mine.id]);
 await bad('update public.presets set break_minutes=$1 where id=$2',[0,mine.id]);
 await bad('update public.presets set long_break_minutes=$1 where id=$2',[241,mine.id]);
 await bad('update public.presets set cycles=$1 where id=$2',[25,mine.id]);
 await bad('update public.presets set position=$1 where id=$2',[-1,mine.id]);
 const fks=await q("select conname,condeferrable from pg_constraint where conrelid='public.presets'::regclass and contype='f'");
 assert.equal(fks.filter(x=>x.condeferrable).length,3,'all owner-composite references are deferrable');
 const table=await q("select relrowsecurity from pg_class where oid='public.presets'::regclass");
 assert.equal(table[0].relrowsecurity,true);
 const policies=await q("select policyname from pg_policies where tablename='presets'");
 assert.ok(policies.some(x=>x.policyname==='presets_owner'));
 // N41.2 activates the reviewed command/undo registry entry, not an
 // unimplemented dispatcher target in this migration.
 const registry=await q("select count(*)::int n from public.lemma_command_resources where resource='presets'");
 assert.equal(registry[0].n,0);
 console.log('PASS N41.1 activity presets schema, defaults, FKs, owner RLS, validation and action journal');
} finally {await db.close();}
