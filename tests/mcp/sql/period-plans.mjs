// N160 (areas 7, 8): week and month plans, confirmed commit, replan, undo and the
// scheduled replan. PGlite only: never production.
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
const as=async(id)=>{
 await db.exec('reset role');
 await q("select set_config('request.jwt.claims','',false)");
 await q("select set_config('test.uid',$1,false)",[id]);
 await db.exec('set role authenticated');
};
let n=0;
const env=(operation,extra={})=>({operationId:'eeeeeeee-eeee-4eee-8eee-'+String(++n).padStart(12,'0'),
 schemaVersion:1,resource:'period_plans',operation,...extra});
const raw=async(payload)=>(await q('select public.period_plans_command($1::jsonb) r',[JSON.stringify(payload)]))[0].r;
const plan=(operation,extra)=>raw(env(operation,extra));
const row=async(id)=>(await q('select * from public.period_plans where id=$1',[id]))[0];
const undo=async(no)=>(await q('select public.undo_action($1::uuid,$2::bigint,false) r',[owner,no]))[0].r;
const mins=(a,b)=>Math.round((new Date(b)-new Date(a))/60000);
const day=async(off)=>(await q('select (public.task_series_today($1)+$2::int)::text d',[owner,off]))[0].d;
const isAction=r=>{assert.equal(r.status,'ok');assert.ok(r.actionNo>0)};
function checkShape(placements,{busy=[]}={}){
 const sorted=[...placements].sort((a,b)=>a.starts_at<b.starts_at?-1:1);
 for(let i=0;i<sorted.length;i++){
  const p=sorted[i];
  const h=new Date(p.starts_at).getUTCHours()*60+new Date(p.starts_at).getUTCMinutes();
  const e=h+p.minutes;
  assert.ok(h>=8*60&&e<=22*60,'inside the working window (08:00-22:00): '+p.starts_at);
  assert.ok(p.minutes<=120,'no run longer than max_consecutive_minutes');
  assert.equal(mins(p.starts_at,p.ends_at),p.minutes);
  if(i>0){
   const prev=sorted[i-1];
   assert.ok(new Date(p.starts_at)>=new Date(prev.ends_at),'placements never overlap');
   if(prev.date===p.date)assert.ok(mins(prev.ends_at,p.starts_at)>=10,'the 10-minute gap is kept');
  }
  for(const [bs,be] of busy)assert.ok(new Date(p.ends_at)<=new Date(bs)||new Date(p.starts_at)>=new Date(be),'not over a busy block');
 }
}
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
 assert.ok(files.some(x=>x.endsWith('_n160_period_plans.sql')));
 for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,'1'.repeat(48)]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[other,'2'.repeat(48)]);
 const d1=await day(1),d2=await day(2),d4=await day(4),d7=await day(7);

 // Fixtures: three tasks, an exam, and one existing busy block tomorrow.
 const t=async(title,minutes,due,priority='normal')=>(await q(
  "insert into public.tasks(user_id,title,estimate_minutes,priority,due_kind,due_date) values($1,$2,$3,$4,$5,$6) returning id",
  [owner,title,minutes,priority,due?'date':'none',due]))[0].id;
 const tA=await t('Proof drill A',60,d2,'high');
 const tB=await t('Chapter B',150,d4);
 const tC=await t('Reading C',45,null,'low');
 await q("insert into public.deadlines(user_id,title,kind,due_kind,due_date,remaining_minutes,estimate_source) values($1,'Algebra exam','exam','date',$2,60,'owner')",[owner,d4]);
 const busyStart=d1+'T09:00:00Z',busyEnd=d1+'T10:00:00Z';
 await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'busy','Lecture',$2,$3,'UTC')",[owner,busyStart,busyEnd]);

 // Browsers cannot write plans, and the helpers are not callable.
 await as(owner);
 await assert.rejects(q("insert into public.period_plans(period,start_date,end_date,time_zone) values('week',current_date,current_date+6,'UTC')"),/permission denied/);
 await assert.rejects(q('select public.period_plan_compute($1,current_date,current_date+6,current_date,$2,null,$3)',[owner,'UTC','{}']),/permission denied/);

 // Preview writes nothing.
 const before=(await q('select count(*)::int n from public.actions'))[0].n;
 const preview=await plan('preview',{patch:{period:'week',start_date:d1}});
 assert.equal(preview.status,'ok');assert.equal(preview.actionNo,null);
 assert.equal((await q('select count(*)::int n from public.period_plans'))[0].n,0);
 assert.equal((await q('select count(*)::int n from public.actions'))[0].n,before);
 assert.equal(preview.end_date,d1.slice(0,8)+String(Number(d1.slice(8))+6).padStart(2,'0'),'week ends six days later');
 // 60 (A) + 150 (B) + 45 (C) + 60 (exam effort due the 4th) = 315 minutes, all placed.
 assert.equal(preview.planned_minutes,315);
 assert.deepEqual(preview.unplaced,[]);
 checkShape(preview.placements,{busy:[[busyStart,busyEnd]]});
 const aPlaces=preview.placements.filter(p=>p.task_id===tA);
 assert.equal(aPlaces.reduce((s,p)=>s+p.minutes,0),60);
 assert.ok(aPlaces.every(p=>p.date<=d2),'a task is placed on or before its due date');
 const exam=preview.placements.filter(p=>p.deadline_id);
 assert.equal(exam.reduce((s,p)=>s+p.minutes,0),60);
 assert.ok(exam.every(p=>p.date<=d4));
 // Urgent work comes first: A (due d2) never starts after C (no date).
 assert.ok(aPlaces[0].starts_at<=preview.placements.find(p=>p.task_id===tC).starts_at);

 // A global weekly goal gives each day a target load. With 840 minutes (120 a day)
 // every day stays at its target because the work fits.
 await role(null);
 await q("insert into public.study_goals(user_id,period,start_date,end_date,time_zone,target_minutes) values($1,'week',$2,$3,'UTC',840)",[owner,d1,d7]);
 await as(owner);
 const goaled=await plan('preview',{patch:{period:'week',start_date:d1}});
 assert.equal(goaled.goal_minutes,120);
 const load={};for(const p of goaled.placements)load[p.date]=(load[p.date]||0)+p.minutes;
 assert.ok(Math.max(...Object.values(load))<=120,'every day stays at its goal target when the work fits');
 assert.equal(goaled.planned_minutes,315);
 // A 60-minute target is too small for what is due by the 4th, so a second pass
 // goes over the target rather than miss a date: nothing is left unplaced.
 await role(null);
 await q("update public.study_goals set target_minutes=420");
 await as(owner);
 const tight=await plan('preview',{patch:{period:'week',start_date:d1}});
 assert.equal(tight.goal_minutes,60);
 assert.deepEqual(tight.unplaced,[]);
 assert.equal(tight.planned_minutes,315);
 await role(null);
 await q('delete from public.study_goals');
 await as(owner);

 // Stored draft, replay, stale version.
 const first=env('create',{patch:{period:'week',start_date:d1,daily_cap_minutes:240}});
 const created=await raw(first);isAction(created);
 const id=created.changed[0].id;
 assert.deepEqual(await raw(first),created);
 assert.equal((await raw({...first,patch:{period:'week',start_date:d1}})).status,'conflict');
 assert.equal((await row(id)).status,'draft');
 assert.equal((await q("select count(*)::int n from public.calendar_blocks where title<>'Lecture'"))[0].n,0,'a draft writes no block');
 assert.equal((await plan('update',{target:{id},expectedVersion:9,patch:{}})).status,'conflict');
 const edited=await plan('update',{target:{id},expectedVersion:1,patch:{exclude_task_ids:[tB]}});isAction(edited);
 let draft=await row(id);
 assert.ok(!draft.placements.some(p=>p.task_id===tB),'an excluded task is not planned');
 assert.equal(draft.placements.reduce((s,p)=>s+p.minutes,0),165);

 // Commit only what the owner confirmed.
 await assert.rejects(plan('commit',{target:{id},expectedVersion:2,patch:{placement_ids:[]}}),/confirmed/);
 await assert.rejects(plan('commit',{target:{id},expectedVersion:2,patch:{placement_ids:['00000000-0000-4000-8000-000000000000']}}),/Unknown placement/);
 const aOnly=draft.placements.filter(p=>p.task_id===tA).map(p=>p.id);
 const committed=await plan('commit',{target:{id},expectedVersion:2,patch:{placement_ids:aOnly}});isAction(committed);
 draft=await row(id);
 assert.equal(draft.status,'committed');
 assert.equal(draft.placements.length,aOnly.length,'unconfirmed placements are dropped');
 const planBlocks=await q("select * from public.calendar_blocks where task_id=$1 order by starts_at",[tA]);
 assert.equal(planBlocks.length,aOnly.length);
 assert.ok(planBlocks.every(b=>b.kind==='study'&&b.status==='planned'&&b.time_zone==='UTC'&&b.user_id===owner));
 await assert.rejects(plan('commit',{target:{id},expectedVersion:3,patch:{placement_ids:aOnly}}),/Only a draft/);
 await assert.rejects(plan('update',{target:{id},expectedVersion:3,patch:{}}),/Only a draft/);

 // Undo of the commit removes the blocks and restores the draft.
 await undo(committed.actionNo);
 assert.equal((await q("select count(*)::int n from public.calendar_blocks where task_id=$1",[tA]))[0].n,0);
 assert.equal((await row(id)).status,'draft');
 const again=await plan('commit',{target:{id},expectedVersion:2,patch:{placement_ids:aOnly}});isAction(again);

 // Replan: a missed block and a new busy block that overlaps another plan block.
 // Commit a second, larger plan first so there are several blocks to disturb.
 const created2=await plan('create',{patch:{period:'week',start_date:d1}});
 const id2=created2.changed[0].id;
 const all=(await row(id2)).placements;
 const ids=all.map(p=>p.id);
 const commit2=await plan('commit',{target:{id:id2},expectedVersion:1,patch:{placement_ids:ids}});isAction(commit2);
 const blocks=await q("select b.id,b.task_id,b.starts_at,b.ends_at from public.calendar_blocks b where b.id in (select (x->>'block_id')::uuid from public.period_plans pp,jsonb_array_elements(pp.placements) x where pp.id=$1) order by b.starts_at",[id2]);
 assert.equal(blocks.length,all.length);
 const missed=blocks[0],hit=blocks[blocks.length-1];
 await q("update public.calendar_blocks set starts_at=now()-interval '3 hours',ends_at=now()-interval '2 hours' where id=$1",[missed.id]);
 await q("insert into public.calendar_blocks(user_id,kind,title,starts_at,ends_at,time_zone) values($1,'busy','New appointment',$2,$3,'UTC')",[owner,hit.starts_at,hit.ends_at]);
 const taskMinutes=async(taskId)=>(await q("select coalesce(sum(extract(epoch from (ends_at-starts_at))/60),0)::int m from public.calendar_blocks where task_id=$1 and status='planned' and ends_at>now()",[taskId]))[0].m;
 const replanned=await plan('replan',{target:{id:id2},expectedVersion:2,patch:{}});isAction(replanned);
 assert.equal(replanned.cancelled_blocks,2);
 assert.equal((await q("select count(*)::int n from public.calendar_blocks where id=any($1) and status='cancelled'",[[missed.id,hit.id]]))[0].n,2);
 for(const [tid,est] of [[tB,150],[tC,45]])assert.equal(await taskMinutes(tid),est,'the missing minutes of every open task are planned again');
 const fresh=(await row(id2)).placements.filter(p=>p.block_id&&!ids.includes(p.id));
 assert.ok(fresh.length>=1);
 assert.ok(fresh.every(p=>new Date(p.starts_at)>new Date()),'replanned time is in the future');
 const overlapping=await q("select a.id from public.calendar_blocks a join public.calendar_blocks b on a.user_id=b.user_id and a.id<b.id and a.status<>'cancelled' and b.status<>'cancelled' and a.starts_at<b.ends_at and a.ends_at>b.starts_at");
 assert.deepEqual(overlapping,[],'a replan never overlaps an existing block');
 // Undo of the replan restores the missed and overlapped blocks and the plan.
 await undo(replanned.actionNo);
 assert.equal((await q("select count(*)::int n from public.calendar_blocks where id=any($1) and status='cancelled'",[[missed.id,hit.id]]))[0].n,0);
 assert.equal((await row(id2)).version,2);
 // Plan again, then finished work is left alone: completing C and replanning
 // again cancels and creates nothing for C.
 const ver=async(pid)=>(await row(pid)).version;
 const replanned2=await plan('replan',{target:{id:id2},expectedVersion:await ver(id2),patch:{}});isAction(replanned2);
 await q("update public.tasks set status='completed',completed_at=now() where id=$1",[tC]);
 const cBefore=(await q("select count(*)::int n from public.calendar_blocks where task_id=$1",[tC]))[0].n;
 const noChange=await plan('replan',{target:{id:id2},expectedVersion:await ver(id2),patch:{}});isAction(noChange);
 assert.equal(noChange.cancelled_blocks,0);
 assert.equal((await q("select count(*)::int n from public.calendar_blocks where task_id=$1",[tC]))[0].n,cBefore);

 // A replan scheduled to run while nobody is in the app.
 const sched={schemaVersion:1,operationId:'ffffffff-ffff-4fff-8fff-000000000001',operation:'schedule',resource:'period_plans',
  payload:{...env('replan',{target:{id:id2},expectedVersion:await ver(id2),patch:{}})},
  notBefore:new Date(Date.now()+3600e3).toISOString(),undoUntil:new Date(Date.now()+7200e3).toISOString()};
 const scheduled=(await q('select public.pending_command($1::jsonb) r',[JSON.stringify(sched)]))[0].r;
 assert.equal(scheduled.status,'ok');
 await role(null);
 await q("update public.pending_commands set not_before=now()-interval '2 minutes',undo_until=now()+interval '1 hour' where operation_id=$1",[sched.payload.operationId]);
 await role('service_role');
 const tick=(await q('select public.lemma_run_due_commands() r'))[0].r;
 assert.equal(tick.executed,1,'the due replan ran from the worker');
 await role(null);
 assert.equal((await row(id2)).version,(await q('select version from public.period_plans where id=$1',[id2]))[0].version);
 assert.equal((await q("select count(*)::int n from public.pending_commands where status='succeeded'"))[0].n,1);

 // Archive, optionally cancelling the plan's remaining blocks.
 await as(owner);
 const archived=await plan('archive',{target:{id:id2},expectedVersion:await ver(id2),patch:{cancel_blocks:true}});isAction(archived);
 assert.equal((await row(id2)).status,'archived');
 assert.equal((await q("select count(*)::int n from public.calendar_blocks b where b.status='planned' and b.ends_at>now() and b.id in (select (x->>'block_id')::uuid from public.period_plans pp,jsonb_array_elements(pp.placements) x where pp.id=$1)",[id2]))[0].n,0,'archive with cancel_blocks cancels the plan\'s future blocks');
 assert.equal((await q("select count(*)::int n from public.calendar_blocks where task_id=$1 and status='planned'",[tA]))[0].n>0,true,'another plan\'s blocks are untouched');

 // Month plan, owner isolation, MCP bridge.
 const month=await plan('preview',{patch:{period:'month',start_date:d1}});
 assert.ok(month.end_date>d1);
 await as(other);
 assert.equal((await q('select count(*)::int n from public.period_plans'))[0].n,0);
 await assert.rejects(plan('archive',{target:{id},expectedVersion:3,patch:{}}),/Period plan not found/);
 await role('service_role');
 const viaMcp=(await q('select public.mcp_command($1::uuid,$2::text,$3::jsonb) r',[owner,'claude',JSON.stringify(env('create',{patch:{period:'week',start_date:d1}}))]))[0].r;
 isAction(viaMcp);
 await role(null);
 assert.equal((await q('select source from public.actions where no=$1',[viaMcp.actionNo]))[0].source,'claude');
 console.log('N160 period plans: preview, goals, commit, replan, scheduled replan, undo and owner boundary passed');
}finally{await db.close()}
