// @vitest-environment node
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runNoticeTick} from '../../../supabase/functions/push/tick';
let db:any,uid:string,project:string;
const q=async(sql:string,args:any[]=[]) => (await db.query(sql,args)).rows;
async function admin(){await db.exec('reset role');}
async function role(name:string){await admin();await q("select set_config('test.uid','',false)");await db.exec('set role '+name);}
async function asOwner(){await admin();await q("select set_config('test.uid',$1,false)",[uid]);await db.exec('set role authenticated');}
async function cmd(op:string,id?:string,version?:number,patch:any={},extra:any={}){
 return (await q('select public.study_command($1::jsonb) r',[JSON.stringify({schemaVersion:1,operationId:randomUUID(),resource:'study_entries',operation:op,...(id?{target:{id},expectedVersion:version}:{}),patch,...extra})]))[0].r;
}
beforeAll(async()=>{
 const {PGlite}=await import(/* @vite-ignore */ process.env.PGLITE_MODULE!);db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema extensions;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
},60000);
beforeEach(async()=>{
 await admin();uid=randomUUID();
 await q('insert into auth.users(id) values($1)',[uid]);
 await q("insert into public.settings(user_id,connector_secret,time_zone) values($1,$2,'UTC')",[uid,uid.replaceAll('-','')+'a'.repeat(16)]);
 project=(await q("insert into public.projects(user_id,slug,title) values($1,'proofs','Proofs') returning id",[uid]))[0].id;
 await asOwner();
});
afterAll(async()=>{await db?.close();});

it('native pause envelope must be accepted for the phone owning the active lease',async()=>{
 const a=await cmd('create',undefined,undefined,{source:'timer',intent:'Proof'}),id=a.changed[0].id;
 const b=await cmd('start',id,a.changed[0].version);
 const lease=await cmd('take_lease',id,b.changed[0].version,{device:'phone-webview',lease_minutes:2});
 const action={id:randomUUID(),entryId:id,version:lease.changed[0].version,device:'phone-webview',action:'pause',at:Date.now()};
 const result=(await q('select public.replay_timer_action($1::jsonb) r',[JSON.stringify(action)]))[0].r;
 expect(result.outcome).toBe('applied');
 expect((await q('select status from public.study_entries where id=$1',[id]))[0].status).toBe('paused');
});

it('native Pomodoro Start break must advance the canonical phase and preserve a usable phase transition',async()=>{
 await admin();
 const preset=(await q("insert into public.presets(user_id,label,mode,focus_minutes,break_minutes,long_break_minutes,cycles) values($1,'Pomo','pomodoro',25,5,15,4) returning id",[uid]))[0].id;
 const id=(await q("insert into public.study_entries(user_id,source,status,preset_id,intent) values($1,'timer','draft',$2,'Proof') returning id",[uid,preset]))[0].id;
 await asOwner();const started=await cmd('start',id,1);
 expect(started.status).toBe('ok');
 // Native actions use whole milliseconds, while SQL records transaction time.
 // Backdate this isolated fixture so focus start < native break < the next phase.
 await admin();
 const [{at,version}]=await q(`with fixture_clock as (
   select date_trunc('milliseconds',clock_timestamp())-interval '2 seconds' as at
 ), entry as (
   update public.study_entries e set started_at=t.at-interval '1 second',
     phase_ends_at=t.at-interval '1 second'+interval '25 minutes'
   from fixture_clock t where e.id=$1 returning e.id,e.version
 ), focus as (
   update public.study_intervals i set started_at=t.at-interval '1 second'
   from entry e cross join fixture_clock t where i.entry_id=e.id and i.ended_at is null
   returning i.id
 )
 select (extract(epoch from t.at)*1000)::bigint::text as at,e.version from fixture_clock t cross join entry e cross join focus`,[id]);
 await asOwner();
 const broken=(await q('select public.replay_timer_action($1::jsonb) r',[JSON.stringify({id:randomUUID(),entryId:id,version,device:'phone-webview',action:'break',at:Number(at)})]))[0].r;
 expect(broken.outcome).toBe('applied');
 const entry=(await q('select phase,status,cycle,phase_ends_at,version from public.study_entries where id=$1',[id]))[0];
 const intervals=await q('select kind from public.study_intervals where entry_id=$1 and ended_at is null',[id]);
 const leased=await cmd('take_lease',id,entry.version,{device:'phone-webview'});
 let nextError='';try{await cmd('next_phase',id,leased.changed[0].version,{device:'phone-webview',lease_version:2});}catch(e:any){nextError=e.message;}
 console.info('after native break',entry,intervals,'next phase error',nextError);
 expect({phase:entry.phase,open:intervals[0]?.kind,nextError}).toEqual({phase:'break',open:'break',nextError:''});
});

it('Later on a tutor reminder must prevent new tutor pushes until the persisted hold expires',async()=>{
 await admin();
 const old=(await q("insert into public.notifications(user_id,kind,key,title,body,url,status,sent_at,due_at) values($1,'tutor','old','Old tutor','Old summary','#/proposals','sent',now()-interval '4 hours',now()-interval '4 hours') returning id",[uid]))[0].id;
 await q("insert into public.proposals(user_id,project_id,kind,payload,origin,created_at) values($1,$2,'card','{\"front\":\"New theorem\",\"back\":\"Proof\"}','chatgpt',now()-interval '20 minutes')",[uid,project]);
 await role('service_role');await q("select public.notify_act($1,$2,'later','{}')",[uid,old]);
 const facts=(await q('select public.notify_candidates($1,now()) r',[uid]))[0].r;
 await admin();const hold=(await q('select scope,"until" from public.notify_holds where user_id=$1',[uid]))[0];await role('service_role');
 const sent:any[]=[];
 const port:any={owners:async()=>[uid],facts:async()=>facts,prefs:async()=>({enabled:true,mode:'as-happens',quiet:{start:'00:00',end:'00:00'},kinds:{due:false,deadline:false,behind:false,resume:false,digest:false,plan:false,tutor:true}}),
 queue:async(user:string,rows:any[])=>(await q('select public.notify_queue($1,$2::jsonb) n',[user,JSON.stringify(rows)]))[0].n,
 claim:async(user:string,limit:number)=>q('select * from public.notify_claim($1,$2)',[user,limit]),record:async()=>{},tokens:async()=>[{id:'phone',token:'fake'}],deleteToken:async()=>{},webDevices:async()=>[],webRecord:async()=>{}};
 const result=await runNoticeTick(port,{send:async(_token,data)=>{sent.push(data);return 'sent';}},Date.now());
 console.info('active hold',hold,'pushes sent',sent.map(x=>({kind:x.kind,title:x.title})),result);
 expect(sent).toHaveLength(0);
});

it('a transient FCM failure must leave the due reminder deliverable on the next healthy tick',async()=>{
 await role('service_role');let sends=0;
 const port:any={owners:async()=>[uid],facts:async()=>({tz:'UTC',due:{count:20},history:{sentToday:0,lastByKey:{}}}),prefs:async()=>({enabled:true,mode:'as-happens',studyTime:'00:00',quiet:{start:'00:00',end:'00:00'},kinds:{due:true,digest:false}}),
 queue:async(user:string,rows:any[])=>(await q('select public.notify_queue($1,$2::jsonb) n',[user,JSON.stringify(rows)]))[0].n,
 claim:async(user:string,limit:number)=>q('select * from public.notify_claim($1,$2)',[user,limit]),
 record:async(user:string,id:number,reason:string)=>{await q('select public.notify_record($1,$2,$3)',[user,id,reason]);},
 tokens:async()=>[{id:'phone',token:'fake'}],deleteToken:async()=>{},webDevices:async()=>[],webRecord:async()=>{}};
 const sender:any={send:async()=>++sends===1?'retry':'sent'};
 const first=await runNoticeTick(port,sender,Date.now());await admin();await q("update public.notifications set due_at=now()-interval '1 second' where user_id=$1",[uid]);await role('service_role');const second=await runNoticeTick(port,sender,Date.now()+5*60_000);
 await admin();const rows=await q('select key,status,reason from public.notifications where user_id=$1',[uid]);
 console.info('transient then healthy',first,second,'send attempts',sends,rows);
 expect(second.sent).toBe(1);
});

it('replays an offline pause/resume chain at its original timestamps and replays each receipt once',async()=>{
 const created=await cmd('create',undefined,undefined,{source:'timer',intent:'Offline chain'}),id=created.changed[0].id;
 const started=await cmd('start',id,1);const now=Date.now();
 await admin();await q('update public.study_intervals set started_at=$2 where entry_id=$1',[id,new Date(now-30*60000).toISOString()]);await asOwner();
 const pause={id:randomUUID(),entryId:id,version:started.changed[0].version,device:'phone',action:'pause',at:now-20*60000};
 const resume={...pause,id:randomUUID(),action:'resume',at:now-10*60000};
 const apply=async(a:any)=>(await q('select public.replay_timer_action($1::jsonb) r',[JSON.stringify(a)]))[0].r;
 const first=await apply(pause);expect(first.outcome).toBe('applied');expect(await apply(pause)).toEqual(first);
 expect((await apply(resume)).outcome).toBe('applied');
 const spans=await q('select kind,started_at,ended_at from public.study_intervals where entry_id=$1 order by started_at',[id]);
 expect(spans).toHaveLength(2);
 expect(new Date(spans[0].ended_at).getTime()-new Date(spans[0].started_at).getTime()).toBe(10*60000);
 expect(new Date(spans[1].started_at).getTime()).toBe(resume.at);
 expect((await q('select status from public.study_entries where id=$1',[id]))[0].status).toBe('running');
});

it('never rebases an offline native action across a change by another device',async()=>{
 const created=await cmd('create',undefined,undefined,{source:'timer',intent:'Other device'}),id=created.changed[0].id;
 const started=await cmd('start',id,1);const lease=await cmd('take_lease',id,started.changed[0].version,{device:'web-other'});
 const result=(await q('select public.replay_timer_action($1::jsonb) r',[JSON.stringify({id:randomUUID(),entryId:id,version:lease.changed[0].version,device:'phone',action:'pause',at:Date.now()})]))[0].r;
 expect(result.outcome).toBe('skipped');expect((await q('select status from public.study_entries where id=$1',[id]))[0].status).toBe('running');
});

it('recovers an abandoned reminder claim and rechecks a hold on an already queued reminder',async()=>{
 await admin();const id=(await q("insert into public.notifications(user_id,kind,key,title,body,url,due_at,delivery_claimed_at) values($1,'tutor','queued-hold','Tutor','Proof','#/proposals',now(),now()-interval '3 minutes') returning id",[uid]))[0].id;
 await q("insert into public.notify_holds(user_id,scope,\"until\") values($1,'tutor',now()+interval '1 hour')",[uid]);await role('service_role');
 expect(await q('select * from public.notify_claim($1,10)',[uid])).toHaveLength(0);
 await admin();await q('delete from public.notify_holds where user_id=$1',[uid]);await role('service_role');
 expect((await q('select * from public.notify_claim($1,10)',[uid])).map(x=>x.id)).toEqual([id]);
});

it('refuses native actions without their original version and timestamp',async()=>{
 const created=await cmd('create',undefined,undefined,{source:'timer',intent:'Validated replay'}),id=created.changed[0].id;
 const started=await cmd('start',id,1);
 for(const missing of ['version','at']){
  const action:any={id:randomUUID(),entryId:id,version:started.changed[0].version,device:'phone',action:'pause',at:Date.now()};delete action[missing];
  await expect(q('select public.replay_timer_action($1::jsonb)',[JSON.stringify(action)])).rejects.toThrow('Invalid native action');
 }
 expect((await q('select status from public.study_entries where id=$1',[id]))[0].status).toBe('running');
});
