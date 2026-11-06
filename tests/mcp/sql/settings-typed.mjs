// N39 / D8(e): full-migration PGlite acceptance for typed owner settings.
// No connection to production Supabase. Existing rows are seeded BEFORE N39.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(statement,parameters=[])=>(await db.query(statement,parameters)).rows;
const migration='20261106214000_v6_typed_settings.sql';
const migrationDir=new URL('../../../supabase/migrations/',import.meta.url);
let beforeUpdated=null;
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $uid$
    select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid)$uid$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as
    $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const migrations=(await readdir(migrationDir)).filter(name=>name.endsWith('.sql')&&!name.includes('_storage')).sort();
 assert.ok(migrations.includes(migration),'N39 migration must exist');
 for(const file of migrations) {
  if(file===migration) {
   await q('insert into auth.users(id) values($1),($2)',[owner,other]);
   await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [owner,'1'.repeat(48)]);
   await q('insert into public.settings(user_id,connector_secret) values($1,$2)',
    [other,'2'.repeat(48)]);
   beforeUpdated=(await q('select updated_at from public.settings where user_id=$1',[owner]))[0].updated_at;
  }
  await db.exec(await readFile(new URL(file,migrationDir),'utf8'));
 }
 const rows=await q('select * from public.settings where user_id=$1',[owner]);
 assert.equal(rows.length,1,'migration preserves the pre-existing owner');
 const initial=rows[0];
 assert.equal(new Date(initial.updated_at).toISOString(),new Date(beforeUpdated).toISOString(),
  'migration never updates an existing settings record');
 assert.equal(initial.week_start,1);
 assert.equal(initial.clock_24h,true);
 const parsed=value=>typeof value==='string'?JSON.parse(value):value;
 const focus=parsed(initial.focus_defaults);
 assert.equal(focus.mode,'pomodoro');
 assert.deepEqual([focus.focus_minutes,focus.break_minutes,focus.long_break_minutes,focus.cycles],[25,5,15,4]);
 assert.equal(focus.flowtime_break_ratio,0.2,'Flowtime ratio is explicitly a ratio');
 assert.equal(focus.long_session_guard_minutes,120,'guard is in minutes, not legacy hours');
 const planning=parsed(initial.planning);
 assert.equal(planning.window_start,'09:00');
 assert.equal(planning.window_end,'22:00');
 assert.equal(planning.gap_minutes,10);
 assert.equal(planning.max_consecutive_minutes,180);
 assert.equal(planning.daily_minimum_qualifying_minutes,10);
 assert.equal(planning.daily_intention_enabled,false);
 assert.deepEqual(parsed(initial.review_budget),{cards:30,minutes:20,reserve_review_time:true});
 assert.deepEqual(parsed(initial.attention),{drift_prompts:false,urge_prompts:false});

 const invalid=async(column,value)=>assert.rejects(
   q(`update public.settings set ${column}=$1::jsonb where user_id=$2`,[JSON.stringify(value),owner]),
   /check constraint|violates check/i,`invalid ${column} ${JSON.stringify(value)} must be rejected`);
 const invalidCases={
  focus_defaults:[[],{mode:'timer'},{focus_minutes:0},{focus_minutes:241},{cycles:17},
   {break_minutes:-1},{long_break_minutes:181},{flowtime_break_ratio:0.01},
   {flowtime_break_ratio:1.01},{long_session_guard_minutes:29},{focus_minutes:2.5}],
  planning:[[],{window_start:'25:00'},{window_end:'9:00'},{gap_minutes:121},
   {max_consecutive_minutes:14},{daily_minimum_qualifying_minutes:1441},{daily_intention_enabled:'yes'}],
  review_budget:[[],{cards:2001},{cards:-1},{minutes:1441},{reserve_review_time:1}],
  attention:[[],{drift_prompts:'yes'},{urge_prompts:1}],
 };
 for(const [column,cases] of Object.entries(invalidCases))
  for(const value of cases)await invalid(column,value);
 await assert.rejects(q('update public.settings set week_start=7 where user_id=$1',[owner]),/check constraint|violates check/i);
 await assert.rejects(q('update public.settings set week_start=-1 where user_id=$1',[owner]),/check constraint|violates check/i);
 await q('update public.settings set week_start=0,clock_24h=false where user_id=$1',[owner]);
 let updated=(await q('select week_start,clock_24h from public.settings where user_id=$1',[owner]))[0];
 assert.deepEqual(updated,{week_start:0,clock_24h:false});
 await q('update public.settings set focus_defaults=focus_defaults || $1::jsonb where user_id=$2',
   [JSON.stringify({future_pref:{future_nested:true},mode:'flowtime'}),owner]);
 // A client with an older schema sends only its recognized field. The trigger
 // merges into the latest row rather than replacing unknown preference keys.
 await q('update public.settings set focus_defaults=$1::jsonb where user_id=$2',
   [JSON.stringify({focus_minutes:40}),owner]);
 await q('update public.settings set planning=$1::jsonb,review_budget=$2::jsonb,attention=$3::jsonb where user_id=$4',
   [JSON.stringify({gap_minutes:15}),JSON.stringify({cards:45}),JSON.stringify({drift_prompts:true}),owner]);
 updated=(await q('select focus_defaults,planning,review_budget,attention from public.settings where user_id=$1',[owner]))[0];
 assert.deepEqual(parsed(updated.focus_defaults).future_pref,{future_nested:true});
 assert.equal(parsed(updated.focus_defaults).mode,'flowtime');
 assert.equal(parsed(updated.focus_defaults).focus_minutes,40);
 assert.equal(parsed(updated.focus_defaults).break_minutes,5);
 assert.equal(parsed(updated.planning).window_start,'09:00');
 assert.equal(parsed(updated.planning).gap_minutes,15);
 assert.equal(parsed(updated.review_budget).cards,45);
 assert.equal(parsed(updated.review_budget).minutes,20);
 assert.equal(parsed(updated.attention).drift_prompts,true);
 assert.equal(parsed(updated.attention).urge_prompts,false);
 // Existing app/MCP setting writers may still patch their original scalar columns.
 await q('update public.settings set desired_retention=0.91,rollover_hour=5 where user_id=$1',[owner]);
 const legacy=(await q('select desired_retention,rollover_hour from public.settings where user_id=$1',[owner]))[0];
 assert.ok(Math.abs(legacy.desired_retention-0.91)<0.0001);
 assert.equal(legacy.rollover_hour,5);

 const second=(await q('select week_start,clock_24h,focus_defaults from public.settings where user_id=$1',[other]))[0];
 assert.equal(second.week_start,1);
 assert.equal(second.clock_24h,true);
 assert.equal(parsed(second.focus_defaults).focus_minutes,25,
  'independent owner settings must not change from another owner update');
 console.log('PASS N39 typed settings: defaults, bounds, JSON extension keys, existing writers and owner separation');
} finally {await db.close();}
