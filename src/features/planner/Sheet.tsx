// N68 v6 owner planner: read-only preview first, no unattended block writes.
// A day-plan commit always rechecks task/block versions in one server command.
import {useEffect,useMemo,useRef,useState} from 'react';
import {getDayPlanApi} from '../../data/day-plans';
import {getTaskApi,type TaskRecord} from '../../data/tasks';
import {getStudyApi,type CalendarBlockRecord} from '../../data/study';
import {useToast} from '../../ui/Toast';
import {planTaskPlacements,type PlannerPlacement,type PlannerResult} from './model';
import {selectPlannerPlacements,validatePlannerWindow} from './selection';

type Move={date:string;start:string;end:string};
const button='min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold disabled:opacity-50';
const field='min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label';
function shiftDay(day:string,n:number):string{
 const time=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(time))throw new Error('Invalid planning day');
 return new Date(time+n*86400000).toISOString().slice(0,10);
}
function ownerDay(zone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const pick=(name:string)=>parts.find(x=>x.type===name)?.value??'';
 return pick('year')+'-'+pick('month')+'-'+pick('day');
}
async function readTasks():Promise<TaskRecord[]>{
 const rows:TaskRecord[]=[];let cursor:string|null=null;
 for(let i=0;i<10;i++){
  const page=await getTaskApi().listTasks({
   status:['backlog','in_progress'],limit:50,cursor});
  rows.push(...page.items);cursor=page.nextCursor;
  if(!cursor)return rows;
 }
 throw new Error('Task list exceeds 500; narrow your task selection');
}
export default function PlannerLaunch({date,zone}:{date?:string;zone?:string}){
 const notify=useToast(),dialog=useRef<HTMLDialogElement>(null);
 const [opened,setOpened]=useState(false);
 useEffect(()=>{
  if(!opened||!dialog.current)return;
  const node=dialog.current;
  if(typeof node.showModal==='function'&&!node.open)node.showModal();
 },[opened]);
 const ownerZone=zone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const anchor=date??ownerDay(ownerZone);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [preview,setPreview]=useState<PlannerResult|null>(null);
 const [tasks,setTasks]=useState<TaskRecord[]>([]);
 const [blocks,setBlocks]=useState<CalendarBlockRecord[]>([]);
 const [selected,setSelected]=useState<Set<string>>(new Set());
 const [overrides,setOverrides]=useState<Map<string,Move>>(new Map());
 const [rangeDays,setRangeDays]=useState(1);
 const end=shiftDay(anchor,rangeDays-1);
 const selection=useMemo(()=>{
  if(!preview)return {items:null,error:null};
  try{return {items:selectPlannerPlacements(preview,selected,overrides),error:null};}
  catch(e){return {items:null,error:e instanceof Error?e.message:'Invalid planning move'};}
 },[preview,selected,overrides]);
 async function load(){
  setLoading(true);setError(null);
  try{
   const taskRows=await readTasks();
   const start=shiftDay(anchor,-2)+'T00:00:00Z';
   const through=shiftDay(end,2)+'T00:00:00Z';
   const study=getStudyApi();
   const [blockRows,entries]=await Promise.all([
    study.listCalendarBlocks({start,end:through}),
    study.listStudyEntries({start,end:through}),
   ]);
   const result=planTaskPlacements({
    from:anchor,through:end,timeZone:ownerZone,
    tasks:taskRows.map(task=>({
     id:task.id,priority:task.priority,due:task.due,
     estimateMinutes:task.estimateMinutes,status:task.status,
    })),
    blocks:blockRows.map(block=>({
     id:block.id,startsAt:block.startsAt,endsAt:block.endsAt,
     kind:block.kind,status:block.status,
    })),
    savedEntries:entries.map(entry=>({id:entry.id,status:entry.status,
     intervals:entry.intervals})),
   });
   setTasks(taskRows);setBlocks(blockRows);setPreview(result);
   setSelected(new Set(result.placements.map(p=>p.taskId+':'+p.part)));
   setOverrides(new Map());
  }catch(e){setError(e instanceof Error?e.message:'Could not preview a plan');setPreview(null);}
  finally{setLoading(false);}
 }
 function show(){
  setOpened(true);
  void load();
 }
 function close(){
  if(typeof dialog.current?.close==='function')dialog.current.close();
  setOpened(false);
 }
 function changeMove(key:string,part:'start'|'end',value:string,
  original:Move){
  setOverrides(previous=>{
   const next=new Map(previous),updated={...(next.get(key)??original),[part]:value};
   updated.date=updated.start.slice(0,10);
   next.set(key,updated);return next;
  });
 }
 async function commit(){
  if(busy||!selection.items||!preview)return;
  if(selection.items.selected.length===0){
   setError('Choose at least one placement before committing');return;
  }
  setBusy(true);setError(null);
  const created:CalendarBlockRecord[]=[];
  let anyCommitted=false;
  try{
   // Advisory replay detection before writing. The authoritative N46.2
   // day_plans_command rechecks ALL declared versions inside its transaction.
   for(const task of tasks){
    const now=await getTaskApi().getTask(task.id);
    if(!now||now.version!==task.version)
     throw new Error('Task changed since preview; refresh the plan');
   }
   const scan=await getStudyApi().listCalendarBlocks({
    start:shiftDay(anchor,-2)+'T00:00:00Z',
    end:shiftDay(end,2)+'T00:00:00Z',
   });
   if(blocks.some(b=>scan.find(x=>x.id===b.id)?.version!==b.version)||
    scan.some(b=>!blocks.some(x=>x.id===b.id)))
    throw new Error('Calendar changed since preview; refresh the plan');
   validatePlannerWindow(selection.items.selected,scan,anchor,end,ownerZone);
   const byDate=new Map<string,PlannerPlacement[]>();
   for(const entry of selection.items.selected){
    byDate.set(entry.date,[...(byDate.get(entry.date)??[]),entry]);
   }
   for(const day of [...byDate.keys()].sort()){
    const placements=byDate.get(day)??[];
    const createdHere:CalendarBlockRecord[]=[];
    for(const place of placements){
     const title=tasks.find(x=>x.id===place.taskId)?.title??'Study task';
     const result=await getStudyApi().createCalendarBlock({
      kind:'study',title,startsAt:place.start,endsAt:place.end,
      timeZone:ownerZone,taskId:place.taskId,
     });
     created.push(result.record);createdHere.push(result.record);
    }
    const plans=await getDayPlanApi().listPlans({from:day,through:day,limit:1});
    let plan=plans.items[0];
    if(!plan)plan=(await getDayPlanApi().createPlan({
     planDate:day,timeZone:ownerZone,
    })).record;
    if(plan.status!=='draft'&&plan.status!=='previewed')
     throw new Error('A committed plan already exists on '+day);
    const chosenIds=new Set(placements.map(x=>x.taskId));
    const unplaced=day===anchor?selection.items.unplaced:[];
    const taskIDs=[...new Set([...chosenIds,...unplaced.map(x=>x.taskId)])];
    const sources=[
     ...taskIDs.map(id=>{
      const task=tasks.find(x=>x.id===id);
      if(!task)throw new Error('Task disappeared from planner snapshot');
      return {resource:'tasks' as const,id,version:task.version};
     }),
     ...createdHere.map(b=>({resource:'calendar_blocks' as const,
      id:b.id,version:b.version})),
     ...blocks.map(b=>({resource:'calendar_blocks' as const,
      id:b.id,version:b.version})),
    ];
    const items=[
     ...placements.map((x,i)=>({
      taskId:x.taskId,blockId:createdHere[i].id,
      disposition:'placed' as const,position:i,reason:null,
     })),
     ...unplaced.map((x,i)=>({
      taskId:x.taskId,blockId:null,disposition:'unplaced' as const,
      reason:x.reason,position:placements.length+i,
     })),
    ];
    const previewed=await getDayPlanApi().previewPlan(plan.id,plan.version,
     items,{sources});
    await getDayPlanApi().commitPlan(plan.id,previewed.record.version);
    anyCommitted=true;
   }
   close();
   notify('Study placements committed. Review them in Calendar.',{tone:'success'});
  }catch(e){
   // Compensation is only valid before a durable plan commits. Do not
   // silently delete linked blocks after a partial multi-day commit.
   if(!anyCommitted){
    for(const record of created.reverse()){
     try{await getStudyApi().deleteCalendarBlock(record.id,record.version);}
     catch{/* Keep the failure visible so owners can inspect Calendar. */}
    }
   }
   setError((e instanceof Error?e.message:'Could not commit plan')+
    (anyCommitted?' Earlier dates were committed; inspect Calendar before retrying.':''));
  }finally{setBusy(false);}
 }
 return <>
  <button type="button" className={button} onClick={show}>Plan study tasks</button>
  {opened&&<dialog ref={dialog} onClose={()=>setOpened(false)}
   aria-label="Plan study tasks" className="max-h-[85dvh] w-[min(95vw,580px)] overflow-auto rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink">
   <div className="flex items-center justify-between gap-3">
    <h2 className="text-title-s font-semibold">Plan study tasks</h2>
    <button type="button" className={button} onClick={close}>Close</button>
   </div>
   <p className="mt-2 text-label text-ink-2">Owner time zone: {ownerZone}. Times below are ISO instants.</p>
   <label className="mt-3 flex flex-col gap-1 text-label">Days to preview
    <select className={field} value={rangeDays} disabled={loading||busy}
     onChange={e=>{setRangeDays(Number(e.target.value));setPreview(null);}}>
     {[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n} {n===1?'day':'days'}</option>)}
    </select>
   </label>
   <button className={button+' mt-2'} disabled={busy||loading}
    onClick={()=>void load()}>Refresh preview</button>
   {loading&&<p role="status">Reading tasks and availability…</p>}
   {error&&<p role="alert" className="mt-2 text-label text-again">{error}</p>}
   {selection.error&&<p role="alert">{selection.error}</p>}
   {preview&&<section aria-label="Planner preview" className="mt-3 space-y-3">
    <p className="text-label">{preview.placements.length} possible placements · {preview.unplaced.length} unplaced</p>
    {preview.placements.map(place=>{
     const key=place.taskId+':'+place.part;
     const chosen=selected.has(key);
     const moved=overrides.get(key)??place;
     const title=tasks.find(t=>t.id===place.taskId)?.title??place.taskId;
     return <div key={key} className="rounded-ctl border border-edge p-3">
      <label className="flex min-h-11 items-center gap-2">
       <input type="checkbox" checked={chosen} onChange={e=>setSelected(old=>{
        const next=new Set(old);if(e.target.checked)next.add(key);
        else next.delete(key);return next;
       })}/>
       <span className="break-words text-label">{title} · {place.minutes} min · {place.date}</span>
      </label>
      {chosen&&<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
       <label className="text-caption">Move start (ISO)
        <input className={field} value={moved.start} aria-label={'Move '+title+' start'}
         onChange={e=>changeMove(key,'start',e.target.value,place)}/></label>
       <label className="text-caption">Move end (ISO)
        <input className={field} value={moved.end} aria-label={'Move '+title+' end'}
         onChange={e=>changeMove(key,'end',e.target.value,place)}/></label>
      </div>}
     </div>;
    })}
    <h3 className="text-label font-semibold">Unplaced work and reasons</h3>
    {selection.items?.unplaced.length?selection.items.unplaced.map((entry,i)=><p key={entry.taskId+':'+i} className="text-label">
     {tasks.find(t=>t.id===entry.taskId)?.title??entry.taskId}: {entry.reason}
    </p>):<p className="text-label">Every task is placed.</p>}
    <button type="button" className={button+' w-full bg-amber text-amber-ink'}
     disabled={busy||!!selection.error||!selection.items?.selected.length}
     onClick={()=>void commit()}>{busy?'Committing…':'Commit selected placements'}</button>
   </section>}
  </dialog>}
 </>;
}
