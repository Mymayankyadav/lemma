import {useEffect,useId,useRef, useState, type ComponentType, type FormEvent, type ReactElement, type ReactNode} from 'react';
import {getApi} from '../../../data';
import {getTaskApi} from '../../../data/tasks';
import type {TaskRecord} from '../../../data/tasks/contract';
import type {ProjectSummary,CheckpointView} from '../../../data/types';
import Dialog from '../../../ui/v6/Dialog';
import {Button,Chip,DatePicker,Field,Picker,Segmented,Sheet} from '../../../ui/v7/components';
import type {SheetProps} from '../../../ui/v7/Sheet';
import {requestLayerClose} from '../../../ui/v7/layers';
import {TimeField} from '../../../ui/v7/TimeField';
import {formatDuration} from '../../../lib/format';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {isFlagOn} from '../../../flags';
import {getStudyApi} from '../../../data/study';
import type {
  CalendarBlockKind, CalendarBlockPatch, CalendarBlockRecord, CalendarBlockStatus,
  NewCalendarBlock, StudyApi,
} from '../../../data/study/contract';
import {useToast} from '../../../ui/Toast';
import {dayKey} from '../model';
import type {CalendarBlockDraft} from './blockDraft';

/** N220: the block lengths offered as one-tap presets. */
const BLOCK_LENGTHS:readonly number[]=[25,50,90,120];
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
 original?:Pick<CalendarBlockDraft,'startsAt'|'endsAt'>;
}):NewCalendarBlock {
 const title=values.title.trim();
 if(!title||title.length>200)throw new Error('Enter a title of at most 200 characters.');
 if(!['study','busy'].includes(values.kind))throw new Error('Choose a block type.');
 const keep=(wall:string,original?:string)=>original&&zonedInput(original,values.zone)===wall
  ?original:instantInZone(wall,values.zone);
 const startsAt=keep(values.start,values.original?.startsAt);
 const endsAt=keep(values.end,values.original?.endsAt);
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
/** The end for a new block: the requested whole minutes after the start, else an hour. */
function endAfter(start:string,zone:string,minutes?:number):string{
 const first=minutes&&minutes>=5&&minutes<=600?instantInZone(start,zone):null;
 return first?zonedInput(new Date(Date.parse(first)+minutes!*60000).toISOString(),zone):oneHourLater(start);
}
export interface BlockSheetProps {
 /** v7 shell: the same form, drawn with the kit's sheet and controls. */
 v7?:boolean;
 frame?:ComponentType<SheetProps>;
 focusTitle?:boolean;
 returnTarget?:()=>HTMLElement|null;
 onPlaceInCalendar?:(draft:CalendarBlockDraft)=>void;
 onShowInCalendar?:(block:CalendarBlockRecord,draft?:CalendarBlockDraft)=>void;
 /** Hand-over from quick-add: keep the typed title, the linked task and the chosen length. */
 initialTitle?:string;initialTaskId?:string;initialProjectId?:string;initialMinutes?:number;draft?:CalendarBlockDraft;
 block:CalendarBlockRecord|null;
 date:string;zone:string;initialStart?:string;onClose:()=>void;onRefresh:()=>void;
}
type Frame=(props:{title:string;eyebrow:string;onClose:()=>void;busy:boolean;footer:ReactNode;children:ReactNode})=>ReactElement;
const V6Frame:Frame=props=><Dialog {...props}/>;
export default function BlockSheet({block,date,zone:pageZone,initialStart,onClose,onRefresh,v7=false,initialTitle,initialTaskId,initialMinutes,draft,initialProjectId,frame:V7Frame=Sheet,focusTitle=false,returnTarget,onPlaceInCalendar,onShowInCalendar}:BlockSheetProps) {
 const zone=draft?.zone??pageZone;
 const Frame=V6Frame;
 const look={field,action,primary:action+' bg-amber text-amber-ink',danger:action+' lemma-destructive',label:'text-label',error:'text-label text-again',note:'text-label text-ink-2',
  seg:'ui-segmented flex min-h-12 gap-1 rounded-ctl bg-well p-1',segOn:'min-h-11 flex-1 rounded-ctl px-3 text-label font-semibold bg-raised-2 text-ink',segOff:'min-h-11 flex-1 rounded-ctl px-3 text-label font-semibold text-ink-3',confirm:'rounded-ctl border border-edge p-3'};
 const busy=useRef(false),formId=useId();
 const requested=initialStart&&Number.isFinite(Date.parse(initialStart))&&/Z$|[+-]\d\d:\d\d$/.test(initialStart)
  ?zonedInput(initialStart,zone):null;
 const proposed=draft?zonedInput(draft.startsAt,zone):requested??suggestedBlockStart(date,zone);
 const notify=useToast();
 const [current,setCurrent]=useState(block);
 const [title,setTitle]=useState(draft?.title??block?.title??initialTitle??'');
 const titleEdited=useRef(false);
 const [kind,setKind]=useState<CalendarBlockKind>(draft?.kind??block?.kind??'study');
 const [start,setStart]=useState(draft?proposed:block?zonedInput(block.startsAt,zone):proposed);
 const [end,setEnd]=useState(draft?zonedInput(draft.endsAt,zone):block?zonedInput(block.endsAt,zone):endAfter(proposed,zone,initialMinutes));
 const [status,setStatus]=useState<CalendarBlockStatus>(draft?.status??block?.status??'planned');
 const [projects,setProjects]=useState<ProjectSummary[]>([]);
 const [tasks,setTasks]=useState<TaskRecord[]>([]);
 const [checkpoints,setCheckpoints]=useState<CheckpointView[]>([]);
 const [projectId,setProjectId]=useState((draft?draft.projectId:block?.projectId??initialProjectId)??'');
 const [checkpointId,setCheckpointId]=useState((draft?draft.checkpointId:block?.checkpointId)??'');
 const [taskId,setTaskId]=useState((draft?draft.taskId:block?.taskId??initialTaskId)??'');
 const [linksError,setLinksError]=useState('');
 useEffect(()=>{
  if(!v7||block||draft||!initialTaskId||initialTitle)return;
  let active=true;
  void getTaskApi().getTask(initialTaskId).then(task=>{
   if(active&&task&&!titleEdited.current)setTitle(task.title);
  }).catch(()=>{});
  return()=>{active=false;};
 },[v7,block,draft,initialTaskId,initialTitle]);
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
 const newBaseline=useRef({title:initialTitle??'',kind:draft?.kind??'study',start,end,
  projectId:draft?.projectId??initialProjectId??'',checkpointId:draft?.checkpointId??'',taskId:draft?.taskId??initialTaskId??'',status:'planned'});
 const baseline=current?{...originalInput(current,zone),projectId:current.projectId??'',checkpointId:current.checkpointId??'',taskId:current.taskId??''}:newBaseline.current;
 const dirty=(current?title!==baseline.title:titleEdited.current&&title!==baseline.title||!!draft?.title.trim())||kind!==baseline.kind||start!==baseline.start||end!==baseline.end||
  status!==baseline.status||projectId!==baseline.projectId||checkpointId!==baseline.checkpointId||taskId!==baseline.taskId;
 const original=draft??current??undefined;
 const linkedSubject=projects.find(p=>p.id===projectId)?.subject.id??(projectId===current?.projectId?current?.subjectId:null)??
  (projectId===(draft?.projectId??'')?draft?.subjectId:null)??null;

 function calendarDraft():CalendarBlockDraft{
  const times=blockFormInput({title:title.trim()||'Study block',kind,start,end,zone,original});
  return {title,kind,zone,startsAt:times.startsAt,endsAt:times.endsAt,status,
   projectId:kind==='study'?projectId||null:null,subjectId:kind==='study'?linkedSubject:null,
   checkpointId:kind==='study'?checkpointId||null:null,taskId:taskId||null};
 }
 function showInCalendar(){
  try{
   if(current){onShowInCalendar?.(current,dirty?calendarDraft():undefined);}
   else onPlaceInCalendar?.(calendarDraft());
  }catch(error){setError(error instanceof Error?error.message:'Check the block details.');}
 }

 function restore(record:CalendarBlockRecord) {
  setCurrent(record);
  const form=originalInput(record,zone);
  setTitle(form.title);setKind(form.kind);setStart(form.start);setEnd(form.end);setStatus(form.status);
  setProjectId(record.projectId??'');setCheckpointId(record.checkpointId??'');setTaskId(record.taskId??'');
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
   input=blockFormInput({title,kind,start,end,zone,original});
   input={...input,projectId:projectId||null,subjectId:linkedSubject,checkpointId:checkpointId||null,taskId:taskId||null};
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
   const deletion=await api.deleteCalendarBlock(prior.id,prior.version);
   notify('Calendar block deleted',{tone:'success',action:{label:'Undo',
    onClick:()=>{void runUndo(async()=>{
     await api.undoCalendarBlockDeletion(prior.id,deletion.actionNo);
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
 if(v7){
  // B7/BS1–BS4/KC14/KC19: the kit's Field, Segmented, Date field, Time range field (presets 25 / 50 / 90 / Custom) and Select
  // (a sheet of radio rows on phones) — no native control. Eyebrow "TIME BLOCK"; N220: the sheet opens without focusing the
  // title (no keyboard until it is tapped), and the footer has the secondary on the left and the primary on the right.
  const pathLabel=(id:string)=>id?projects.find(p=>p.id===id)?.title??'Previously linked path':'No path';
  const cpLabel=(id:string)=>id?checkpoints.find(c=>c.id===id)?.title??'Previously linked checkpoint':'No checkpoint';
  const taskLabel=(id:string)=>id?tasks.find(t=>t.id===id)?.title??'Previously linked task':'No task';
  const pick=<T extends {id:string}>(rows:readonly T[],label:(id:string)=>string,value:string,none:string)=>{
   const ids=['',...(value&&!rows.some(r=>r.id===value)?[value]:[]),...rows.map(r=>r.id)];
   return {options:ids.map(id=>label(id)),idOf:(text:string)=>ids.find(id=>label(id)===text)??'',none};
  };
  const paths=pick(projects,pathLabel,projectId,'No path'),cps=pick(checkpoints,cpLabel,checkpointId,'No checkpoint'),tks=pick(tasks,taskLabel,taskId,'No task');
  const statuses:Record<string,CalendarBlockStatus>={Planned:'planned',Done:'done',Cancelled:'cancelled'};
  const blockLength=Math.round((Date.parse(instantInZone(end,zone)??'')-Date.parse(instantInZone(start,zone)??''))/60000)||0;
  // N125 (kit rule R1 · F17/F39): the footer holds Cancel and the primary action on one row; Delete is the body's last item.
  return <V7Frame open onClose={onClose} dirty={dirty} focusTitle={focusTitle} returnTarget={returnTarget} title={current?'Edit time block':'New time block'} eyebrow="Time block" footer={<>
    {onPlaceInCalendar?<Button variant="secondary" disabled={saving} onClick={showInCalendar}>Place in Calendar</Button>:
     <Button variant="ghost" disabled={saving} onClick={event=>{
      const dialog=event.currentTarget.closest('dialog');
      if(dialog)requestLayerClose(dialog,'close');
      else onClose();
     }}>Cancel</Button>}
    <button type="submit" form={formId} className="v7-button v7-primary" disabled={saving}><span>{saving?'Saving…':current?'Save changes':'Create block'}</span></button>
   </>}>
   {otherZone&&<p className="v7-meta">Planned in {current!.timeZone.split('/').pop()?.replace(/_/g,' ')} time.</p>}
   <form id={formId} noValidate onSubmit={event=>{void save(event);}} className="v7-bs">
    {/* N220 (Owner report): no autofocus, so the keyboard opens only when the title is tapped; Start and End are typed
        times and the length is a choice of presets, instead of three full-day rulers. */}
    <Field label="Title" aria-label="Calendar block title" placeholder="e.g. Compactness problems" maxLength={200} value={title} onChange={event=>{titleEdited.current=true;setTitle(event.target.value);}}/>
    <Segmented label="Calendar block type" options={['Study','Busy']} value={kind==='study'?'Study':'Busy'} onChange={value=>setKind(value==='Study'?'study':'busy')}/>
    {/^\d{4}-\d\d-\d\d$/.test(day)&&<DatePicker label="Date" value={day} onChange={value=>setPart('day',value)}/>}
    <div className="v7-time-range-row">
     <TimeField label="Start" value={start.slice(11,16)} disabled={saving} onChange={value=>{
      const kept=blockLength;setPart('start',value);
      const first=instantInZone(day+'T'+value,zone);
      if(first&&kept>0)setEnd(zonedInput(new Date(Date.parse(first)+kept*60000).toISOString(),zone));
      setError('');
     }}/>
     <TimeField label="End" value={end.slice(11,16)} disabled={saving} onChange={value=>{setPart('end',value);setError('');}}/>
    </div>
    <div className="v7-length-chips" role="group" aria-label="Length">
     {BLOCK_LENGTHS.map(minutes=><Chip key={minutes} selected={blockLength===minutes} onClick={()=>{
      const first=instantInZone(start,zone);if(first){setEnd(zonedInput(new Date(Date.parse(first)+minutes*60000).toISOString(),zone));setError('');}
     }}>{formatDuration(minutes)}</Chip>)}
     {blockLength>0&&!BLOCK_LENGTHS.includes(blockLength)&&<span className="v7-meta" aria-live="polite">{formatDuration(blockLength)}</span>}
    </div>
    <Picker optional label="Path" value={pathLabel(projectId)} options={paths.options} disabled={saving} onChange={text=>{setProjectId(paths.idOf(text));setCheckpointId('');}}/>
    <Disclosure label="More">
    {projectId&&<Picker optional label="Checkpoint" value={cpLabel(checkpointId)} options={cps.options} disabled={saving} onChange={text=>setCheckpointId(cps.idOf(text))}/>}
    <Picker optional label="Task" value={taskLabel(taskId)} options={tks.options} disabled={saving} onChange={text=>setTaskId(tks.idOf(text))}/>
    {linksError&&<p role="status" className="v7-meta">{linksError}</p>}
    {current&&<Picker label="Status" value={Object.keys(statuses).find(key=>statuses[key]===status)??'Planned'} options={Object.keys(statuses)} onChange={text=>setStatus(statuses[text]??'planned')}/>}
    </Disclosure>
    {error&&<p role="alert" className="v7-alert">{error}</p>}
    {current&&onShowInCalendar&&<Button variant="secondary" disabled={saving} onClick={showInCalendar}>Show in Calendar</Button>}
    {current&&!confirmDelete&&<div className="v7-sheet-danger-zone"><Button small variant="ghost" destructive disabled={saving} onClick={()=>setConfirmDelete(true)}>Delete</Button></div>}
    {current&&confirmDelete&&<div className="v7-bs-confirm">
     <p>Delete this block? You can restore it with Undo.</p>
     <div className="v7-od-actions"><Button small disabled={saving} onClick={()=>setConfirmDelete(false)}>Keep block</Button>
      <Button small destructive disabled={saving} onClick={()=>{void remove();}}>Confirm delete block</Button></div>
    </div>}
   </form>
  </V7Frame>;
 }
 return <Frame title={current?'Edit time block':'New time block'} eyebrow={eyebrow}
   onClose={onClose} busy={saving} footer={<>
    {current&&!confirmDelete&&<button type="button" className={look.danger+' mr-auto'} disabled={saving}
      onClick={()=>setConfirmDelete(true)}>Delete block</button>}
    <button type="button" className={look.action} disabled={saving} onClick={onClose}>Cancel</button>
    <button type="submit" form={formId} className={look.primary} disabled={saving}>
      {saving?'Saving…':current?'Save changes':'Create block'}
    </button>
   </>}>
   {otherZone&&<p className={look.note}>Planned in {current!.timeZone.split('/').pop()?.replace(/_/g,' ')} time.</p>}
   <form id={formId} noValidate onSubmit={event=>{void save(event);}} className="flex flex-col gap-3">
    <label className={look.label}>Title
     <input aria-label="Calendar block title" className={look.field} placeholder="e.g. Compactness problems" autoFocus maxLength={200} value={title}
       onChange={event=>setTitle(event.target.value)}/>
    </label>
    <div role="radiogroup" aria-label="Calendar block type" className={look.seg}>
     {(['study','busy'] as const).map(value=><button key={value} type="button" role="radio" aria-checked={kind===value}
      onClick={()=>setKind(value)}
      className={kind===value?look.segOn:look.segOff}>
      {value==='study'?'Study':'Busy'}</button>)}
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
     <label className={look.label}>Date
      <input aria-label="Calendar block date" type="date" className={look.field}
        value={day} onChange={event=>setPart('day',event.target.value)}/>
     </label>
     <label className={look.label}>Start
      <input aria-label="Calendar block start" type="time" className={look.field}
        value={start.slice(11,16)} onChange={event=>setPart('start',event.target.value)}/>
     </label>
     <label className={look.label}>End
      <input aria-label="Calendar block end" type="time" className={look.field}
        value={end.slice(11,16)} onChange={event=>setPart('end',event.target.value)}/>
     </label>
    </div>
    <div role="group" aria-label="Block duration" className="flex flex-wrap items-center gap-2 text-label">
     <span className="mr-1 text-ink-2">Length</span>
     {[25,50,90].map(minutes=><button key={minutes} type="button" className={look.action}
      disabled={saving} onClick={()=>{
       const first=instantInZone(start,zone);
       if(first){setEnd(zonedInput(new Date(Date.parse(first)+minutes*60000).toISOString(),zone));setError('')}
       else setError('Choose a valid start time first.');
      }}>{minutes} min</button>)}
    </div>
    <label className={look.label}>Path (optional)
     <select aria-label="Block path" className={look.field} value={projectId} disabled={saving}
       onChange={event=>{setProjectId(event.target.value);setCheckpointId('')}}>
      <option value="">No path</option>
      {projectId&&!projects.some(p=>p.id===projectId)&&<option value={projectId}>Previously linked path</option>}
      {projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}
     </select>
    </label>
    {projectId&&<label className={look.label}>Checkpoint (optional)
      <select aria-label="Block checkpoint" className={look.field} value={checkpointId} disabled={saving}
       onChange={event=>setCheckpointId(event.target.value)}>
       <option value="">No checkpoint</option>
       {checkpointId&&!checkpoints.some(c=>c.id===checkpointId)&&<option value={checkpointId}>Previously linked checkpoint</option>}
       {checkpoints.map(cp=><option key={cp.id} value={cp.id}>{cp.title}</option>)}
      </select>
    </label>}
    <label className={look.label}>Task (optional)
     <select aria-label="Block task" className={look.field} value={taskId} disabled={saving}
      onChange={event=>setTaskId(event.target.value)}>
      <option value="">No task</option>
      {taskId&&!tasks.some(t=>t.id===taskId)&&<option value={taskId}>Previously linked task</option>}
      {tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}
     </select>
    </label>
    {linksError&&<p role="status" className={look.note}>{linksError}</p>}
    {current&&<label className={look.label}>Status
     <select aria-label="Calendar block status" className={look.field} value={status}
       onChange={event=>setStatus(event.target.value as CalendarBlockStatus)}>
       <option value="planned">Planned</option><option value="done">Done</option>
       <option value="cancelled">Cancelled</option>
     </select>
    </label>}
    {error&&<p role="alert" className={look.error}>{error}</p>}

    {current&&confirmDelete&&<div className={look.confirm}>
      <p className="text-label">Delete this block? You can restore it with Undo.</p>
      <div className="mt-2 flex gap-2">
       <button type="button" className={look.action} disabled={saving} onClick={()=>setConfirmDelete(false)}>Keep block</button>
       <button type="button" className={look.danger} disabled={saving} onClick={()=>{void remove();}}>Confirm delete block</button>
      </div>
    </div>}
   </form>
 </Frame>;
}
