// @vitest-environment node
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {drainDeviceCommands,runDeviceCommand,type RunDeps} from '../../../src/platform/deviceCommands';
import type {DeviceCommand,DeviceCommandApi} from '../../../src/data/device-commands/contract';

let db:any,owner:string,subject:string,project:string;
const q=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows;
async function as(id:string){await db.exec('reset role');await q("select set_config('request.jwt.claims','',false)");await q("select set_config('test.uid',$1,false)",[id]);await db.exec('set role authenticated');}
async function admin(){await db.exec('reset role');}
const env=(resource:string,operation:string,extra:Record<string,unknown>={})=>({schemaVersion:1,operationId:randomUUID(),resource,operation,...extra});
async function command(resource:string,operation:string,extra:Record<string,unknown>={}){
 const fn=resource==='period_plans'?'period_plans_command':resource==='task_series'?'task_series_command':resource==='device_commands'?'device_commands_command':resource==='tasks'?'task_command':'study_command';
 return (await q('select public.'+fn+'($1::jsonb) r',[JSON.stringify(env(resource,operation,extra))]))[0].r;
}
async function day(offset:number){return (await q('select (((now() at time zone time_zone)-make_interval(hours=>rollover_hour))::date+$2::int)::text d from public.settings where user_id=$1',[owner,offset]))[0].d;}
async function task(title:string,minutes=60,dueAt?:string){return (await q("insert into public.tasks(user_id,title,estimate_minutes,due_kind,due_at) values($1,$2,$3,$4,$5) returning id",[owner,title,minutes,dueAt?'instant':'none',dueAt??null]))[0].id;}
async function makePlan(){const r=await command('period_plans','create',{patch:{period:'week',start_date:await day(1)}});return (await q('select * from public.period_plans where id=$1',[r.changed[0].id]))[0];}
async function commit(p:any){return command('period_plans','commit',{target:{id:p.id},expectedVersion:p.version,patch:{placement_ids:p.placements.map((x:any)=>x.id)}});}

beforeAll(async()=>{
 const {PGlite}=await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $auth$
 select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,
 nullif(current_setting('test.uid',true),'')::uuid) $auth$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.includes('_storage')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
},60000);
beforeEach(async()=>{
 await admin();owner=randomUUID();subject=randomUUID();project=randomUUID();
 await q('insert into auth.users(id) values($1)',[owner]);
 await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[owner,(owner.replaceAll('-','')+'a'.repeat(48)).slice(0,48)]);
 await q("insert into public.subjects(id,user_id,name,glyph,hue) values($1,$2,'Math','M','amber')",[subject,owner]);
 await q("insert into public.projects(id,user_id,subject_id,slug,title,goal) values($1,$2,$3,'proofs','Proofs','Practice')",[project,owner,subject]);
 await as(owner);
});
afterAll(async()=>{await db?.close();});

it('does not schedule the same deadline effort again on an unchanged replan',async()=>{
 await admin();
 await q("insert into public.deadlines(user_id,title,kind,due_kind,due_date,remaining_minutes,estimate_source) values($1,'Exam','exam','date',$2,60,'owner')",[owner,await day(5)]);
 await as(owner);
 const p=await makePlan();await commit(p);
 await command('period_plans','replan',{target:{id:p.id},expectedVersion:2,patch:{}});
 const blocks=await q("select title,starts_at,ends_at from public.calendar_blocks where user_id=$1 and status='planned'",[owner]);
 console.info('deadline blocks after unchanged replan',blocks);
 expect(blocks).toHaveLength(1);
});

it('honors a 30-minute daily cap even when a global goal targets 120 minutes/day',async()=>{
 await task('Long task',240);await admin();
 await q("insert into public.study_goals(user_id,period,start_date,end_date,time_zone,target_minutes) values($1,'week',$2,$3,'UTC',840)",[owner,await day(1),await day(7)]);await as(owner);
 const r=await command('period_plans','preview',{patch:{period:'week',start_date:await day(1),daily_cap_minutes:30}});
 const loads:Record<string,number>={};for(const p of r.placements)loads[p.date]=(loads[p.date]??0)+p.minutes;
 console.info('daily cap 30; actual loads',loads);
 expect(Math.max(...Object.values(loads))).toBeLessThanOrEqual(30);
});

it('does not place an instant-due task after its deadline time',async()=>{
 const due=(await day(1))+'T07:00:00Z';const id=await task('Before lecture',60,due);
 const p=await makePlan();const placements=p.placements.filter((x:any)=>x.task_id===id);
 console.info('instant deadline and placements',due,placements);
 expect(placements.every((x:any)=>Date.parse(x.ends_at)<=Date.parse(due))).toBe(true);
});

it('does not commit stale work for a task completed after preview',async()=>{
 const id=await task('Finished task');const p=await makePlan();
 await command('tasks','update',{target:{id},expectedVersion:1,patch:{status:'completed'}});
 // A fresh draft version is not proof that its task snapshot is still valid.
 try{await commit(p);}catch{return;}
 expect(await q("select id from public.calendar_blocks where user_id=$1 and task_id=$2 and status='planned'",[owner,id])).toHaveLength(0);
});

it('preserves a deadline placement subject and Path on its committed calendar block',async()=>{
 await admin();
 await q("insert into public.deadlines(user_id,title,kind,due_kind,due_date,remaining_minutes,estimate_source,subject_id,project_id) values($1,'Scoped exam','exam','date',$2,60,'owner',$3,$4)",[owner,await day(5),subject,project]);
 await as(owner);
 const p=await makePlan();await commit(p);
 const block=(await q("select subject_id,project_id from public.calendar_blocks where user_id=$1 and title='Scoped exam'",[owner]))[0];
 expect(block).toEqual({subject_id:subject,project_id:project});
});

it('can stop a recurring series when a future occurrence has a calendar block',async()=>{
 const r=await command('task_series','create',{patch:{title:'Daily drill',freq:'daily'}});const id=r.changed[0].id;
 const occurrence=(await q('select id from public.tasks where series_id=$1 and occurrence_date=$2',[id,await day(1)]))[0];
 await command('calendar_blocks','create',{patch:{kind:'study',title:'Drill block',starts_at:(await day(1))+'T09:00:00Z',ends_at:(await day(1))+'T10:00:00Z',time_zone:'UTC',task_id:occurrence.id}});
 await expect(command('task_series','stop',{target:{id},expectedVersion:1,patch:{}})).resolves.toMatchObject({status:'ok'});
});

it('does not let an expired zero-progress series starve every other owner',async()=>{
 const expired='00000000-0000-4000-8000-000000000001';await admin();
 await q('insert into auth.users(id) values($1)',[expired]);await q('insert into public.settings(user_id,connector_secret) values($1,$2)',[expired,'e'.repeat(48)]);
 await as(expired);
 const old=await command('task_series','create',{patch:{title:'Already expired',freq:'daily',start_date:'2020-01-01',until_date:'2020-01-02'}});
 await as(owner);const active=await command('task_series','create',{patch:{title:'Needs generation',freq:'daily'}});
 await admin();await q('update public.task_series set materialized_through=null where id=$1',[active.changed[0].id]);
 await db.exec('set role service_role');
 const ticks=[];for(let i=0;i<3;i++)ticks.push((await q('select public.lemma_run_task_series() r'))[0].r);
 console.info('scheduler ticks while expired series exists',old.changed[0].id,ticks);
 await admin();const through=(await q('select materialized_through from public.task_series where id=$1',[active.changed[0].id]))[0].materialized_through;
 expect(through).not.toBeNull();
});

it('rejects a second stale card grade instead of overwriting the newer scheduling state',async()=>{
 const note=(await q("insert into public.notes(user_id,project_id,front,back) values($1,$2,'Q','A') returning id",[owner,project]))[0];
 await q('insert into public.cards(user_id,note_id,ord) values($1,$2,1)',[owner,note.id]);
 const card=(await q('select * from public.cards where note_id=$1',[note.id]))[0];
 const next={state:2,due:'2030-01-01T00:00:00Z',stability:5,difficulty:5,last_review:new Date().toISOString(),step:0,reps:1,lapses:0};
 await q("select public.record_review($1,3,null,1000,$2::jsonb)",[card.id,JSON.stringify(next)]);
 // Both clients checked version 1 before either write. The second still has next.reps=1.
 try{await q("select public.record_review($1,1,null,1000,$2::jsonb)",[card.id,JSON.stringify({...next,due:'2026-11-14T01:00:00Z',stability:0.1,lapses:1})]);}catch{return;}
 const saved=(await q('select reps,stability from public.cards where id=$1',[card.id]))[0];
 console.info('two grades, final card state',saved,(await q('select count(*)::int n from public.reviews where card_id=$1',[card.id]))[0]);
 expect(saved.reps).toBe(2);
});

async function device(){return (await q("select public.register_app_device('bug-hunt-device','Test','web') r"))[0].r.id;}
async function send(deviceId:string,action:string){
 if(!(await q("select id from public.study_entries where user_id=$1 and status in ('running','paused')",[owner])).length){const c=await command('study_entries','create',{patch:{source:'timer',intent:'A'}});await command('study_entries','start',{target:{id:c.changed[0].id},expectedVersion:1,patch:{}});}
 const r=await command('device_commands','send',{patch:{device_id:deviceId,kind:'timer',payload:{action}}});return r.command_id;}
function deviceApi(onDelivered?:()=>Promise<void>):DeviceCommandApi{
 return {mode:'live',register:async()=>null,subscribe:()=>()=>{},
  async pending(deviceId){const rows=await q('select to_jsonb(c) r from public.device_commands_recoverable($1) c',[deviceId]);return rows.map(({r}:any)=>({id:r.id,kind:r.kind,payload:r.payload,expiresAt:r.expires_at}));},
  async report(id,stage,reason,claimId){if(stage==='delivered'){await onDelivered?.();return (await q('select public.device_command_claim($1,$2) r',[id,claimId]))[0].r;}return (await q('select public.device_command_report($1,$2,$3) r',[id,stage,reason??null]))[0].r;},
 };
}
function runDeps(){const calls:string[]=[];return {calls,deps:{navigate:()=>{},locate:{path:async()=>null,checkpoint:async()=>null},study:{
 activeStudyEntry:async()=>(await q("select id,version,status from public.study_entries where user_id=$1 and status in ('running','paused')",[owner]))[0],discardStudyEntry:async(id:string)=>{calls.push('discard:'+id);},
 } as any} satisfies RunDeps};}

it('does not execute a destructive command cancelled between fetch and delivery',async()=>{
 const id=await device();const cmd=await send(id,'discard');const {deps,calls}=runDeps();
 await drainDeviceCommands(deviceApi(async()=>{await command('device_commands','cancel',{target:{id:cmd},expectedVersion:1,patch:{}});}),id,deps);
 expect((await q('select status from public.device_commands where id=$1',[cmd]))[0].status).toBe('cancelled');
 expect(calls).toEqual([]);
});

it('recovers a command after its delivered acknowledgement is lost before execution',async()=>{
 const id=await device();await send(id,'discard');const {deps,calls}=runDeps();const api=deviceApi();let fail=true;
 const report=api.report;api.report=async(...args)=>{const result=await report(...args);if(args[1]==='delivered'&&fail){fail=false;throw Error('Response lost after server commit');}return result;};
 await expect(drainDeviceCommands(api,id,deps)).rejects.toThrow('Response lost');
 await drainDeviceCommands(api,id,deps);
 expect(calls).toEqual(['discard:'+(await q("select id from public.study_entries where user_id=$1 and status in ('running','paused')",[owner]))[0].id]);
});

it('does not run the same delivered discard twice when two tabs fetch it concurrently',async()=>{
 const id=await device();await send(id,'discard');const {deps,calls}=runDeps();let count=0;let release!:()=>void;
 const barrier=new Promise<void>(resolve=>{release=resolve;});const base=deviceApi();
 const api={...base,pending:async(deviceId:string)=>{const rows=await base.pending(deviceId);if(++count===2)release();await barrier;return rows;}};
 await Promise.all([drainDeviceCommands(api,id,deps),drainDeviceCommands(api,id,deps)]);
 expect(calls).toEqual(['discard:'+(await q("select id from public.study_entries where user_id=$1 and status in ('running','paused')",[owner]))[0].id]);
});

it('does not apply a delayed discard intended for timer A to a newly started timer B',async()=>{
 const deviceId=await device();
 const start=async(intent:string)=>{const c=await command('study_entries','create',{patch:{source:'timer',intent}});return command('study_entries','start',{target:{id:c.changed[0].id},expectedVersion:c.changed[0].version,patch:{}});};
 const a=await start('Timer A');
 const discard=await send(deviceId,'discard');
 await command('study_entries','discard',{target:{id:a.changed[0].id},expectedVersion:a.changed[0].version,patch:{}});
 const b=await start('Unrelated Timer B');
 const waiting=await deviceApi().pending(deviceId);
 const deps:RunDeps={navigate:()=>{},locate:{path:async()=>null,checkpoint:async()=>null},study:{
  activeStudyEntry:async()=>{const row=(await q("select id,version,status from public.study_entries where user_id=$1 and status in ('running','paused')",[owner]))[0];return row??null;},
  discardStudyEntry:async(id:string,version:number)=>command('study_entries','discard',{target:{id},expectedVersion:version,patch:{}}),
 } as any};
 const outcome=await runDeviceCommand(waiting.find(c=>c.id===discard)!,deps);
 const saved=(await q('select status from public.study_entries where id=$1',[b.changed[0].id]))[0];
 console.info('delayed A discard outcome; B status',outcome,saved);
 expect(saved.status).toBe('running');
});
