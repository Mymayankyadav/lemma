// N52 staged full-migration regression: immutable timer capture and owner links.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const as=async(id)=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','{}',false)");
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
const admin=async()=>{await db.exec('reset role');await q("select set_config('test.uid','',false)")};
let serial=0;
const command=async(operation,resource,patch={},id=null,version=null)=>{
 const p={schemaVersion:1,resource,operation,
  operationId:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(++serial).padStart(12,'0'),
  patch,...(id?{target:{id}}:{}),...(version===null?{}:{expectedVersion:version})};
 return (await q('select public.study_command($1::jsonb) receipt',[JSON.stringify(p)]))[0].receipt;
};
try{
 await db.exec([
  'create role anon;create role authenticated;create role service_role;',
  'create schema auth;create schema extensions;',
  'create table auth.users(id uuid primary key);',
  "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
  "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$ select decode(repeat('00',n),'hex') $bytes$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid() to authenticated;'
 ].join('\n'));
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')&&!n.includes('_storage')).sort();
 assert.ok(names.includes('20261116010000_study_modes_v3.sql'));
 for(const file of names)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 for(const [id,secret] of [[owner,'a'.repeat(48)],[other,'b'.repeat(48)]])
  await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[id,secret]);
 const doc=JSON.parse(await readFile(new URL(
  '../../../docs/v6/capability-registry/study_entries.json',import.meta.url),'utf8'));
 const columns=(await q("select attname from pg_attribute where attrelid='public.study_entries'::regclass and attnum>0 and not attisdropped")).map(x=>x.attname).sort();
 assert.deepEqual(Object.keys(doc.columns).sort(),columns,
  'timer fields must be registered in the capability inventory');
 await as(owner);
 const create=await command('create','study_entries',{intent:'Timed proof',source:'timer'});
 assert.equal(create.status,'ok');
 const entryId=create.changed[0].id;
 const started=await command('start','study_entries',{},entryId,1);
 assert.equal(started.status,'ok');
 const active=(await q('select * from public.study_entries where id=$1',[entryId]))[0];
 assert.equal(active.mode,'pomodoro');
 assert.equal(active.config.focus_minutes,25);
 assert.equal(active.phase,'focus');
 assert.equal(active.cycle,1);
 assert.equal(active.lease_device,null);
 assert.equal(active.lease_expires_at,null);
 assert.equal(active.lease_version,1);
 assert.ok(Date.parse(active.phase_ends_at)-Date.now()>24*60*1000);
 assert.ok(Date.parse(active.phase_ends_at)-Date.now()<26*60*1000);
 await q('update public.settings set focus_defaults=$1::jsonb where user_id=$2',
  [JSON.stringify({focus_minutes:45}),owner]);
 assert.equal((await q('select config from public.study_entries where id=$1',
  [entryId]))[0].config.focus_minutes,25,
  'subsequent settings updates cannot mutate captured config');
 const undone=(await q('select public.undo_action($1::uuid,$2::bigint,false) result',
  [owner,started.actionNo]))[0].result;
 assert.equal(undone.undone,started.actionNo);
 const draft=(await q('select status,config,mode from public.study_entries where id=$1',
  [entryId]))[0];
 assert.equal(draft.status,'draft');
 assert.deepEqual(draft.config,{});
 assert.equal(draft.mode,'open');
 const later=await command('create','study_entries',{intent:'Later',source:'timer'});
 const laterStarted=await command('start','study_entries',{},later.changed[0].id,1);
 assert.equal(laterStarted.status,'ok');
 const laterRow=(await q('select config from public.study_entries where id=$1',
  [later.changed[0].id]))[0];
 assert.equal(laterRow.config.focus_minutes,45);
 await command('save','study_entries',{},later.changed[0].id,2);
 await admin();
 const foreign=(await q("insert into public.presets(user_id,label) values($1,'Their preset') returning id",
  [other]))[0].id;
 const mine=(await q("insert into public.presets(user_id,label,mode,focus_minutes,break_minutes,long_break_minutes,cycles) values($1,'Flowtime','flowtime',45,10,20,3) returning id",
  [owner]))[0].id;
 const presetEntry=(await q("insert into public.study_entries(user_id,intent,source,preset_id) values($1,'Preset run','timer',$2) returning id",
  [owner,mine]))[0].id;
 await assert.rejects(q('update public.study_entries set preset_id=$1 where id=$2',
  [foreign,presetEntry]),/foreign key|violates/i);
 await as(owner);
 const presetStarted=await command('start','study_entries',{},presetEntry,1);
 assert.equal(presetStarted.status,'ok');
 const captured=(await q('select mode,config,phase_ends_at from public.study_entries where id=$1',
  [presetEntry]))[0];
 assert.equal(captured.mode,'flowtime');
 assert.equal(captured.config.focus_minutes,45);
 assert.equal(captured.config.cycles,3);
 assert.equal(captured.phase_ends_at,null);
 await admin();
 await q('update public.presets set focus_minutes=90 where id=$1',[mine]);
 assert.equal((await q('select config from public.study_entries where id=$1',
  [presetEntry]))[0].config.focus_minutes,45,
  'subsequent preset edits cannot change a captured timer');
 await as(other);
 assert.deepEqual(await q('select id from public.study_entries where id=$1',[presetEntry]),[]);
 console.log('PASS N52 captured owner focus defaults, presets, RLS, undo');
}finally{await db.close()}
