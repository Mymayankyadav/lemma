import {useEffect,useRef, useState, type FormEvent} from 'react';
import {getApi} from '../../../data';
import {getTaskApi} from '../../../data/tasks';
import type {TaskRecord} from '../../../data/tasks/contract';
import type {ProjectSummary,CheckpointView} from '../../../data/types';
import Dialog from '../../../ui/v6/Dialog';
import {getStudyApi} from '../../../data/study';
import type {
  CalendarBlockKind, CalendarBlockPatch, CalendarBlockRecord, CalendarBlockStatus,
  NewCalendarBlock, StudyApi,
} from '../../../data/study/contract';
import {useToast} from '../../../ui/Toast';
import {dayKey} from '../model';

const field='min-h-11 w-full min-w-0 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink';
const action='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink';

/** Convert an instant to wall-clock input in the owner's IANA zone, not device UTC. */
export function zonedInput(instant:string, zone:string):string {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',
   day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 const field=(key:string)=>parts.find(p=>p.type===key)?.value??'';
 return `${field('year')}-${field('month')}-${field('day')}T${field('hour')}:${field('minute')}`;
}

/** Reject invalid wall times and DST gaps; select the first occurrence at a fall-back overlap. */
export function instantInZone(input:string,zone:string):string|null {
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input))return null;
 const [y,m,d,h,min]=input.split(/[-T:]/).map(Number);
 const naive=Date.UTC(y,m-1,d,h,min);
 if(!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,16)!==input)return null;
 try {
  const offsets=new Set<number>();
  for(const delta of [-36,-12,0,12,36]){
   const probe=naive+delta*3600000;
   const parts=zonedInput(new Date(probe).toISOString(),zone);
   const [py,pm,pd,ph,pmin]=parts.split(/[-T:]/).map(Number);
   offsets.add(Date.UTC(py,pm-1,pd,ph,pmin)-probe);
  }
  const matches=[...offsets].map(offset=>naive-offset)
   .filter(time=>zonedInput(new Date(time).toISOString(),zone)===input)
   .sort((a,b)=>a-b);
  return matches.length?new Date(matches[0]).toISOString():null;
 }catch{return null}
}
export function blockFormInput(values:{
 title:string;kind:CalendarBlockKind;start:string;end:string;zone:string;
}):NewCalendarBlock {
 const title=values.title.trim();
 if(!title||title.length>200)throw new Error('Enter a title of at most 200 characters.');
 if(!['study','busy'].includes(values.kind))throw new Error('Choose a block type.');
 const startsAt=instantInZone(values.start,values.zone);
 const endsAt=instantInZone(values.end,values.zone);
 if(!startsAt||!endsAt||Date.parse(endsAt)<=Date.parse(startsAt))
  throw new Error('Enter a valid start before the end in your time zone.');
 return {title,kind:values.kind,startsAt,endsAt,timeZone:values.zone};
}
function message(error:unknown):string {
 const e=error as {code?:string;message?:string};
 return e?.code==='conflict'||/conflict|version|stale/i.test(e?.message??'')
  ? 'Changed elsewhere. The current block was reloaded; review it before retrying.'
  : (e?.message??'Could not save the calendar block.');
}
function snapshotPatch(block:CalendarBlockRecord):CalendarBlockPatch {
 return {kind:block.kind,title:block.title,startsAt:block.startsAt,endsAt:block.endsAt,
   timeZone:block.timeZone,status:block.status,projectId:block.projectId??null,
   subjectId:block.subjectId??null,checkpointId:block.checkpointId??null,taskId:block.taskId??null};
}
function originalInput(block:CalendarBlockRecord,zone:string) {
 return {title:block.title,kind:block.kind,start:zonedInput(block.startsAt,zone),
   end:zonedInput(block.endsAt,zone),status:block.status};
}

/** Prefer the next 30-minute slot, not the already elapsed 09:00 default. */
export function suggestedBlockStart(date:string,zone:string,now:Date=new Date()):string{
 if(date!==dayKey(now,zone))return date+'T09:00';
 const wall=zonedInput(now.toISOString(),zone);
 const [day,hour,minute]=[wall.slice(0,10),Number(wall.slice(11,13)),Number(wall.slice(14,16))];
 const next=Math.floor((hour*60+minute)/30+1)*30;
 if(next<1440)return day+'T'+String(Math.floor(next/60)).padStart(2,'0')+':'+String(next%60).padStart(2,'0');
 const following=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 return following+'T00:00';
}
function oneHourLater(wall:string):string{
 const [day,hour,minute]=[wall.slice(0,10),Number(wall.slice(11,13)),Number(wall.slice(14,16))];
 const plus=hour*60+minute+60;
 const nextDay=plus>=1440?new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10):day;
 return nextDay+'T'+String(Math.floor(plus%1440/60)).padStart(2,'0')+':'+String(plus%60).padStart(2,'0');
}
export interface BlockSheetProps {
 block:CalendarBlockRecord|null;
 date:string;zone:string;initialStart?:string;onClose:()=>void;onRefresh:()=>void;
}
export default function BlockSheet({block,date,zone,initialStart,onClose,onRefresh}:BlockSheetProps) {
 const busy=useRef(false);
 const requested=initialStart&&Number.isFinite(Date.parse(initialStart))&&/Z$|[+-]\d\d:\d\d$/.test(initialStart)
  ?zonedInput(initialStart,zone):null;
 const proposed=requested??suggestedBlockStart(date,zone);
 const notify=useToast();
 const [current,setCurrent]=useState(block);
 const [title,setTitle]=useState(block?.title??'');
 const [kind,setKind]=useState<CalendarBlockKind>(block?.kind??'study');
 const [start,setStart]=useState(block?zonedInput(block.startsAt,zone):proposed);
 const [end,setEnd]=useState(block?zonedInput(block.endsAt,zone):oneHourLater(proposed));
 const [status,setStatus]=useState<CalendarBlockStatus>(block?.status??'planned');
 const [projects,setProjects]=useState<ProjectSummary[]>([]);
 const [tasks,setTasks]=useState<TaskRecord[]>([]);
 const [checkpoints,setCheckpoints]=useState<CheckpointView[]>([]);
 const [projectId,setProjectId]=useState(block?.projectId??'');
 const [checkpointId,setCheckpointId]=useState(block?.checkpointId??'');
 const [taskId,setTaskId]=useState(block?.taskId??'');
 const [linksError,setLinksError]=useState('');
 useEffect(()=>{
  let active=true;
  void Promise.resolve().then(()=>getApi().listProjects()).then(rows=>{if(active)setProjects(rows.filter(p=>p.status!=='archived'))})
   .catch(()=>{if(active)setLinksError('Learning paths unavailable; existing links are preserved.')});
  void (async()=>{
   const rows:TaskRecord[]=[],seen=new Set<string>();let cursor:string|null=null;
   for(let i=0;i<100;i++){
    const page=await getTaskApi().listTasks({status:['backlog','in_progress'],limit:50,cursor});
    rows.push(...page.items);
    if(!page.nextCursor){if(active)setTasks(rows);return;}
    if(!page.items.length||seen.has(page.nextCursor))throw Error('Task list changed during loading');
    seen.add(page.nextCursor);cursor=page.nextCursor;
   }
   throw Error('Too many tasks to list');
  })().catch(()=>{if(active)setLinksError('Some links are unavailable; existing links are preserved.')});
  return()=>{active=false};
 },[]);
 useEffect(()=>{
  let active=true;
  const project=projects.find(p=>p.id===projectId);
  if(!project){setCheckpoints([]);return;}
  void getApi().getProject(project.slug).then(detail=>{
   if(active)setCheckpoints(detail.checkpoints);
  }).catch(()=>{if(active)setLinksError('Checkpoints unavailable; you can save without changing the checkpoint.')});
  return()=>{active=false};
 },[projectId,projects]);
 const [saving,setSaving]=useState(false);
 const [confirmDelete,setConfirmDelete]=useState(false);
 const [error,setError]=useState('');

 function restore(record:CalendarBlockRecord) {
  setCurrent(record);
  const form=originalInput(record,zone);
  setTitle(form.title);setKind(form.kind);setStart(form.start);setEnd(form.end);setStatus(form.status);
 }
 async function reloadConflict(api:StudyApi,prior:CalendarBlockRecord) {
  // A moved block can lie outside the displayed day, so reload around the
  // original bounds, including the adjacent civil days.
  try {
   const day=86400000;
   const range={start:new Date(Date.parse(prior.startsAt)-day).toISOString(),
     end:new Date(Date.parse(prior.endsAt)+day).toISOString()};
   const records=await api.listCalendarBlocks(range);
   const fresh=records.find(r=>r.id===prior.id);
   if(fresh) restore(fresh);
   else setError('Changed elsewhere. The block may have moved or been deleted. Close and reload.');
  }catch{
   setError('Changed elsewhere. Close and reload the Calendar.');
  }
  onRefresh();
 }
 async function runUndo(action:()=>Promise<unknown>){
  try{await action();onRefresh();}
  catch(e){notify(message(e),{tone:'danger'});onRefresh();}
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy.current)return;
  let input:NewCalendarBlock;
  try{
   input=blockFormInput({title,kind,start,end,zone});
   const project=projects.find(p=>p.id===projectId);
   input={...input,projectId:projectId||null,
    subjectId:project?.subject.id??(projectId===current?.projectId?current?.subjectId:null)??null,
    checkpointId:checkpointId||null,taskId:taskId||null};
  }
  catch(e){setError(e instanceof Error?e.message:'Invalid block details.');return;}
  busy.current=true;setSaving(true);setError('');setConfirmDelete(false);
  const api=getStudyApi(),prior=current;
  try {
   if(!prior) {
    const receipt=await api.createCalendarBlock(input);
    notify('Calendar block created',{tone:'success',action:{label:'Undo',
     onClick:()=>{void runUndo(()=>api.deleteCalendarBlock(receipt.record.id,receipt.record.version));}}});
   }else{
    const patch:CalendarBlockPatch={...input,status};
    const receipt=await api.updateCalendarBlock(prior.id,prior.version,patch);
    notify('Calendar block updated',{tone:'success',action:{label:'Undo',
     onClick:()=>{void runUndo(()=>api.updateCalendarBlock(prior.id,receipt.record.version,snapshotPatch(prior)));}}});
   }
   onRefresh();onClose();
  }catch(e){
   setError(message(e));
   if(prior&&(e as {code?:string})?.code==='conflict')await reloadConflict(api,prior);
  }finally{busy.current=false;setSaving(false);}
 }
 async function remove(){
  if(busy.current||!current||!confirmDelete)return;
  const prior=current,api=getStudyApi();
  busy.current=true;setSaving(true);setError('');
  try{
   await api.deleteCalendarBlock(prior.id,prior.version);
   notify('Calendar block deleted',{tone:'success',action:{label:'Undo',
    onClick:()=>{void runUndo(async()=>{
     const recreated=await api.createCalendarBlock(prior);
     if(prior.status!=='planned')await api.updateCalendarBlock(recreated.record.id,recreated.record.version,{status:prior.status});
    });}}});
   onRefresh();onClose();
  }catch(e){
   setError(message(e));
   if((e as {code?:string})?.code==='conflict')await reloadConflict(api,prior);
  }finally{busy.current=false;setSaving(false);}
 }
const day=start.slice(0,10);
 const eyebrow='CALENDAR · '+(/^\d{4}-\d\d-\d\d$/.test(day)?new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'short',day:'numeric'})
  .format(new Date(day+'T12:00:00Z')).toUpperCase():'');
 const setPart=(part:'day'|'start'|'end',value:string)=>{
  if(part==='day'){
   setStart(value+'T'+start.slice(11,16));
   // An end on the same day moves with the date; an overnight end keeps its offset.
   const sameDay=end.slice(0,10)===start.slice(0,10);
   setEnd((sameDay?value:end.slice(0,10))+'T'+end.slice(11,16));
  }else if(part==='start')setStart(day+'T'+value);
  else{
   // A block that already runs past midnight keeps its next-day end; otherwise a
   // reversed range stays on the same day and is rejected on save.
   const overnight=end.slice(0,10)!==day&&value<=start.slice(11,16);
   setEnd((overnight?end.slice(0,10):day)+'T'+value);
  }
 };
 const otherZone=current?.timeZone&&current.timeZone!==zone&&new Intl.DateTimeFormat('en',{timeZone:current.timeZone,timeZoneName:'short'})
  .formatToParts(new Date()).find(x=>x.type==='timeZoneName')?.value!==new Intl.DateTimeFormat('en',{timeZone:zone,timeZoneName:'short'})
  .formatToParts(new Date()).find(x=>x.type==='timeZoneName')?.value;
 return <Dialog title={current?'Edit time block':'New time block'} eyebrow={eyebrow}
   onClose={onClose} busy={saving} footer={<>
    {current&&!confirmDelete&&<button type="button" className={action+' lemma-destructive mr-auto'} disabled={saving}
      onClick={()=>setConfirmDelete(true)}>Delete block</button>}
    <button type="button" className={action} disabled={saving} onClick={onClose}>Cancel</button>
    <button type="submit" form="n121-block-form" className={action+' bg-amber text-amber-ink'} disabled={saving}>
      {saving?'Saving…':current?'Save changes':'Create block'}
    </button>
   </>}>
   {otherZone&&<p className="text-label text-ink-2">Planned in {current!.timeZone.split('/').pop()?.replace(/_/g,' ')} time.</p>}
   <form id="n121-block-form" noValidate onSubmit={event=>{void save(event);}} className="flex flex-col gap-3">
    <label className="text-label">Title
     <input aria-label="Calendar block title" className={field} placeholder="e.g. Compactness problems" autoFocus maxLength={200} value={title}
       onChange={event=>setTitle(event.target.value)}/>
    </label>
    <div role="radiogroup" aria-label="Calendar block type" className="ui-segmented flex min-h-12 gap-1 rounded-ctl bg-well p-1">
     {(['study','busy'] as const).map(value=><button key={value} type="button" role="radio" aria-checked={kind===value}
      onClick={()=>setKind(value)}
      className={'min-h-11 flex-1 rounded-ctl px-3 text-label font-semibold '+(kind===value?'bg-raised-2 text-ink':'text-ink-3')}>
      {value==='study'?'Study':'Busy'}</button>)}
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
     <label className="text-label">Date
      <input aria-label="Calendar block date" type="date" className={field}
        value={day} onChange={event=>setPart('day',event.target.value)}/>
     </label>
     <label className="text-label">Start
      <input aria-label="Calendar block start" type="time" className={field}
        value={start.slice(11,16)} onChange={event=>setPart('start',event.target.value)}/>
     </label>
     <label className="text-label">End
      <input aria-label="Calendar block end" type="time" className={field}
        value={end.slice(11,16)} onChange={event=>setPart('end',event.target.value)}/>
     </label>
    </div>
    <div role="group" aria-label="Block duration" className="flex flex-wrap items-center gap-2 text-label">
     <span className="mr-1 text-ink-2">Length</span>
     {[25,50,90].map(minutes=><button key={minutes} type="button" className={action}
      disabled={saving} onClick={()=>{
       const first=instantInZone(start,zone);
       if(first){setEnd(zonedInput(new Date(Date.parse(first)+minutes*60000).toISOString(),zone));setError('')}
       else setError('Choose a valid start time first.');
      }}>{minutes} min</button>)}
    </div>
    <label className="text-label">Path (optional)
     <select aria-label="Block path" className={field} value={projectId} disabled={saving}
       onChange={event=>{setProjectId(event.target.value);setCheckpointId('')}}>
      <option value="">No path</option>
      {projectId&&!projects.some(p=>p.id===projectId)&&<option value={projectId}>Previously linked path</option>}
      {projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}
     </select>
    </label>
    {projectId&&<label className="text-label">Checkpoint (optional)
      <select aria-label="Block checkpoint" className={field} value={checkpointId} disabled={saving}
       onChange={event=>setCheckpointId(event.target.value)}>
       <option value="">No checkpoint</option>
       {checkpointId&&!checkpoints.some(c=>c.id===checkpointId)&&<option value={checkpointId}>Previously linked checkpoint</option>}
       {checkpoints.map(cp=><option key={cp.id} value={cp.id}>{cp.title}</option>)}
      </select>
    </label>}
    <label className="text-label">Task (optional)
     <select aria-label="Block task" className={field} value={taskId} disabled={saving}
      onChange={event=>setTaskId(event.target.value)}>
      <option value="">No task</option>
      {taskId&&!tasks.some(t=>t.id===taskId)&&<option value={taskId}>Previously linked task</option>}
      {tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}
     </select>
    </label>
    {linksError&&<p role="status" className="text-caption text-ink-2">{linksError}</p>}
    {current&&<label className="text-label">Status
     <select aria-label="Calendar block status" className={field} value={status}
       onChange={event=>setStatus(event.target.value as CalendarBlockStatus)}>
       <option value="planned">Planned</option><option value="done">Done</option>
       <option value="cancelled">Cancelled</option>
     </select>
    </label>}
    {error&&<p role="alert" className="text-label text-again">{error}</p>}

    {current&&confirmDelete&&<div className="rounded-ctl border border-edge p-3">
      <p className="text-label">Delete this block? You can restore it with Undo.</p>
      <div className="mt-2 flex gap-2">
       <button type="button" className={action} disabled={saving} onClick={()=>setConfirmDelete(false)}>Keep block</button>
       <button type="button" className={action+' lemma-destructive'} disabled={saving} onClick={()=>{void remove();}}>Confirm delete block</button>
      </div>
    </div>}
   </form>
 </Dialog>;
}
