import {lazy,Suspense,useEffect,useRef,useState,type ReactNode} from 'react';
import {Link} from 'react-router';
import {CalendarDays,ChevronRight,Folder,Layers,Moon} from 'lucide-react';
import {useReviewEstimate} from '../review/v6/estimate';
import {getDayPlanApi} from '../../data/day-plans';
import type {DayPlanRecord,DayPlanItem} from '../../data/day-plans/contract';
import {getStudyApi} from '../../data/study';
import type {CalendarBlockRecord} from '../../data/study/contract';
import {dayBounds} from '../../lib/effort';
import {formatTime,formatDuration} from '../../lib/format';
import TaskSheet from '../tasks/TaskSheet';
const TodayDue=lazy(()=>import('./TodayDue'));
const button='min-h-11 self-start rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-label font-semibold text-ink disabled:opacity-50';
export function ownerToday(zone:string,now=new Date()):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(key:string)=>parts.find(p=>p.type===key)?.value??'';
 return part('year')+'-'+part('month')+'-'+part('day');
}
export function nextPlannedBlock(plan:DayPlanRecord|null,items:DayPlanItem[],
 blocks:CalendarBlockRecord[],now:string):CalendarBlockRecord|null{
 if(plan?.status!=='committed')return null;
 const placed=new Set(items.filter(x=>x.disposition==='placed'&&x.blockId!==null).map(x=>x.blockId));
 return blocks.filter(x=>placed.has(x.id)&&x.kind==='study'&&x.status==='planned'&&
  Date.parse(x.endsAt)>Date.parse(now))
  .sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id))[0]??null;
}
/** N121 C1: today's planned blocks (study or busy) that have not ended, in start order. */
export function todaysSchedule(blocks:CalendarBlockRecord[],now:string):CalendarBlockRecord[]{
 return blocks.filter(block=>block.status==='planned'&&Date.parse(block.endsAt)>Date.parse(now))
  .sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id));
}
/** The owner-zone hour now (0–23), used to offer Close the day in the evening. */
export function ownerHour(zone:string,now=new Date()):number{
 return Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
}
export function nextCalendarBlock(blocks:CalendarBlockRecord[],now:string):CalendarBlockRecord|null{
 return blocks.filter(block=>block.kind==='study'&&block.status==='planned'&&
  Date.parse(block.endsAt)>Date.parse(now))
  .sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id))[0]??null;
}
export async function readTodayPlan(date:string,zone:string):Promise<{
 plan:DayPlanRecord|null;items:DayPlanItem[];blocks:CalendarBlockRecord[];
}>{
 const api=getDayPlanApi();const plans:DayPlanRecord[]=[];const cursors=new Set<string>();
 let cursor:string|null=null;let total:number|null=null;
 for(let i=0;i<100;i++){
  const page=await api.listPlans({from:date,through:date,limit:50,cursor});
  if(page.items.length>50||!Number.isSafeInteger(page.total)||page.total<0)
   throw Error('Invalid day-plan page');
  if(total!==null&&page.total!==total)throw Error('Day-plan total changed');
  total=page.total;plans.push(...page.items);
  if(!page.nextCursor)break;
  if(cursors.has(page.nextCursor))throw Error('Repeated day-plan cursor');
  cursors.add(page.nextCursor);cursor=page.nextCursor;
  if(i===99)throw Error('Day-plan pagination safety bound');
 }
 if(plans.length!==total||plans.some(p=>p.planDate!==date)||plans.length>1)
  throw Error('Inconsistent owner day-plan date');
 const plan=plans[0]??null,items:DayPlanItem[]=[];
 if(plan){
  let itemCursor:string|null=null,itemTotal:number|null=null;
  const seen=new Set<string>();
  for(let i=0;i<100;i++){
   const page=await api.listItems(plan.id,{limit:50,cursor:itemCursor});
   if(page.items.length>50||!Number.isSafeInteger(page.total)||page.total<0)
    throw Error('Invalid owner plan items');
   if(itemTotal!==null&&page.total!==itemTotal)throw Error('Day-plan items changed');
   itemTotal=page.total;items.push(...page.items);
   if(!page.nextCursor)break;
   if(seen.has(page.nextCursor))throw Error('Repeated day-plan item cursor');
   seen.add(page.nextCursor);itemCursor=page.nextCursor;
   if(i===99)throw Error('Plan item pagination safety bound');
  }
  if(itemTotal!==items.length||items.some(x=>x.planId!==plan.id))
   throw Error('Incomplete owner plan items');
 }
 return {plan,items,blocks:await getStudyApi().listCalendarBlocks(dayBounds(date,zone))};
}

/** Recheck the owner plan, placement and exact block version immediately
 * before starting focus. A stale preview must not start a cancelled or
 * replaced block. The StudyApi preserves the owner's block reference. */
export async function startVerifiedPlannedBlock(
 date:string,zone:string,shownPlan:DayPlanRecord,shown:CalendarBlockRecord,
 now=new Date().toISOString()
){
 const study=getStudyApi();
 if(await study.activeStudyEntry())
  throw Error('Finish or resume your active focus session first');
 const current=await readTodayPlan(date,zone);
 if(!current.plan||current.plan.id!==shownPlan.id||
  current.plan.version!==shownPlan.version)
  throw Error('Day plan changed; refresh Today before starting focus');
 const next=nextPlannedBlock(current.plan,current.items,current.blocks,now);
 if(!next||next.id!==shown.id||next.version!==shown.version)
  throw Error('Planned block changed; refresh Today before starting focus');
 return study.startStudyEntry({
  source:'timer',intent:next.title,startedAt:now,calendarBlockId:next.id,
  subjectId:next.subjectId??null,projectId:next.projectId??null,
  checkpointId:next.checkpointId??null,sessionId:next.sessionId??null,
 });
}

export default function V6TodayPlan({zone,due,reviewLimit,children}:{
 zone:string;due:number;reviewLimit:number;children?:ReactNode;
}){
 const date=ownerToday(zone);
 const [plan,setPlan]=useState<DayPlanRecord|null>(null);
 const [items,setItems]=useState<DayPlanItem[]>([]);
 const [blocks,setBlocks]=useState<CalendarBlockRecord[]>([]);
 const [intention,setIntention]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [taskOpen,setTaskOpen]=useState(false),[reload,setReload]=useState(0);
 const taskTrigger=useRef<HTMLButtonElement>(null);
 const [dueReady,setDueReady]=useState(false);
 useEffect(()=>{const timer=window.setTimeout(()=>setDueReady(true),400);return()=>window.clearTimeout(timer)},[]);
 useEffect(()=>{
  let alive=true;setLoading(true);setError('');
  void readTodayPlan(date,zone).then(data=>{
   if(!alive)return;
   setPlan(data.plan);setItems(data.items);setBlocks(data.blocks);
   setIntention(data.plan?.intention??'');setLoading(false);
  }).catch(e=>{
   if(alive){setError(e instanceof Error?e.message:'Could not load plan');setLoading(false)}
  });
  return ()=>{alive=false};
 },[date,zone,reload]);
 async function saveIntention(){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const api=getDayPlanApi();
   const receipt=plan
    ?await api.updatePlan(plan.id,plan.version,{intention})
    :await api.createPlan({planDate:date,timeZone:zone,intention});
   setPlan(receipt.record);setNotice('Aim saved');
   setReload(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:'Could not save intention')}
  finally{setBusy(false)}
 }
 const next=nextCalendarBlock(blocks,new Date().toISOString());
 async function start(block:CalendarBlockRecord){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const placed=plan?.status==='committed'&&items.some(item=>item.disposition==='placed'&&item.blockId===block.id);
   const receipt=placed&&plan?await startVerifiedPlannedBlock(date,zone,plan,block):
    await (async()=>{
     const study=getStudyApi();
     if(await study.activeStudyEntry())throw Error('Finish or resume your active focus session first');
     const fresh=(await study.listCalendarBlocks(dayBounds(date,zone))).find(item=>item.id===block.id);
     if(!fresh||fresh.version!==block.version||fresh.status!=='planned')
      throw Error('Calendar block changed. Refresh Today before starting focus.');
     return study.startStudyEntry({source:'timer',intent:fresh.title,calendarBlockId:fresh.id,
      subjectId:fresh.subjectId??null,projectId:fresh.projectId??null,
      checkpointId:fresh.checkpointId??null,sessionId:fresh.sessionId??null});
    })();
   setNotice('Focus started: '+receipt.record.intent);
   // The planner and Focus are sibling Today surfaces. Refresh their one
   // canonical session immediately rather than displaying a stale Start card.
   window.dispatchEvent(new Event('lemma:focus-changed'));
   window.dispatchEvent(new Event('lemma:planned-focus-started'));
  }catch(e){setError(e instanceof Error?e.message:'Could not start planned focus')}
  finally{setBusy(false)}
 }
 const batch=Math.min(Number.isFinite(due)?Math.max(0,Math.floor(due)):0,
  Number.isFinite(reviewLimit)?Math.max(0,Math.floor(reviewLimit)):0);
 // N121 C4: real average review time, read only after first paint (the count shows meanwhile).
 const minutes=useReviewEstimate(batch,dueReady);
 const time=(iso:string)=>formatTime(iso,{zone,clock24h:true});
 const length=(block:CalendarBlockRecord)=>formatDuration(Math.max(0,
  (Date.parse(block.endsAt)-Date.parse(block.startsAt))/60_000));
 const nowIso=new Date().toISOString();
 const schedule=todaysSchedule(blocks,nowIso);
 const shown=schedule.slice(0,3);
 const evening=ownerHour(zone)>=17;
 // N111 (mockup "Also in your notebook"): review and the next planned block as rows.
 // N121 C1: Today reads the calendar directly; up to three of today's blocks, the next study block keeps Start.
 return <section aria-label="Today plan" className="notebook-secondary-tasks flex min-w-0 flex-col">
  <h2 className="notebook-also-heading">Also in your notebook</h2>
  {batch>0&&<Link to="/review" className="notebook-task-row">
   <Layers size={20} aria-hidden="true"/>
   <span><strong>{batch.toLocaleString()} cards for today</strong><small>{minutes===null?'Review today':'About '+minutes+' min · Review today'}</small></span>
   <ChevronRight size={19} aria-hidden="true"/>
  </Link>}
  {dueReady&&<Suspense fallback={null}><TodayDue date={date} zone={zone}/></Suspense>}
  {!loading&&<section aria-label="Today's schedule" className="flex min-w-0 flex-col">
   {shown.map(block=>{
    const started=Date.parse(block.startsAt)<=Date.parse(nowIso);
    const when=started?'Now':time(block.startsAt)+'–'+time(block.endsAt);
    const isNext=next?.id===block.id;
    return <div key={block.id} aria-label={isNext?'Next planned block':undefined} className={isNext?'lemma-next-block-row':undefined}>
     <Link to={'/calendar?view=day&edit='+encodeURIComponent(block.id)} className="notebook-task-row">
      <CalendarDays size={20} aria-hidden="true"/>
      <span><strong className="break-words [overflow-wrap:anywhere]">{block.title}</strong>
       <small>{when} · {block.kind==='busy'?'Busy':length(block)}</small></span>
      {!isNext&&<ChevronRight size={19} aria-hidden="true"/>}
     </Link>
     {isNext&&<button className="lemma-next-block-start" type="button" disabled={busy} aria-label="Start planned focus"
      onClick={()=>{void start(block)}}>Start</button>}
    </div>;
   })}
   {schedule.length>3&&<Link to="/calendar?view=day" className="notebook-task-row">
    <CalendarDays size={20} aria-hidden="true"/>
    <span><strong>{schedule.length-3} more in Calendar</strong><small>Today's schedule</small></span>
    <ChevronRight size={19} aria-hidden="true"/>
   </Link>}
   {schedule.length===0&&<Link to="/calendar?new=block" className="notebook-task-row">
    <CalendarDays size={20} aria-hidden="true"/>
    <span><strong>Nothing else planned today</strong><small>Plan a block</small></span>
    <ChevronRight size={19} aria-hidden="true"/>
   </Link>}
  </section>}
  {next&&!shown.some(block=>block.id===next.id)&&<div aria-label="Next planned block" className="lemma-next-block-row">
   <Link to="/calendar?view=day" className="notebook-task-row">
    <CalendarDays size={20} aria-hidden="true"/>
    <span><strong className="break-words [overflow-wrap:anywhere]">{next.title}</strong>
     <small>Next study · {time(next.startsAt)} · {length(next)}</small></span>
   </Link>
   <button className="lemma-next-block-start" type="button" disabled={busy} aria-label="Start planned focus"
    onClick={()=>{void start(next)}}>Start</button>
  </div>}
  {evening&&<Link to="/today/close" className="notebook-task-row">
   <Moon size={20} aria-hidden="true"/>
   <span><strong>Close the day</strong><small>Look back and set up tomorrow</small></span>
   <ChevronRight size={19} aria-hidden="true"/>
  </Link>}
  <Link to="/projects" className="notebook-task-row">
   <Folder size={20} aria-hidden="true"/>
   <span><strong>Your learning paths</strong><small>Find checkpoints, sessions and sources</small></span>
   <ChevronRight size={19} aria-hidden="true"/>
  </Link>
  <details className="notebook-queue-details lemma-disclosure border-b border-[var(--hair)]">
   <summary>Today’s plan · {plan?(plan.intention?plan.intention.slice(0,40)+(plan.intention.length>40?'…':''):'Planned'):'No plan yet'}</summary>
   <div className="flex flex-col gap-3 pb-4">
    {children}
    {loading?<p role="status">Loading your plan…</p>:error&&!plan?
     <p role="alert">{error} <button className={button} type="button"
      onClick={()=>setReload(n=>n+1)}>Retry</button></p>:<>
     {!plan&&<p>No plan yet. Write an aim for the day to begin.</p>}
     <label className="block text-label">Aim for the day
      <textarea aria-label="Aim for the day" maxLength={1200} value={intention}
       className="mt-1 min-h-20 w-full rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] p-3"
       disabled={busy||!!plan&&!['draft','previewed'].includes(plan.status)}
       onChange={e=>setIntention(e.target.value)}/>
     </label>
     {!plan||['draft','previewed'].includes(plan.status)?
      <button className={button} type="button" disabled={busy}
       onClick={()=>{void saveIntention()}}>Save aim</button>:
      <p className="text-label text-ink-2">Committed or closed plans can be edited from the planner.</p>}
     {next&&<p className="text-caption text-ink-2">Starting focus from a block links the time to it.</p>}
     {error&&<p role="alert">{error}</p>}
     {notice&&<p role="status">{notice}</p>}
     <button ref={taskTrigger} className={button} type="button"
      onClick={()=>setTaskOpen(true)}>Add task</button>
     {taskOpen&&<TaskSheet onDismiss={()=>{setTaskOpen(false);taskTrigger.current?.focus()}}
      onSaved={()=>{setTaskOpen(false);taskTrigger.current?.focus();setReload(x=>x+1)}}/>}
    </>}
   </div>
  </details>
 </section>;
}
