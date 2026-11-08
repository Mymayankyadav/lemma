// N68 v6 owner planner: read-only preview first, no unattended block writes.
// A day-plan commit always rechecks task/block versions in one server command.
import {useEffect,useMemo,useRef,useState} from 'react';
import {getDayPlanApi} from '../../data/day-plans';
import {getTaskApi,type TaskRecord} from '../../data/tasks';
import {getStudyApi,type CalendarBlockRecord,type StudyEntryRecord} from '../../data/study';
import {useToast} from '../../ui/Toast';
import {planTaskPlacements,type PlannerResult} from './model';
import {selectPlannerPlacements} from './selection';
import {commitPlannerSelection,PlannerCommitError} from './commit';

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
 const seen=new Set<string>();
 for(let i=0;i<10;i++){
  const page=await getTaskApi().listTasks({
   status:['backlog','in_progress'],limit:50,cursor});
  if(page.items.length>50||!Number.isSafeInteger(page.total)||page.total<0)
   throw new Error('Malformed owner task page');
  rows.push(...page.items);
  if(!page.nextCursor)return rows;
  if(seen.has(page.nextCursor))
   throw new Error('Repeated owner task cursor; refresh the planner');
  seen.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw new Error('Task list exceeds 500; narrow your task selection');
}
export default function PlannerLaunch({date,zone}:{date?:string;zone?:string}){
 const notify=useToast(),dialog=useRef<HTMLDialogElement>(null);
 const loadEpoch=useRef(0);
 const commitEpoch=useRef(0);
 const pendingOperation=useRef<string|null>(null);
 const [opened,setOpened]=useState(false);
 useEffect(()=>{
  if(!opened||!dialog.current)return;
  const node=dialog.current;
  if(typeof node.showModal==='function'&&!node.open)node.showModal();
 },[opened]);
 const ownerZone=zone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const anchor=date??ownerDay(ownerZone);
 // Calendar navigation can change the owner's selected date without
 // unmounting this launcher. An old preview may never be committed using a
 // different calendar date or time zone.
 const scopeKey=anchor+'|'+ownerZone;
 const lastScope=useRef(scopeKey);
 useEffect(()=>{
  if(lastScope.current===scopeKey)return;
  lastScope.current=scopeKey;
  ++loadEpoch.current;
  ++commitEpoch.current;
  if(typeof dialog.current?.close==='function')dialog.current.close();
  setOpened(false);setLoading(false);setBusy(false);setPreview(null);
 },[scopeKey]);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [preview,setPreview]=useState<PlannerResult|null>(null);
 const [tasks,setTasks]=useState<TaskRecord[]>([]);
 const [blocks,setBlocks]=useState<CalendarBlockRecord[]>([]);
 const [entries,setEntries]=useState<StudyEntryRecord[]>([]);
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
  pendingOperation.current=null;
  const epoch=++loadEpoch.current;
  setLoading(true);setError(null);setPreview(null);
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
   if(epoch!==loadEpoch.current)return;
   setTasks(taskRows);setBlocks(blockRows);setEntries(entries);setPreview(result);
   setSelected(new Set(result.placements.map(p=>p.taskId+':'+p.part)));
   setOverrides(new Map());
  }catch(e){
   if(epoch===loadEpoch.current){
    setError(e instanceof Error?e.message:'Could not preview a plan');
    setPreview(null);
   }
  }finally{if(epoch===loadEpoch.current)setLoading(false);}
 }
 function show(){
  setOpened(true);
  void load();
 }
 function close(){
  ++loadEpoch.current;
  if(typeof dialog.current?.close==='function')dialog.current.close();
  setOpened(false);setLoading(false);setPreview(null);
 }
 function changeMove(key:string,part:'start'|'end',value:string,
  original:Move){
  setOverrides(previous=>{
   const next=new Map(previous),updated={...(next.get(key)??original),[part]:value};
   // The selected day belongs to the owner's IANA zone, not the UTC
   // calendar portion of an absolute ISO timestamp.
   const at=Date.parse(updated.start);
   if(Number.isFinite(at)){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:ownerZone,
     year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
    const get=(name:string)=>parts.find(p=>p.type===name)?.value??'';
    updated.date=get('year')+'-'+get('month')+'-'+get('day');
   }
   next.set(key,updated);return next;
  });
 }
 async function commit(){
  if(busy||!selection.items||!preview)return;
  // A Calendar date/time-zone change can outlive this owner write. Never
  // let an old response close or overwrite the next date's planner.
  const commitScope=scopeKey;
  const ownCommit=++commitEpoch.current;
  setBusy(true);setError(null);
  try{
   const plans=getDayPlanApi();
   // Reuse the operation ID after an uncertain failure so a retry is a replay.
   const operationId=pendingOperation.current??crypto.randomUUID();
   pendingOperation.current=operationId;
   const result=await commitPlannerSelection({
    from:anchor,through:end,zone:ownerZone,selection:selection.items,
    tasks,blocks,entries,
   },{
    tasks:getTaskApi(),study:getStudyApi(),plans,
   },operationId);
   pendingOperation.current=null;
   if(lastScope.current!==commitScope||commitEpoch.current!==ownCommit)return;
   close();
   const actionNo=result.actionNo;
   notify('Study placements committed for '+result.committedDays.length+
    (result.committedDays.length===1?' day.':' days.'),{tone:'success',
    ...(actionNo!==null?{action:{label:'Undo',onClick:()=>{
     void plans.undoPlacements(actionNo).then(
      ()=>notify('Planner commit undone',{tone:'success'}),
      (e:unknown)=>notify(e instanceof Error?e.message:'Could not undo the planner commit',
       {tone:'danger'}));
    }}}:{})});
  }catch(e){
   if(!(e instanceof PlannerCommitError&&e.uncertain))pendingOperation.current=null;
   if(lastScope.current===commitScope&&commitEpoch.current===ownCommit)
    setError(e instanceof Error?e.message:'Could not commit plan');
  }finally{if(commitEpoch.current===ownCommit)setBusy(false);}
 }
 return <>
  <button type="button" className={button} onClick={show}>Plan study tasks</button>
  {opened&&<dialog ref={dialog} onCancel={event=>{if(busy)event.preventDefault();else close()}} onClose={()=>{
    ++loadEpoch.current;setOpened(false);setLoading(false);setPreview(null);
   }}
   aria-label="Plan study tasks" className="max-h-[85dvh] w-[min(95vw,580px)] overflow-auto rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink">
   <div className="flex items-center justify-between gap-3">
    <h2 className="text-title-s font-semibold">Plan study tasks</h2>
    <button type="button" className={button} disabled={busy} onClick={close}>Close</button>
   </div>
   <p className="mt-2 text-label text-ink-2">Owner time zone: {ownerZone}. Times below are ISO instants.</p>
   <label className="mt-3 flex flex-col gap-1 text-label">Days to preview
    <select className={field} value={rangeDays} disabled={loading||busy}
     onChange={e=>{
      ++loadEpoch.current;setRangeDays(Number(e.target.value));
      setPreview(null);setLoading(false);
     }}>
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
       <input type="checkbox" checked={chosen} disabled={busy} onChange={e=>setSelected(old=>{
        const next=new Set(old);if(e.target.checked)next.add(key);
        else next.delete(key);return next;
       })}/>
       <span className="break-words text-label">{title} · {place.minutes} min · {place.date}</span>
      </label>
      {chosen&&<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
       <label className="text-caption">Move start (ISO)
        <input className={field} value={moved.start} disabled={busy} aria-label={'Move '+title+' start'}
         onChange={e=>changeMove(key,'start',e.target.value,place)}/></label>
       <label className="text-caption">Move end (ISO)
        <input className={field} value={moved.end} disabled={busy} aria-label={'Move '+title+' end'}
         onChange={e=>changeMove(key,'end',e.target.value,place)}/></label>
      </div>}
     </div>;
    })}
    <h3 className="text-label font-semibold">Unplaced work and reasons</h3>
    {selection.items?.unplaced.length?selection.items.unplaced.map((entry,i)=><p key={entry.taskId+':'+i} className="min-w-0 break-words text-label">
     {tasks.find(t=>t.id===entry.taskId)?.title??entry.taskId}: {entry.reason}
    </p>):<p className="text-label">Every task is placed.</p>}
    <button type="button" className={button+' w-full bg-amber text-amber-ink'}
     disabled={busy||!!selection.error||!selection.items?.selected.length}
     onClick={()=>void commit()}>{busy?'Committing…':'Commit selected placements'}</button>
   </section>}
  </dialog>}
 </>;
}
