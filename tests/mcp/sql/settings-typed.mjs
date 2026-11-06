// N39: full-migration PGlite check. No real Supabase connection or credentials.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const sql=async(text,values=[]) => (await db.query(text,values)).rows;
const dir=new URL('../../../supabase/migrations/',import.meta.url);
const name='20261106213000_v6_typed_settings.sql';
const owner='c7e497a4-1f7b-4764-a567-fd0c7fd68327';
const json=value=>typeof value==='string'?JSON.parse(value):value;
const update=(column,value)=>sql('update public.settings set '+column+'=$1::jsonb where user_id=$2',
  [JSON.stringify(value),owner]);
async function reject(column,value){
  await assert.rejects(update(column,value),
    /check constraint|violates check|numeric field overflow/i,
    column+' rejected '+JSON.stringify(value));
}
try {
 await db.exec([
  'create role anon; create role authenticated; create role service_role;',
  'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;',
 ].join('\n'));

 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert.ok(files.includes(name),'typed settings migration must be present');
 for(const file of files.filter(f=>f!==name))
  await db.exec(await readFile(new URL(file,dir),'utf8'));

 // Existing settings must pick up defaults without UPDATE or row rewriting.
 await sql('insert into auth.users(id) values($1)',[owner]);
 await sql('insert into public.settings(user_id) values($1)',[owner]);
 const before=(await sql('select created_at,updated_at,new_per_day from public.settings where user_id=$1',[owner]))[0];
 await db.exec(await readFile(new URL(name,dir),'utf8'));
 const row=(await sql('select * from public.settings where user_id=$1',[owner]))[0];
 assert.equal(row.week_start,1);
 assert.equal(row.clock_24h,true);
 assert.deepEqual(json(row.focus_defaults),{
  mode:'pomodoro',focus_minutes:25,break_minutes:5,long_break_minutes:15,
  cycles:4,flowtime_break_ratio:0.2,long_session_guard_minutes:120
 });
 assert.deepEqual(json(row.planning),{
  window_start:'08:00',window_end:'22:00',gap_minutes:10,
  max_consecutive_minutes:120,daily_minimum_minutes:20,daily_intention:true
 });
 assert.deepEqual(json(row.review_budget),{cards:20,minutes:20,reserve_in_plans:true});
 assert.deepEqual(json(row.attention),{drift_prompt:false,urge_prompt:false});
 assert.equal(row.new_per_day,before.new_per_day);
 assert.equal(new Date(row.created_at).getTime(),new Date(before.created_at).getTime());
 assert.equal(new Date(row.updated_at).getTime(),new Date(before.updated_at).getTime());

 for(const weekday of [-1,7])
  await assert.rejects(sql('update public.settings set week_start=$1 where user_id=$2',[weekday,owner]),/check constraint/i);
 for(const weekday of [0,6])
  await sql('update public.settings set week_start=$1 where user_id=$2',[weekday,owner]);
 await sql('update public.settings set clock_24h=false where user_id=$1',[owner]);

 // Exercise both boundaries, below/above, incorrect types, and fractional
 // values of EVERY unit-bearing integer setting. Patches use SQL UPDATE,
 // not an app-specific client-side validator.
 const numbers=[
  ['focus_defaults','focus_minutes',1,240],
  ['focus_defaults','break_minutes',1,120],
  ['focus_defaults','long_break_minutes',1,240],
  ['focus_defaults','cycles',1,24],
  ['focus_defaults','long_session_guard_minutes',30,720],
  ['planning','gap_minutes',0,120],
  ['planning','max_consecutive_minutes',15,600],
  ['planning','daily_minimum_minutes',0,600],
  ['review_budget','cards',0,2000],
  ['review_budget','minutes',0,720]
 ];
 for(const [section,key,min,max] of numbers){
  for(const invalid of [min-1,max+1,1.5,'10',null,true])
   await reject(section,{[key]:invalid});
  for(const valid of [min,max])await update(section,{[key]:valid});
 }
 for(const invalid of ['unknown',null,1])await reject('focus_defaults',{mode:invalid});
 for(const valid of ['pomodoro','flowtime','open'])
  await update('focus_defaults',{mode:valid});
 for(const invalid of [0,-0.2,1.01,2,'0.4',null,true])
  await reject('focus_defaults',{flowtime_break_ratio:invalid});
 for(const valid of [0.01,1])await update('focus_defaults',{flowtime_break_ratio:valid});
 for(const key of ['window_start','window_end']){
  for(const invalid of ['24:00','22:60','9:00','noon',null,24])
   await reject('planning',{[key]:invalid});
  for(const valid of ['00:00','23:59'])
   await update('planning',{[key]:valid});
 }
 for(const [section,keys] of [
  ['planning',['daily_intention']],
  ['review_budget',['reserve_in_plans']],
  ['attention',['drift_prompt','urge_prompt']]
 ]){
  for(const key of keys){
   for(const invalid of [0,'true',null,{}])
    await reject(section,{[key]:invalid});
   for(const valid of [true,false])await update(section,{[key]:valid});
  }
 }
 for(const column of ['focus_defaults','planning','review_budget','attention']){
  await reject(column,[]);
  await reject(column,null);
  await reject(column,{future_key:'x'.repeat(5000)});
 }

 // A later writer can replace a JSON section with a tiny patch without losing
 // any unknown or nested keys, nor old typed keys it did not modify.
 await update('planning',{future:{nested:{alpha:'keep',beta:1}},gap_minutes:11});
 await update('planning',{gap_minutes:30,future:{nested:{beta:2}}});
 const merged=json((await sql('select planning from public.settings where user_id=$1',[owner]))[0].planning);
 assert.equal(merged.future.nested.alpha,'keep');
 assert.equal(merged.future.nested.beta,2);
 assert.equal(merged.gap_minutes,30);
 assert.equal(merged.max_consecutive_minutes,600);

 // Existing app/MCP-style scalar settings updates still work as before.
 await sql('update public.settings set default_style=$1,new_per_day=$2 where user_id=$3',
  ['direct',15,owner]);
 const legacy=(await sql('select default_style,new_per_day from public.settings where user_id=$1',[owner]))[0];
 assert.equal(legacy.default_style,'direct');
 assert.equal(legacy.new_per_day,15);

 const doc=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/settings.json',import.meta.url),'utf8'));
 for(const key of ['week_start','clock_24h','focus_defaults','planning','review_budget','attention']){
  assert.equal(doc.columns[key].classification,'owner-editable');
  assert.ok(doc.columns[key].appPath&&doc.columns[key].mcpPath);
 }
 for(const [section,key] of numbers){
  assert.ok(doc.columns[section].fields[key].unit,'undocumented unit '+section+'.'+key);
 }
 console.log('PASS N39 typed settings defaults, bounds, JSON preservation, existing writes and registry');
} finally {await db.close()}
