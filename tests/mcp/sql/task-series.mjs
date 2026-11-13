// N160: recurring tasks. Rules, edit/skip/stop/resume, undo, the MCP bridge
// and the background scheduler (no duplicates). PGlite only: never production.
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
 if(name)await db.exec('set role '+name);
};
const as=async(id)=>{
 await db.exec('reset role');
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
let number=0;
const envelope=(resource,operation,extra={})=>({
 operationId:'dddddddd-dddd-4ddd-8ddd-'+String(++number).padStart(12,'0'),
 schemaVersion:1,resource,operation,...extra,
});
const series=async(operation,extra={})=>(await q(
 'select public.task_series_command($1::jsonb) result',
 [JSON.stringify(envelope('task_series',operation,extra))]))[0].result;
const raw=async(payload)=>(await q('select public.task_series_command($1::jsonb) result',
 [JSON.stringify(payload)]))[0].result;
const taskCmd=async(operation,extra)=>(await q('select public.task_command($1::jsonb) result',
 [JSON.stringify(envelope('tasks',operation,extra))]))[0].result;
const undo=async(user,no)=>(await q('select public.undo_action($1::uuid,$2::bigint,false) result',[user,no]))[0].result;
const row=async(id)=>(await q('select * from public.task_series where id=$1',[id]))[0];
const occurrences=async(id)=>(await q(
 "select occurrence_date::text d,status,title,version,id from public.tasks where series_id=$1 order by occurrence_date",[id]));
const dates=async(...args)=>(await q(
 'select d::text from public.task_series_dates($1,$2,$3::smallint[],$4::smallint,$5::date,$6::date,$7::date,$8::date) d',args)).map(x=>x.d);
const addDays=async(base,n)=>(await q('select ($1::date+$2::int)::text d',[base,n]))[0].d;
const isAction=r=>{assert.equal(r.status,'ok');assert.ok(Number.isSafeInteger(r.actionNo)&&r.actionNo>0)};
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
 assert.ok(files.some(x=>x.endsWith('_n160_task_series.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 const today=(await q('select (public.task_series_today($1))::text d',[owner]))[0].d;

 // --- The schedule rules, with fixed dates ---------------------------------
 assert.deepEqual(await dates('daily',1,[],null,'2026-11-02',null,'2026-11-01','2026-11-05'),
  ['2026-11-02','2026-11-03','2026-11-04','2026-11-05']);
 assert.deepEqual(await dates('weekdays',1,[],null,'2026-11-02',null,'2026-11-01','2026-11-10'),
  ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10'],
  'weekdays skip Saturday and Sunday');
 assert.deepEqual(await dates('weekly',2,[1,3],null,'2026-11-02',null,'2026-11-01','2026-12-31'),
  ['2026-11-02','2026-11-04','2026-11-16','2026-11-18','2026-11-30','2026-12-02',
   '2026-12-14','2026-12-16','2026-12-28','2026-12-30'],'every other week on Monday and Wednesday');
 assert.deepEqual(await dates('weekly',1,[],null,'2026-11-04',null,'2026-11-01','2026-11-20'),
  ['2026-11-04','2026-11-11','2026-11-18'],'weekly without days repeats the start weekday');
 assert.deepEqual(await dates('monthly',1,[],31,'2026-01-31',null,'2026-01-01','2026-05-31'),
  ['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31'],'the 31st lands on each month end');
 assert.deepEqual(await dates('monthly',2,[],null,'2026-01-15',null,'2026-01-01','2026-06-30'),
  ['2026-01-15','2026-03-15','2026-05-15'],'every other month on the start day');
 assert.deepEqual(await dates('custom',3,[],null,'2026-11-01',null,'2026-10-01','2026-11-12'),
  ['2026-11-01','2026-11-04','2026-11-07','2026-11-10']);
 assert.deepEqual(await dates('daily',1,[],null,'2026-11-01','2026-11-03','2026-10-01','2026-11-30'),
  ['2026-11-01','2026-11-02','2026-11-03'],'until_date ends the series');

 // --- Browsers cannot write series or the scheduler directly -----------------
 await as(owner);
 await assert.rejects(q("insert into public.task_series(title,freq,start_date) values('x','daily',current_date)"),
  /permission denied/);
 await assert.rejects(q('select public.lemma_run_task_series()'),/permission denied/);
 await assert.rejects(q('select public.task_series_materialize($1,current_date)',[owner]),/permission denied/);

 // --- Create: a daily series fills today..today+14 --------------------------
 const first=envelope('task_series','create',{patch:{title:'Daily proof drill',body:'one page',
  estimate_minutes:25,priority:'high',freq:'daily'}});
 const created=await raw(first);isAction(created);
 const id=created.changed[0].id;
 assert.equal(created.generated,15);
 assert.deepEqual(await raw(first),created,'retry returns the original receipt');
 assert.equal((await raw({...first,patch:{title:'Different'}})).status,'conflict');
 let occ=await occurrences(id);
 assert.equal(occ.length,15);
 assert.equal(occ[0].d,today);
 assert.equal(occ[14].d,await addDays(today,14));
 const t0=(await q('select * from public.tasks where id=$1',[occ[0].id]))[0];
 assert.equal(t0.user_id,owner);assert.equal(t0.due_kind,'date');assert.equal(t0.priority,'high');
 assert.equal(t0.estimate_minutes,25);assert.equal(t0.status,'backlog');assert.equal(t0.series_id,id);
 assert.equal((await row(id)).materialized_through.toISOString().slice(0,10),await addDays(today,14));
 await assert.rejects(series('create',{patch:{title:'Bad',freq:'daily',interval_n:2}}),/task_series_rule_shape|check constraint/);
 await assert.rejects(series('create',{patch:{title:'Bad',freq:'weekly',by_weekday:[8]}}),/ISO weekdays/);
 await assert.rejects(series('create',{patch:{title:' ',freq:'daily'}}),/title/);
 await assert.rejects(series('create',{patch:{title:'Bad field',freq:'daily',version:9}}),/Unknown task series patch field/);
 // Occurrence markers are not writable through the ordinary task command.
 await assert.rejects(taskCmd('update',{target:{id:occ[0].id},expectedVersion:1,patch:{series_id:id}}),/Unknown task patch field/);

 // --- Complete one occurrence with the existing task command ---------------
 const done=await taskCmd('update',{target:{id:occ[0].id},expectedVersion:1,patch:{status:'completed'}});
 isAction(done);

 // --- Skip / unskip ----------------------------------------------------------
 const skipDate=await addDays(today,3);
 let cur=await row(id);
 const stale=await series('skip',{target:{id},expectedVersion:cur.version+4,patch:{date:skipDate}});
 assert.equal(stale.status,'conflict');assert.equal(stale.current.version,cur.version);
 const skipped=await series('skip',{target:{id},expectedVersion:cur.version,patch:{date:skipDate}});isAction(skipped);
 occ=await occurrences(id);
 assert.equal(occ.find(x=>x.d===skipDate).status,'cancelled');
 assert.equal(occ.length,15,'a skipped date keeps its (cancelled) row: no duplicate later');
 await assert.rejects(series('skip',{target:{id},expectedVersion:skipped.changed[0].version,patch:{date:skipDate}}),/already skipped/);
 cur=await row(id);
 const bigDate=await addDays(today,300);
 await assert.rejects(series('skip',{target:{id},expectedVersion:cur.version,patch:{date:'2020-01-01'}}),/Date is not an occurrence|occurrence/);
 const unskipped=await series('unskip',{target:{id},expectedVersion:cur.version,patch:{date:skipDate}});isAction(unskipped);
 occ=await occurrences(id);
 assert.equal(occ.find(x=>x.d===skipDate).status,'backlog');
 assert.equal((await row(id)).skipped_dates.length,0);
 void bigDate;

 // --- Edit the series: content follows, finished work does not -----------------
 cur=await row(id);
 const edited=await series('update',{target:{id},expectedVersion:cur.version,patch:{title:'Daily drill v2',estimate_minutes:30}});isAction(edited);
 occ=await occurrences(id);
 assert.equal(occ.filter(x=>x.title==='Daily drill v2').length,14,'open occurrences follow the edit');
 assert.equal(occ[0].title,'Daily proof drill','the completed occurrence is untouched');
 assert.equal(occ.length,15);
 // Changing the rule removes open future dates it no longer lands on and
 // never duplicates the ones it keeps.
 cur=await row(id);
 const weekdaysOnly=await series('update',{target:{id},expectedVersion:cur.version,patch:{freq:'weekdays'}});isAction(weekdaysOnly);
 occ=await occurrences(id);
 for(const o of occ.slice(1)){
  const dow=(await q('select date_part($1,$2::date)::int d',['isodow',o.d]))[0].d;
  assert.ok(dow<=5,'no weekend occurrence after the rule changed: '+o.d);
 }
 assert.equal(new Set(occ.map(x=>x.d)).size,occ.length,'no duplicate dates');
 const kept=occ.length;
 // The undo of an edit restores the removed days exactly.
 await undo(owner,weekdaysOnly.actionNo);
 occ=await occurrences(id);
 assert.ok(occ.length>kept);
 assert.equal((await row(id)).freq,'daily');

 // --- Stop and resume --------------------------------------------------------
 cur=await row(id);
 const stopped=await series('stop',{target:{id},expectedVersion:cur.version});isAction(stopped);
 occ=await occurrences(id);
 assert.deepEqual(occ.filter(x=>x.d>today&&x.status==='backlog'),[],'stop removes open future occurrences');
 assert.ok(occ.some(x=>x.d===today),'today stays');
 await assert.rejects(series('stop',{target:{id},expectedVersion:stopped.changed[0].version}),/already stopped/);
 await role('service_role');
 assert.equal((await q('select public.lemma_run_task_series() r'))[0].r.generated,0,'the scheduler ignores a stopped series');
 await as(owner);
 const resumed=await series('resume',{target:{id},expectedVersion:stopped.changed[0].version});isAction(resumed);
 occ=await occurrences(id);
 assert.equal(new Set(occ.map(x=>x.d)).size,occ.length);
 assert.equal(occ[occ.length-1].d,await addDays(today,14));
 await assert.rejects(series('resume',{target:{id},expectedVersion:resumed.changed[0].version}),/not stopped/);

 // --- Undo of create removes the series and every generated task ------------
 const second=await series('create',{patch:{title:'Weekly review',freq:'weekly',by_weekday:[1,3],start_date:today}});isAction(second);
 const secondId=second.changed[0].id;
 assert.ok((await occurrences(secondId)).length>=2);
 await undo(owner,second.actionNo);
 assert.equal(await row(secondId),undefined);
 assert.equal((await occurrences(secondId)).length,0);

 // --- Owners are isolated ----------------------------------------------------
 await as(other);
 assert.equal((await q('select count(*)::int n from public.task_series'))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.tasks where series_id is not null'))[0].n,0);
 await assert.rejects(series('stop',{target:{id},expectedVersion:1}),/Task series not found/);
 await as(owner);

 // --- MCP bridge: the generic dispatcher reaches the same command ------------
 await role('service_role');
 const viaMcp=(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) r',
  [owner,'claude',JSON.stringify(envelope('task_series','create',{patch:{title:'Via Claude',freq:'custom',interval_n:3}}))]))[0].r;
 isAction(viaMcp);
 await role(null);
 assert.equal((await q('select source,tool from public.actions where no=$1',[viaMcp.actionNo]))[0].source,'claude');
 assert.equal((await q("select count(*)::int n from public.lemma_command_resources where resource='task_series' and mcp_ok")) [0].n,1);

 // --- Background scheduler: generates while nobody is in the app, never twice
 await role(null);
 const viaMcpId=viaMcp.changed[0].id;
 await q('delete from public.tasks where series_id=$1',[viaMcpId]);
 await q('update public.task_series set materialized_through=null where id=$1',[viaMcpId]);
 await q("update public.task_series set materialized_through=$1 where id=$2",[await addDays(today,14),id]);
 await role('service_role');
 const tick=(await q('select public.lemma_run_task_series() r'))[0].r;
 assert.equal(tick.owners,1);assert.equal(tick.series,1);assert.ok(tick.generated>=5);
 await role(null);
 const countAfterFirst=(await occurrences(viaMcpId)).length;
 await role('service_role');
 const again=(await q('select public.lemma_run_task_series() r'))[0].r;
 assert.equal(again.generated,0,'a second tick finds nothing due');
 await role(null);
 assert.equal((await occurrences(viaMcpId)).length,countAfterFirst);
 // Even a tick that believes nothing was generated cannot duplicate a date.
 await q('update public.task_series set materialized_through=null where id=$1',[viaMcpId]);
 await role('service_role');
 const replay=(await q('select public.lemma_run_task_series() r'))[0].r;
 assert.equal(replay.generated,0,'dates that exist are not generated again');
 await role(null);
 assert.equal((await occurrences(viaMcpId)).length,countAfterFirst);
 assert.equal((await q("select count(*)::int n from (select series_id,occurrence_date from public.tasks where series_id is not null group by 1,2 having count(*)>1) x"))[0].n,0);
 const journal=(await q("select source,tool from public.actions where tool='task_series_scheduler' order by no desc limit 1"))[0];
 assert.deepEqual(journal,{source:'system',tool:'task_series_scheduler'});
 await role('authenticated');
 await assert.rejects(q('select public.lemma_run_task_series()'),/permission denied/);
 console.log('N160 recurring tasks: rules, edit, skip, stop, undo, MCP bridge and scheduler passed');
}finally{await db.close()}
