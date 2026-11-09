// N69 v6 ritual uses existing owner-only APIs; it cannot close future dates.
import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import type {CalendarBlockRecord} from '../../data/study/contract';
import {formatDuration,formatTimeRange} from '../../lib/format';
import {ratingText} from '../../lib/labels';
import {civilDayLabel} from '../calendar/views/labels';
import {calendarRange,shiftDay} from '../calendar/model';
import {getDayPlanApi,type DayPlanRecord} from '../../data/day-plans';
import {getThoughtApi,type ParkedThought} from '../../data/parked-thoughts';
import {getTaskApi,type TaskRecord} from '../../data/tasks';
import {getStudyApi,type StudyEntryRecord} from '../../data/study';
import {useSettings} from '../../data/hooks';
import {civilPlanDate} from '../../data/day-plans/model';
import {canCloseOwnerDay,normalizeCarryOverChoices,ownerCivilDate,savedFocusTouchesOwnerDay} from './model';
const control='min-h-11 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label font-semibold disabled:opacity-50';
export default function Page(){
 const [params]=useSearchParams();
 const settings=useSettings();
 // The authenticated account timezone, not the travelling device, owns today.
 const zone=settings.data?.timeZone??'UTC';
 const today=ownerCivilDate(new Date(),zone);
 const given=params.get('date');
 let invalidDate=false;
 let date=today;
 if(given!==null){
  try{date=civilPlanDate(given)}catch{invalidDate=true}
 }
 const [plan,setPlan]=useState<DayPlanRecord|null>(null);
 const [tasks,setTasks]=useState<TaskRecord[]>([]);
 const [thoughts,setThoughts]=useState<ParkedThought[]>([]);
 const [saved,setSaved]=useState<StudyEntryRecord[]>([]);
 const [carry,setCarry]=useState<Set<string>>(new Set());
 const [first,setFirst]=useState('');
 const [tomorrowBlock,setTomorrowBlock]=useState<CalendarBlockRecord|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true;setLoading(true);setError(null);
  void (async()=>{
   if(invalidDate)throw new Error('Invalid owner civil date');
   const plans=await getDayPlanApi().listPlans({from:date,through:date,limit:1});
   const p=plans.items[0]??null;
   const tasksOut:TaskRecord[]=[];
   let cursor:string|null=null;
   const taskCursors=new Set<string>();
   for(let page=0;page<20;page++){
    const batch=await getTaskApi().listTasks({
     status:['backlog','in_progress'],limit:50,cursor});
    if(!Array.isArray(batch.items)||batch.items.length>50||
     !Number.isSafeInteger(batch.total)||batch.total<tasksOut.length+batch.items.length)
     throw new Error('Invalid unfinished task page; reload the ritual');
    tasksOut.push(...batch.items);
    cursor=batch.nextCursor;
    if(!cursor){
     if(tasksOut.length!==batch.total)throw new Error('Unfinished task list changed; reload');
     break;
    }
    if(typeof cursor!=='string'||taskCursors.has(cursor)||batch.items.length===0)
     throw new Error('Unfinished task cursor did not advance; reload');
    taskCursors.add(cursor);
    if(page===19)throw new Error('Unfinished tasks exceed the bounded ritual listing');
   }
   const thoughtOut:ParkedThought[]=[];
   const thoughtCursors=new Set<string>();
   cursor=null;
   for(let page=0;page<10;page++){
    const batch=await getThoughtApi().listThoughts({status:['open'],limit:50,cursor});
    if(!Array.isArray(batch.items)||batch.items.length>50||
     !Number.isSafeInteger(batch.total)||batch.total<thoughtOut.length+batch.items.length)
     throw new Error('Invalid open thought page; reload the ritual');
    thoughtOut.push(...batch.items);cursor=batch.nextCursor;
    if(!cursor){
     if(thoughtOut.length!==batch.total)throw new Error('Open thoughts changed; reload');
     break;
    }
    if(typeof cursor!=='string'||thoughtCursors.has(cursor)||batch.items.length===0)
     throw new Error('Open thought cursor did not advance; reload');
    thoughtCursors.add(cursor);
    if(page===9)throw new Error('Open thoughts exceed the bounded ritual listing');
   }
   const baseline=Date.parse(date+'T00:00:00Z');
   const entries=await getStudyApi().listStudyEntries({
    start:new Date(baseline-86400000).toISOString(),
    end:new Date(baseline+2*86400000).toISOString(),
   });
   const todayEntries=entries.filter(entry=>
    savedFocusTouchesOwnerDay(entry,date,p?.timeZone??zone));
   // N121 C7: the first planned block tomorrow, straight from the calendar (no day plan needed).
   let nextBlock:CalendarBlockRecord|null=null;
   try{
    const tomorrow=await getStudyApi().listCalendarBlocks(calendarRange(shiftDay(date,1),p?.timeZone??zone));
    nextBlock=tomorrow.filter(block=>block.status==='planned').sort((a,b)=>a.startsAt.localeCompare(b.startsAt))[0]??null;
   }catch{nextBlock=null}
   if(!active)return;
   setTomorrowBlock(nextBlock);
   setPlan(p);setTasks(tasksOut);setThoughts(thoughtOut);setSaved(todayEntries);
   const ritual=p?.ritual??{};
   const remembered=Array.isArray(ritual.carryOverTaskIds)
    ?ritual.carryOverTaskIds.filter((id):id is string=>typeof id==='string'):[];
   setCarry(new Set(remembered));
   setFirst(typeof ritual.tomorrowFirstTaskId==='string'?
    ritual.tomorrowFirstTaskId:p?.tomorrowFirstTaskId??'');
  })().catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load the day')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[date,zone,invalidDate,reload]);
 async function mutate(action:()=>Promise<unknown>){
  if(busy)return;setBusy(true);setError(null);
  try{await action();setReload(x=>x+1)}
  catch(e){setError(e instanceof Error?e.message:'Could not save this change')}
  finally{setBusy(false)}
 }
 const planZone=plan?.timeZone??zone;
 const canClose=!loading&&!invalidDate&&!error&&
  canCloseOwnerDay(date,new Date(),planZone)&&
  plan?.status==='committed'&&thoughts.length===0;
 const statusText=(status:string)=>({draft:'Draft',previewed:'Not confirmed yet',committed:'Planned',closed:'Closed'} as Record<string,string>)[status]??'Planned';
 const minutesOf=(entry:StudyEntryRecord)=>entry.intervals.filter(i=>i.kind==='focus'&&i.end)
  .reduce((sum,i)=>sum+(Date.parse(i.end!)-Date.parse(i.start))/60000,0);
 const savedTotal=saved.reduce((sum,entry)=>sum+minutesOf(entry),0);
 const dayName=invalidDate?'':civilDayLabel(date);
 const savedSection=<section aria-label="Saved study today" className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
  <h2 className="font-semibold">What you saved today</h2>
  {saved.length?<><p className="text-label text-ink-2">{formatDuration(savedTotal)} of focus</p>
   <ul className="mt-2 flex flex-col gap-1">{saved.map(entry=>
   <li key={entry.id} className="break-words text-label">{entry.intent||'Study session'} · {formatDuration(minutesOf(entry))} · {entry.rating===null?'Not rated':ratingText(entry.rating)}</li>)}
  </ul></>:<p className="text-label text-ink-2">No saved focus for this date.</p>}
 </section>;
 const thoughtSection=<section aria-label="Resolve parked thoughts" className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
  <h2 className="font-semibold">Parked thoughts</h2>
  {thoughts.length===0?<p className="text-label text-ink-2">No open thoughts to resolve.</p>:
   <ul className="flex flex-col gap-3">{thoughts.map(thought=><li key={thought.id}>
    <p className="break-words">{thought.text}</p>
    <div className="mt-1 flex flex-wrap gap-2">
     <button className={control} disabled={busy} onClick={()=>void mutate(()=>
      getThoughtApi().dismissThought(thought.id,thought.version))}>Dismiss</button>
     <button className={control} disabled={busy} onClick={()=>void mutate(()=>
      getThoughtApi().convertToTask(thought.id,thought.version,{
       title:thought.text.slice(0,120),body:thought.text,
      }))}>Turn into task</button>
    </div>
   </li>)}</ul>}
 </section>;
 const tomorrowSection=<section aria-label="Tomorrow" className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
  <h2 className="font-semibold">Tomorrow</h2>
  {tomorrowBlock?<p className="text-label">First block: {tomorrowBlock.title} · {formatTimeRange(tomorrowBlock.startsAt,tomorrowBlock.endsAt,{zone:planZone,clock24h:true})}</p>:
   <p className="text-label text-ink-2">Nothing planned yet.</p>}
  <Link to={'/calendar?view=day&date='+(invalidDate?'':shiftDay(date,1))} className="mt-2 inline-flex min-h-11 items-center text-label text-[var(--link)] underline">
   {tomorrowBlock?'Open tomorrow in Calendar':'Start a plan for tomorrow'}</Link>
 </section>;
 return <section aria-label="Close day ritual" className="flex min-w-0 flex-col gap-4 pb-24">
  <h1 className="sr-only">Close the day</h1>
  {!invalidDate&&<p className="text-label text-ink-2"><time dateTime={date}>{date===today?'Today · '+dayName:dayName}</time></p>}
  {error&&<p role="alert">{error}</p>}
  {invalidDate?<p role="alert">Choose a real YYYY-MM-DD date.</p>:
   settings.isPending||loading?<p role="status">Loading your day…</p>:!plan?<>
   <p className="text-label text-ink-2">You didn't make a day plan for this date, so there is nothing to close. You can still review the day and set up tomorrow.</p>
   {savedSection}{thoughtSection}{tomorrowSection}
   </>:<>
   <section className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
    <h2 className="font-semibold">Day plan</h2>
    <p className="text-label">{plan.intention||'No aim recorded'}</p>
    <p className="text-label text-ink-2">{statusText(plan.status)}</p>
    {plan.status==='previewed'&&<button className={control} disabled={busy}
     onClick={()=>void mutate(()=>getDayPlanApi().commitPlan(plan.id,plan.version))}>
     Confirm this plan</button>}
   </section>
   {savedSection}
   {thoughtSection}
   <section aria-label="Carry over unfinished tasks" className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
    <h2 className="font-semibold">Carry over unfinished tasks</h2>
    {tasks.length===0?<p className="text-label text-ink-2">No unfinished tasks.</p>:<ul>
     {tasks.map(task=><li key={task.id}>
      <label className="flex min-h-11 items-center gap-2">
       <input type="checkbox" checked={carry.has(task.id)}
        onChange={e=>setCarry(previous=>{
         const next=new Set(previous);if(e.target.checked)next.add(task.id);else next.delete(task.id);
         return next;
        })}/>
       <span className="break-words text-label">{task.title}</span>
      </label>
     </li>)}
    </ul>}
    <label className="mt-2 flex flex-col gap-1 text-label">Tomorrow's first task
     <select className={control} value={first} onChange={e=>setFirst(e.target.value)}>
      <option value="">Not chosen yet</option>
      {tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}
     </select>
    </label>
   </section>
   {tomorrowSection}
   {plan.status==='closed'?<button className={control} disabled={busy}
    onClick={()=>void mutate(()=>getDayPlanApi().reopenPlan(plan.id,plan.version))}>
    Reopen this day</button>:
    <button className={control+' bg-amber text-amber-ink'} disabled={busy||!canClose}
     onClick={()=>void mutate(()=>getDayPlanApi().closePlan(plan.id,plan.version,{
      ...plan.ritual,...normalizeCarryOverChoices(tasks.map(x=>x.id),carry,first),
     }))}>Close {dayName}</button>}
   {!canClose&&plan.status!=='closed'&&<p role="status" className="text-label text-ink-2">
    {date>ownerCivilDate(new Date(),planZone)?'You can close a day once it has started.':
     thoughts.length?'Resolve the parked thoughts before closing.':
     'Confirm the day plan before closing.'}
   </p>}
  </>}
 </section>;
}
