// N52 PGlite stage: captures the owner preset/default at first timer start.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const owner='11111111-1111-1111-1111-111111111111';
const other='22222222-2222-2222-2222-222222222222';
const mkOp=n=>'bbbbbbbb-bbbb-4bbb-8bbb-'+String(n).padStart(12,'0');
try{
 await db.exec([
  'create role anon; create role authenticated; create role service_role;',
  'create schema auth;create schema extensions;create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $uid$ select nullif(current_setting('test.uid',true),'')::uuid $uid$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort();
 assert.ok(files.includes('20261116120000_study_timer_modes.sql'));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 const docs=JSON.parse(await readFile(new URL('../../../docs/v6/capability-registry/study_entries.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.study_entries'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.deepEqual(Object.keys(docs.columns).sort(),columns,'all timer columns inventoried');
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'a'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'b'.repeat(48)]);
 const preset=(await q("insert into public.presets(user_id,label,mode,focus_minutes,break_minutes,cycles) values($1,'Proofs','pomodoro',18,7,3) returning id",[owner]))[0].id;
 const foreign=(await q("insert into public.presets(user_id,label,mode) values($1,'Foreign','open') returning id",[other]))[0].id;
 const draft=(await q("insert into public.study_entries(user_id,source,status,preset_id,intent) values($1,'timer','draft',$2,'Timer with preset') returning id",[owner,preset]))[0].id;
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const start={schemaVersion:1,resource:'study_entries',operation:'start',operationId:mkOp(1),
   target:{id:draft},expectedVersion:1,patch:{}};
 const result=(await q('select public.study_command($1::jsonb) result',[JSON.stringify(start)]))[0].result;
 assert.equal(result.status,'ok');
 let row=(await q('select mode,config,phase,cycle,phase_ends_at from public.study_entries where id=$1',[draft]))[0];
 assert.equal(row.mode,'pomodoro');assert.equal(row.config.focus_minutes,18);
 assert.equal(row.config.break_minutes,7);assert.equal(row.config.cycles,3);
 assert.equal(row.phase,'focus');assert.equal(row.cycle,1);assert.ok(row.phase_ends_at);
 await db.exec('reset role');
 // Existing N11 schema permits only one running or paused entry per owner.
 // Finish this test fixture before starting the next timer.
 await q("update public.study_entries set status='saved' where id=$1",[draft]);
 await q("update public.presets set focus_minutes=45 where id=$1",[preset]);
 await q("update public.settings set focus_defaults='{\"mode\":\"flowtime\",\"focus_minutes\":40,\"break_minutes\":10,\"long_break_minutes\":15,\"cycles\":4,\"flowtime_break_ratio\":0.25}'::jsonb where user_id=$1",[owner]);
 row=(await q('select mode,config from public.study_entries where id=$1',[draft]))[0];
 assert.equal(row.mode,'pomodoro');
 assert.equal(row.config.focus_minutes,18,'later preset edits do not rewrite captured config');
 const newDraft=(await q("insert into public.study_entries(user_id,source,status,intent) values($1,'timer','draft','Defaults after change') returning id",[owner]))[0].id;
 await q("select set_config('test.uid',$1,false)",[owner]);
 await db.exec('set role authenticated');
 const second={...start,operationId:mkOp(2),target:{id:newDraft}};
 assert.equal((await q('select public.study_command($1::jsonb) result',[JSON.stringify(second)]))[0].result.status,'ok');
 row=(await q('select mode,config,phase_ends_at from public.study_entries where id=$1',[newDraft]))[0];
 assert.equal(row.mode,'flowtime');assert.equal(row.config.focus_minutes,40);
 assert.equal(row.phase_ends_at,null);
 await db.exec('reset role');
 await assert.rejects(q('update public.study_entries set preset_id=$1 where id=$2',[foreign,newDraft]),
  /foreign key|violates/,'a timer cannot reference another owner preset');
 await assert.rejects(q("update public.study_entries set mode='invalid' where id=$1",[newDraft]),
  /constraint|violates/);
 await assert.rejects(q("update public.study_entries set energy='sleepy' where id=$1",[newDraft]),
  /constraint|violates/);
 console.log('PASS N52 staged timer schema, owner preset FK, start-time immutable configuration and mode constraints');
}finally{await db.close()}
