import {useEffect,useRef,useState} from 'react';
import {getDayPlanApi} from '../../data/day-plans';
import type {DayPlanRecord,DayPlanItem} from '../../data/day-plans/contract';
import {getStudyApi} from '../../data/study';
import type {CalendarBlockRecord} from '../../data/study/contract';
import {dayBounds} from '../../lib/effort';
import TaskSheet from '../tasks/TaskSheet';
const button='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50';
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

export default function V6TodayPlan({zone,due,reviewLimit}:{
 zone:string;due:number;reviewLimit:number;
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
   setPlan(receipt.record);setNotice('Intention saved');
   setReload(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:'Could not save intention')}
  finally{setBusy(false)}
 }
 const next=nextPlannedBlock(plan,items,blocks,new Date().toISOString());
 async function start(block:CalendarBlockRecord){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   if(!plan)throw Error('No committed day plan is available');
   const receipt=await startVerifiedPlannedBlock(date,zone,plan,block);
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
 return <section aria-label="Today plan" className="space-y-3 rounded-ctl border border-edge bg-[var(--paper)] p-4">
  <h2 className="text-title-s font-semibold">Today plan</h2>
  <p className="text-label text-ink-2">Review batch: <strong>{batch}</strong> of {Math.max(0,due)} due</p>
  {loading?<p role="status">Loading your plan…</p>:error&&!plan?
   <p role="alert">{error} <button className={button} type="button"
    onClick={()=>setReload(n=>n+1)}>Retry</button></p>:<>
   {!plan&&<p>No plan yet. Set an intention to begin your day.</p>}
   <label className="block text-label">Today's intention
    <textarea aria-label="Today's intention" maxLength={1200} value={intention}
     className="mt-1 min-h-20 w-full rounded-ctl border border-edge bg-fill-1 p-3"
     disabled={busy||!!plan&&!['draft','previewed'].includes(plan.status)}
     onChange={e=>setIntention(e.target.value)}/>
   </label>
   {!plan||['draft','previewed'].includes(plan.status)?
    <button className={button} type="button" disabled={busy}
     onClick={()=>{void saveIntention()}}>Save intention</button>:
    <p className="text-label text-ink-2">Committed or closed plans can be edited from the planner.</p>}
   {next?<div aria-label="Next planned block" className="rounded-ctl bg-fill-1 p-3">
    <p className="break-words text-label font-semibold [overflow-wrap:anywhere]">{next.title}</p>
    <p className="text-caption">{new Intl.DateTimeFormat('en',{
     timeZone:zone,hour:'numeric',minute:'2-digit',
    }).format(new Date(next.startsAt))}</p>
    <button className={button} type="button" disabled={busy}
     onClick={()=>{void start(next)}}>Start planned focus</button>
    <p className="mt-2 text-caption text-ink-2">Focus is linked to this calendar block and inherits its learning links.</p>
   </div>:<p className="text-label text-ink-2">No upcoming committed study block today.</p>}
   {error&&<p role="alert">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <button ref={taskTrigger} className={button} type="button"
    onClick={()=>setTaskOpen(true)}>Add task</button>
   {taskOpen&&<TaskSheet onDismiss={()=>{setTaskOpen(false);taskTrigger.current?.focus()}}
    onSaved={()=>{setTaskOpen(false);taskTrigger.current?.focus();setReload(x=>x+1)}}/>}
  </>}
 </section>;
}
