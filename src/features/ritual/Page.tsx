// N69 v6 ritual uses existing owner-only APIs; it cannot close future dates.
import {useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {getDayPlanApi,type DayPlanRecord} from '../../data/day-plans';
import {getThoughtApi,type ParkedThought} from '../../data/parked-thoughts';
import {getTaskApi,type TaskRecord} from '../../data/tasks';
import {getStudyApi,type StudyEntryRecord} from '../../data/study';
import {canCloseOwnerDay,ownerCivilDate} from './model';
const control='min-h-11 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label font-semibold disabled:opacity-50';
export default function Page(){
 const navigate=useNavigate(),[params]=useSearchParams();
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const today=ownerCivilDate(new Date(),zone);
 const given=params.get('date');
 const date=given&&/^\d{4}-\d{2}-\d{2}$/.test(given)?given:today;
 const [plan,setPlan]=useState<DayPlanRecord|null>(null);
 const [tasks,setTasks]=useState<TaskRecord[]>([]);
 const [thoughts,setThoughts]=useState<ParkedThought[]>([]);
 const [saved,setSaved]=useState<StudyEntryRecord[]>([]);
 const [carry,setCarry]=useState<Set<string>>(new Set());
 const [first,setFirst]=useState('');
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true;setLoading(true);setError(null);
  void (async()=>{
   const plans=await getDayPlanApi().listPlans({from:date,through:date,limit:1});
   const p=plans.items[0]??null;
   const tasksOut:TaskRecord[]=[];
   let cursor:string|null=null;
   for(let page=0;page<20;page++){
    const batch=await getTaskApi().listTasks({
     status:['backlog','in_progress'],limit:50,cursor});
    tasksOut.push(...batch.items);
    cursor=batch.nextCursor;
    if(!cursor)break;
   }
   const thoughtOut:ParkedThought[]=[];
   cursor=null;
   for(let page=0;page<10;page++){
    const batch=await getThoughtApi().listThoughts({status:['open'],limit:50,cursor});
    thoughtOut.push(...batch.items);cursor=batch.nextCursor;
    if(!cursor)break;
   }
   const baseline=Date.parse(date+'T00:00:00Z');
   const entries=await getStudyApi().listStudyEntries({
    start:new Date(baseline-86400000).toISOString(),
    end:new Date(baseline+2*86400000).toISOString(),
   });
   const todayEntries=entries.filter(entry=>entry.status==='saved'&&
    entry.intervals.some(interval=>interval.kind==='focus'&&
     interval.end&&ownerCivilDate(new Date(interval.end),zone)===date));
   if(!active)return;
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
 },[date,zone,reload]);
 async function mutate(action:()=>Promise<unknown>){
  if(busy)return;setBusy(true);setError(null);
  try{await action();setReload(x=>x+1)}
  catch(e){setError(e instanceof Error?e.message:'Could not save this change')}
  finally{setBusy(false)}
 }
 const canClose=canCloseOwnerDay(date,new Date(),zone)&&
  plan?.status==='committed'&&thoughts.length===0;
 return <main aria-label="Close day ritual" className="flex min-w-0 flex-col gap-4 pb-24">
  <header className="flex items-center justify-between gap-2">
   <button type="button" className={control} onClick={()=>navigate('/')}>Back to Today</button>
   <h1 className="text-title-s font-semibold">Close the day</h1>
  </header>
  <p className="text-label text-ink-2"><time dateTime={date}>{date}</time> · {zone}</p>
  {error&&<p role="alert">{error}</p>}
  {loading?<p role="status">Loading your dated plan and saved work…</p>:!plan?
   <p role="status">No day plan exists for this date. Create one from Today before closing it.</p>:<>
   <section className="rounded-ctl border border-edge p-3">
    <h2 className="font-semibold">Day plan</h2>
    <p className="text-label">{plan.intention||'No intention recorded'}</p>
    <p className="text-label">Status: {plan.status}</p>
    {plan.status==='previewed'&&<button className={control} disabled={busy}
     onClick={()=>void mutate(()=>getDayPlanApi().commitPlan(plan.id,plan.version))}>
     Commit previewed plan</button>}
   </section>
   <section aria-label="Saved study today" className="rounded-ctl border border-edge p-3">
    <h2 className="font-semibold">What you saved today</h2>
    {saved.length?<ul className="mt-2 list-disc pl-5">{saved.map(entry=>
     <li key={entry.id}>{entry.intent||'Study session'} · {entry.rating??'Unrated'}</li>)}
    </ul>:<p className="text-label text-ink-2">No saved focus for this date.</p>}
   </section>
   <section aria-label="Resolve parked thoughts" className="rounded-ctl border border-edge p-3">
    <h2 className="font-semibold">Resolve parked thoughts</h2>
    {thoughts.length===0?<p className="text-label">No open thoughts to resolve.</p>:
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
   </section>
   <section aria-label="Carry over unfinished tasks" className="rounded-ctl border border-edge p-3">
    <h2 className="font-semibold">Carry over unfinished tasks</h2>
    {tasks.length===0?<p className="text-label">No unfinished tasks.</p>:<ul>
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
   {plan.status==='closed'?<button className={control} disabled={busy}
    onClick={()=>void mutate(()=>getDayPlanApi().reopenPlan(plan.id,plan.version))}>
    Reopen this date</button>:
    <button className={control} disabled={busy||!canClose}
     onClick={()=>void mutate(()=>getDayPlanApi().closePlan(plan.id,plan.version,{
      ...plan.ritual,carryOverTaskIds:[...carry],tomorrowFirstTaskId:first||null,
     }))}>Close {date}</button>}
   {!canClose&&plan.status!=='closed'&&<p role="status" className="text-label text-ink-2">
    {date>today?'Future dates cannot be closed.':
     thoughts.length?'Resolve the open thoughts before closing.':
     'Commit the day plan before closing.'}
   </p>}
  </>}
 </main>;
}
