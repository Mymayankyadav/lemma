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
import {unplacedReasonText} from '../../lib/labels';
import {formatDay,formatDuration,formatTimeRange} from '../../lib/format';
import {localClockInstant,localWallParts} from '../time-log/local-time';
import Dialog from '../../ui/v6/Dialog';

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
export async function readTasks():Promise<TaskRecord[]>{
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
export default function PlannerLaunch({date,zone,autoOpen=false,hideTrigger=false,onClosed}:{
 date?:string;zone?:string;
 /** v7: open the planner as soon as it mounts (Adjust on the suggestions banner, `?plan=1`). */
 autoOpen?:boolean;hideTrigger?:boolean;onClosed?:()=>void;
}){
 const notify=useToast();
 const loadEpoch=useRef(0);
 const commitEpoch=useRef(0);
 const pendingOperation=useRef<string|null>(null);
 const [opened,setOpened]=useState(false);
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
 async function load(days=rangeDays){
  pendingOperation.current=null;
  const epoch=++loadEpoch.current;
  setLoading(true);setError(null);setPreview(null);
  try{
   const taskRows=await readTasks();
   const start=shiftDay(anchor,-2)+'T00:00:00Z';
   const through=shiftDay(shiftDay(anchor,days-1),2)+'T00:00:00Z';
   const study=getStudyApi();
   const [blockRows,entries]=await Promise.all([
    study.listCalendarBlocks({start,end:through}),
    study.listStudyEntries({start,end:through}),
   ]);
   const result=planTaskPlacements({
    from:anchor,through:shiftDay(anchor,days-1),timeZone:ownerZone,now:new Date().toISOString(),
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
  setOpened(false);setLoading(false);setPreview(null);
  onClosed?.();
 }
 const autoOpened=useRef(false);
 useEffect(()=>{
  if(!autoOpen||autoOpened.current)return;
  autoOpened.current=true;show();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[autoOpen]);
 /** N121 B8: Date, Start and End in the owner zone; moving the start keeps the allotted length. */
 function changeMove(key:string,part:'date'|'start'|'end',value:string,original:Move){
  setOverrides(previous=>{
   const next=new Map(previous),updated={...(next.get(key)??original)};
   const startWall=updated.start?localWallParts(updated.start,ownerZone):{day:updated.date,clock:''};
   const endWall=updated.end?localWallParts(updated.end,ownerZone):{day:updated.date,clock:''};
   const duration=Date.parse(updated.end)-Date.parse(updated.start);
   const keepLength=(instant:string|null)=>{
    updated.start=instant??'';
    if(instant&&Number.isFinite(duration)&&duration>0)updated.end=new Date(Date.parse(instant)+duration).toISOString();
   };
   if(part==='date')keepLength(localClockInstant(value,startWall.clock,ownerZone));
   else if(part==='start')keepLength(localClockInstant(startWall.day,value,ownerZone));
   else updated.end=localClockInstant(endWall.day===startWall.day?startWall.day:endWall.day,value,ownerZone)??'';
   if(updated.start)updated.date=localWallParts(updated.start,ownerZone).day;
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
   const added=selection.items.selected.length;
   notify((added===1?'Added 1 block':'Added '+added+' blocks')+' to your calendar',{tone:'success',
    ...(actionNo!==null?{action:{label:'Undo',onClick:()=>{
     void plans.undoPlacements(actionNo).then(
      ()=>notify('Removed the planned blocks',{tone:'success'}),
      (e:unknown)=>notify(e instanceof Error?e.message:'Could not undo the planner commit',
       {tone:'danger'}));
    }}}:{})});
  }catch(e){
   if(!(e instanceof PlannerCommitError&&e.uncertain))pendingOperation.current=null;
   if(lastScope.current===commitScope&&commitEpoch.current===ownCommit)
    setError(e instanceof Error?e.message:'Could not commit plan');
  }finally{if(commitEpoch.current===ownCommit)setBusy(false);}
 }
 const count=selection.items?.selected.length??0;
 return <>
  {!hideTrigger&&<button type="button" className={button} onClick={show}>Plan study tasks</button>}
  {opened&&<Dialog title="Plan study tasks" eyebrow="PLAN YOUR DAY" busy={busy} onClose={close} footer={
   <button type="button" className={button+' w-full bg-amber text-amber-ink'}
    disabled={busy||loading||!!selection.error||!count}
    onClick={()=>void commit()}>{busy?'Saving…':count===1?'Add 1 block to calendar':'Add '+count+' blocks to calendar'}</button>}>
   <label className="flex flex-col gap-1 text-label">Days to plan
    <select className={field} value={rangeDays} disabled={loading||busy}
     onChange={e=>{
      const days=Number(e.target.value);
      ++loadEpoch.current;setRangeDays(days);
      setPreview(null);setLoading(false);void load(days);
     }}>
     {[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n===1?'Today only':n+' days'}</option>)}
    </select>
   </label>
   {loading&&<p role="status" className="mt-3 text-label text-ink-2">Finding free time for your tasks…</p>}
   {error&&<p role="alert" className="mt-2 text-label text-again">{error}</p>}
   {selection.error&&<p role="alert" className="mt-2 text-label text-again">{selection.error}</p>}
   {preview&&<section aria-label="Planner preview" className="mt-3 space-y-3">
    {preview.placements.length===0&&<p className="text-label text-ink-2">No free slots left in these days. Try more days, or free up time in Calendar.</p>}
    {preview.placements.map(place=>{
     const key=place.taskId+':'+place.part;
     const chosen=selected.has(key);
     const moved=overrides.get(key)??place;
     const title=tasks.find(t=>t.id===place.taskId)?.title??'Study task';
     const startWall=moved.start?localWallParts(moved.start,ownerZone):{day:moved.date,clock:''};
     const endWall=moved.end?localWallParts(moved.end,ownerZone):{day:moved.date,clock:''};
     return <div key={key} className="rounded-[12px] border border-[var(--hair)] p-3">
      <label className="flex min-h-11 items-center gap-3">
       <input type="checkbox" className="size-5 shrink-0" checked={chosen} disabled={busy} onChange={e=>setSelected(old=>{
        const next=new Set(old);if(e.target.checked)next.add(key);
        else next.delete(key);return next;
       })}/>
       <span className="min-w-0 break-words text-label"><strong className="font-medium text-ink">{title}</strong>
        <span className="block text-ink-2">{formatDay(moved.date,{zone:ownerZone})} {moved.start&&moved.end?formatTimeRange(moved.start,moved.end,{zone:ownerZone,clock24h:true}):'· choose valid times'} · {formatDuration(place.minutes)}</span></span>
      </label>
      {chosen&&<details className="lemma-disclosure mt-1">
       <summary className="min-h-11 cursor-pointer text-label text-ink-2">Change time</summary>
       <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-caption">Date
         <input type="date" className={field} value={startWall.day} disabled={busy} aria-label={'Move '+title+' date'}
          onChange={e=>changeMove(key,'date',e.target.value,place)}/></label>
        <label className="text-caption">Start
         <input type="time" className={field} value={startWall.clock} disabled={busy} aria-label={'Move '+title+' start'}
          onChange={e=>changeMove(key,'start',e.target.value,place)}/></label>
        <label className="text-caption">End
         <input type="time" className={field} value={endWall.clock} disabled={busy} aria-label={'Move '+title+' end'}
          onChange={e=>changeMove(key,'end',e.target.value,place)}/></label>
       </div>
      </details>}
     </div>;
    })}
    {selection.items?.unplaced.length?<section aria-label="Not placed" className="space-y-1">
     <h3 className="text-label font-semibold">Not placed</h3>
     {selection.items.unplaced.map((entry,i)=><p key={entry.taskId+':'+i} className="min-w-0 break-words text-label text-ink-2">
      <strong className="font-medium text-ink">{tasks.find(t=>t.id===entry.taskId)?.title??'Study task'}</strong> · {unplacedReasonText(entry.reason)}
     </p>)}
    </section>:null}
   </section>}
  </Dialog>}
 </>;
}
