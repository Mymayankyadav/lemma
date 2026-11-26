import {Disclosure} from '../../../ui/v7/Disclosure';
import {RulerTime} from '../../../ui/v7/RulerTime';
import {RulerSlider} from '../../../ui/v7/RulerSlider';
import {formatDuration} from '../../../lib/format';
import {localWallParts} from '../../time-log/local-time';
import {useEffect,useMemo,useRef,useState,type ComponentType} from 'react';
import {useStudyUi} from '../../../data/StudyUiRelease';
import {getTaskApi} from '../../../data/tasks';
import {useProjects,useSubjects,useSettings} from '../../../data/hooks';
import type {TaskDue,TaskPriority,TaskRecord} from '../../../data/tasks/contract';
import {useToast} from '../../../ui/Toast';
import {CircleX} from 'lucide-react';
import {Button,DatePicker,Field,Picker,Segmented,Sheet} from '../../../ui/v7/components';
import {requestLayerClose} from '../../../ui/v7/layers';
import type {SheetProps} from '../../../ui/v7/Sheet';
import {taskInput,type CapturedTaskDraft} from '../taskDraft';

const PRIORITY:Record<string,TaskPriority>={Low:'low',Normal:'normal',High:'high'};
const DUE:Record<string,TaskDue['kind']>={None:'none',Date:'date','Date & time':'instant'};
const label=<T extends string>(map:Record<string,T>,value:T)=>Object.keys(map).find(key=>map[key]===value)!;
const pad=(n:number)=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
/** 15-minute times for the due-time picker (plus the task's own time when it is off the grid). */
export function dueTimes(current?:string):string[]{
 const all=Array.from({length:96},(_,i)=>pad(Math.floor(i/4))+':'+pad((i%4)*15));
 return current&&!all.includes(current)?[...all,current].sort():all;
}

/**
 * Release plan R0 · F02: the task form in the standard Form sheet. Fields stack; the due date opens the app's own date
 * picker and the time its own list (no native select, date or time control); ghost Cancel on the left, indigo Save on
 * the right. Validation and saving reuse the v6 sheet's `taskInput` and API calls unchanged.
 */
export default function TaskSheetV7({onDismiss,task,initialDraft,initialTitle,onSaved,onConflict,frame:Frame=Sheet}:{frame?:ComponentType<SheetProps>;onDismiss:()=>void;task?:TaskRecord;initialDraft?:CapturedTaskDraft;initialTitle?:string;onSaved?:(record:TaskRecord)=>void;onConflict?:()=>void}){
 const repair=useStudyUi();
 const notify=useToast(),subjects=useSubjects(),projects=useProjects(),settings=useSettings(),busy=useRef(false);
 const draft=task?undefined:initialDraft?.values;
 const zone=(!task&&initialDraft?initialDraft.zone:undefined)??settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone;
 const datesReady=!repair||!!initialDraft?.zone||!!settings.data?.timeZone;
 const initialInstant=task?.due.kind==='instant'?localWallParts(task.due.at,zone):null;
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const [title,setTitle]=useState(task?.title??draft?.title??initialTitle??'');
 const [estimate,setEstimate]=useState(task?.estimateMinutes==null?draft?.estimate??'':String(task.estimateMinutes));
 const [priority,setPriority]=useState<TaskPriority>(task?.priority??draft?.priority??'normal');
 const [dueKind,setDueKind]=useState<TaskDue['kind']>(task?.due.kind??draft?.dueKind??'none');
 const dueEdited=useRef(false);
 const [dueDate,setDueDate]=useState(task?.due.kind==='date'?task.due.date:initialInstant?initialInstant.day:draft?.dueDate??(repair?localWallParts(new Date().toISOString(),zone).day:today()));
 const [dueTime,setDueTime]=useState(initialInstant?initialInstant.clock:draft?.dueInstant.slice(11)??'17:00');
 useEffect(()=>{
  if(!repair||dueEdited.current||!settings.data?.timeZone||draft)return;
  if(task?.due.kind==='instant'){
   const wall=localWallParts(task.due.at,zone);setDueDate(wall.day);setDueTime(wall.clock);
  }else if(!task||task.due.kind==='none')setDueDate(localWallParts(new Date().toISOString(),zone).day);
 },[repair,settings.data?.timeZone,zone,task,draft]);
 const [subjectId,setSubjectId]=useState(task?.subjectId??draft?.subjectId??'');
 const [projectId,setProjectId]=useState(task?.projectId??draft?.projectId??'');
 const subjectRows=subjects.data??[],projectRows=useMemo(()=>(projects.data??[]).filter(p=>p.status!=='archived'),[projects.data]);
 const subjectNames=['Unassigned',...subjectRows.map(s=>s.name)];
 const projectNames=['No path',...projectRows.map(p=>projectRows.filter(q=>q.title===p.title).length>1?p.title+' · '+p.subject.name:p.title)];
 async function save(){
  if(busy.current)return;
  if(dueKind!=='none'&&!datesReady){
   setError('Wait for your time zone to load, then save again.');return;
  }
  let input:ReturnType<typeof taskInput>;
  try{input=taskInput({title,estimate,priority,dueKind,dueDate,dueInstant:dueDate+'T'+dueTime,subjectId,projectId},zone,task?.due.kind==='instant'?task.due.at:undefined);}
  catch(e){setError(e instanceof Error?e.message:'Check the task details.');return;}
  busy.current=true;setSaving(true);setError('');
  try{
   const api=getTaskApi();
   const saved=task?await api.updateTask(task.id,task.version,input):await api.createTask(input);
   if(task)notify('Task updated',{tone:'success'});
   else notify('Task saved',{tone:'success',action:{label:'Undo',onClick:()=>{void api.deleteTask(saved.record.id,saved.record.version).catch(()=>notify('Task changed elsewhere. Open your tasks to check it.',{tone:'danger'}));}}});
   onSaved?.(saved.record);onDismiss();
  }catch(e){
   const failure=e as {code?:string;message?:string};
   if(task&&(failure?.code==='conflict'||/conflict|version|stale/i.test(failure?.message??''))){onConflict?.();setError('This task changed on another device. Close and open it again to see the latest version.');}
   else setError('We couldn’t save this task. Your changes are still here; try again.');
  }finally{busy.current=false;setSaving(false);}
 }
 const titleError=/title/i.test(error)?error:undefined;
 const dirty=title!==(task?.title??draft?.title??'')||estimate!==(task?.estimateMinutes==null?draft?.estimate??'':String(task.estimateMinutes))||
  priority!==(task?.priority??draft?.priority??'normal')||dueKind!==(task?.due.kind??draft?.dueKind??'none')||dueEdited.current||
  subjectId!==(task?.subjectId??draft?.subjectId??'')||projectId!==(task?.projectId??draft?.projectId??'');
 return <Frame open onClose={onDismiss} dirty={dirty} eyebrow="Task" title={task?'Edit task':'New task'}
  footer={<><Button variant="ghost" disabled={saving} onClick={event=>{
   const dialog=event.currentTarget.closest('dialog');
   if(Frame===Sheet&&dialog)requestLayerClose(dialog,'close');
   else onDismiss();
  }}>Cancel</Button><Button variant="primary" loading={saving} onClick={()=>{void save();}}>{task?'Save changes':'Save task'}</Button></>}>
  <form className="v7-form-stack" noValidate onSubmit={event=>{event.preventDefault();void save();}}>
   <Field label="Title" value={title} autoFocus={!task} maxLength={200} error={titleError} onChange={event=>{setTitle(event.target.value);if(titleError)setError('');}}/>
   <div className="v7-task-sentence" aria-label="Task details">
    <Picker label="Due" value={label(DUE,dueKind)} options={Object.keys(DUE)} onChange={value=>setDueKind(DUE[value])}/>
    {dueKind!=='none'&&datesReady&&<DatePicker compact label="Due date" today={localWallParts(new Date().toISOString(),zone).day}
      value={dueDate} onChange={value=>{dueEdited.current=true;setDueDate(value);}}/>}
    <Picker label="Path" optional value={projectNames[projectRows.findIndex(p=>p.id===projectId)+1]??'No path'}
      options={projectNames} onChange={name=>{
       const path=projectRows[projectNames.indexOf(name)-1];setProjectId(path?.id??'');if(path)setSubjectId(path.subject.id);
      }}/>
   </div>
   {dueKind!=='none'&&!datesReady&&<p role="status">Loading your time zone…</p>}
   {dueKind==='instant'&&datesReady&&<RulerTime label="Due time" value={dueTime} onChange={value=>{dueEdited.current=true;setDueTime(value);}}/>}
   <Disclosure label={estimate?'More · '+formatDuration(Number(estimate)):'More options'} defaultOpen={!!task}>
    {Number(estimate||0)<=180&&<RulerSlider label="Estimate" min={0} max={180} step={5} value={Number(estimate)||0}
     format={value=>value?formatDuration(value):'No estimate'} tickFormat={String} onChange={value=>setEstimate(value?String(value):'')}/>}
    <Disclosure label="Exact estimate" defaultOpen={Number(estimate)>180||Number(estimate)%5!==0}>
     <Field label="Minutes" optional inputMode="numeric" value={estimate} placeholder="e.g. 25"
      onChange={event=>setEstimate(event.target.value.replace(/[^\d]/g,''))}/>
    </Disclosure>
    <Picker label="Priority" value={label(PRIORITY,priority)} options={Object.keys(PRIORITY)} onChange={value=>setPriority(PRIORITY[value])}/>
    <Picker label="Subject" optional value={subjectRows.find(s=>s.id===subjectId)?.name??'Unassigned'}
     options={subjectNames} onChange={name=>setSubjectId(subjectRows.find(s=>s.name===name)?.id??'')}/>
   </Disclosure>
   {error&&!titleError&&<p className="v7-error" role="alert"><CircleX aria-hidden="true"/>{error}</p>}
   <button type="submit" hidden/>
  </form>
 </Frame>;
}
