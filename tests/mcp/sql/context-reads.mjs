// N160 (areas 2, 24, 27): Today, progress and export reads for the connector.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,values=[])=>(await db.query(sql,values)).rows;
const role=async(name)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid','',false)");
 await q("select set_config('request.jwt.claims','',false)");
 if(name)await db.exec('set role '+name);
};
const rawRead=async(user,what,args={})=>(await q('select public.mcp_read($1::uuid,$2::text,$3::jsonb) r',[user,what,JSON.stringify(args)]))[0].r;
const read=async(user,what,args={})=>{await role('service_role');try{return await rawRead(user,what,args)}finally{await role(null)}};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $auth$
   select coalesce(
    nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,
    nullif(current_setting('test.uid',true),'')::uuid)
  $auth$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql
   as $bytes$select decode(repeat('00',n),'hex')$bytes$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
 assert.ok(files.some(x=>x.endsWith('_n160_context_reads.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 const today=(await q('select (public.task_series_today($1))::text d',[owner]))[0].d;

 // Only the connector's service role may call it.
 const acl=(await q(`select has_function_privilege('anon','public.mcp_read(uuid,text,jsonb)','execute') anon,
  has_function_privilege('authenticated','public.mcp_read(uuid,text,jsonb)','execute') app,
  has_function_privilege('service_role','public.mcp_read(uuid,text,jsonb)','execute') service`))[0];
 assert.deepEqual(acl,{anon:false,app:false,service:true});
 await assert.rejects(rawRead(owner,'today'),/Service role required/);

 // Fixtures: an overdue task, a task due today, one due later, an open exam, a block, a running timer.
 await q("insert into public.tasks(user_id,title,priority,due_kind,due_date,estimate_minutes) values($1,'Overdue proof','high','date',($2::date-3),30),($1,'Due today','normal','date',$2,20),($1,'Due later','normal','date',($2::date+9),20),($1,'Someone else''s','normal','date',$2,5)",[owner,today]);
 await q("update public.tasks set user_id=$1 where title='Someone else''s'",[other]);
 await q("insert into public.deadlines(user_id,title,kind,due_kind,due_date,remaining_minutes,estimate_source) values($1,'Exam','exam','date',($2::date+5),120,'owner')",[owner,today]);
 await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'busy','Lecture',($2::date+time '10:00')::timestamptz,($2::date+time '11:30')::timestamptz,'UTC')",[owner,today]);
 const entry=(await q("insert into public.study_entries(user_id,intent,status,source) values($1,'Proofs','running','timer') returning id",[owner]))[0].id;
 await q("insert into public.study_intervals(user_id,entry_id,kind,started_at) values($1,$2,'focus',now())",[owner,entry]);

 const t=await read(owner,'today');
 assert.equal(t.what,'today');assert.equal(t.date,today);
 assert.deepEqual(t.tasks.map(x=>x.title),['Overdue proof','Due today'],'overdue and due-today tasks only, oldest first');
 assert.equal(t.tasks[0].overdue,true);assert.equal(t.tasks[1].overdue,false);
 assert.ok(!JSON.stringify(t).includes('Someone else'),'no other owner data');
 assert.equal(t.blocks.length,1);assert.equal(t.blocks[0].title,'Lecture');
 assert.equal(t.timer.status,'running');assert.equal(t.timer.intervals.length,1);
 assert.deepEqual(t.deadlines.map(x=>x.title),['Exam']);
 assert.equal(t.availability.window_start,'08:00');
 assert.equal(t.availability.free_minutes,14*60-90,'window minus the 90-minute lecture');
 assert.ok(t.availability.free_minutes_remaining<=t.availability.free_minutes);
 assert.ok(t.review_budget&&'cards' in t.review_budget);

 // Progress is the insights report the Progress screen shows.
 const p=await read(owner,'progress',{days:7});
 assert.equal(p.days,7);assert.equal(typeof p.report,'object');
 await assert.rejects(read(owner,'progress',{days:0}),/1\.\.365/);
 await assert.rejects(read(owner,'secrets'),/Unknown read/);

 // Export pages, owner-scoped.
 const tables=await read(owner,'export',{limit:5});
 assert.equal(tables.what,'export');assert.ok(tables.page);
 const ex=await read(owner,'export',{table:'tasks',limit:10});
 const rows=ex.page.rows||[];
 assert.ok(rows.length>=3);
 assert.ok(rows.every(r=>(r.user_id===undefined)||r.user_id===owner));
 await assert.rejects(read(owner,'export',{table:'auth.users'}),/not registered/);
 const theirs=await read(other,'today');
 assert.equal(theirs.tasks.length,1);assert.equal(theirs.tasks[0].title,"Someone else's");
 assert.equal(theirs.timer,null);
 await assert.rejects(read('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','today'),/Owner not found/);
 console.log('N160 context reads: Today, progress and export passed');
}finally{await db.close()}
