import {localWallParts} from '../../time-log/local-time';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useStudyUi} from '../../../data/StudyUiRelease';
import {getTaskApi} from '../../../data/tasks';
import {useProjects,useSubjects,useSettings} from '../../../data/hooks';
import type {TaskDue,TaskPriority,TaskRecord} from '../../../data/tasks/contract';
import {useToast} from '../../../ui/Toast';
import {CircleX} from 'lucide-react';
import {Button,DatePicker,Field,Picker,Segmented,Sheet} from '../../../ui/v7/components';
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

function DirectDueTime({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false),[text,setText]=useState(value),[error,setError]=useState('');
 function choose(clock:string){onChange(clock);setOpen(false);}
 function apply(){
  const candidate=text.trim().replace(/^(\d{2})(\d{2})$/,'$1:$2');
  if(candidate===value||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate)){choose(candidate);return;}
  setError('Enter a time from 00:00 to 23:59.');
 }
 return <div className="v7-field-group"><span>Due time</span>
  <Button aria-label={'Due time, '+value} aria-haspopup="dialog" onClick={()=>{setText(value);setError('');setOpen(true);}}>{value}</Button>
  <Sheet open={open} title="Due time" onClose={()=>setOpen(false)} footer={<><Button onClick={()=>setOpen(false)}>Cancel</Button><Button variant="primary" onClick={apply}>Use time</Button></>}>
   <Field label="Time (HH:MM)" autoFocus inputMode="numeric" maxLength={12} value={text} hint="Enter 16:10 or 1610." error={error||undefined}
    onChange={e=>{setText(e.currentTarget.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}/>
   <details><summary>Quarter-hour presets</summary><div className="v7-choice-list" role="group" aria-label="Time presets">
    {dueTimes(value).map(clock=><Button key={clock} variant="ghost" onClick={()=>choose(clock)}>{clock}</Button>)}
   </div></details>
  </Sheet>
 </div>;
}

/**
 * Release plan R0 · F02: the task form in the standard Form sheet. Fields stack; the due date opens the app's own date
 * picker and the time its own list (no native select, date or time control); ghost Cancel on the left, indigo Save on
 * the right. Validation and saving reuse the v6 sheet's `taskInput` and API calls unchanged.
 */
export default function TaskSheetV7({onDismiss,task,initialDraft,onSaved,onConflict}:{onDismiss:()=>void;task?:TaskRecord;initialDraft?:CapturedTaskDraft;onSaved?:(record:TaskRecord)=>void;onConflict?:()=>void}){
 const repair=useStudyUi();
 const notify=useToast(),subjects=useSubjects(),projects=useProjects(),settings=useSettings(),busy=useRef(false);
 const draft=task?undefined:initialDraft?.values;
 const zone=(!task&&initialDraft?initialDraft.zone:undefined)??settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone;
 const datesReady=!repair||!!initialDraft?.zone||!!settings.data?.timeZone;
 const initialInstant=task?.due.kind==='instant'?localWallParts(task.due.at,zone):null;
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const [title,setTitle]=useState(task?.title??draft?.title??'');
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
 return <Sheet open onClose={onDismiss} eyebrow="Task" title={task?'Edit task':'New task'}
  footer={<><Button variant="ghost" disabled={saving} onClick={onDismiss}>Cancel</Button><Button variant="primary" loading={saving} onClick={()=>{void save();}}>{task?'Save changes':'Save task'}</Button></>}>
  <form className="v7-form-stack" noValidate onSubmit={event=>{event.preventDefault();void save();}}>
   <Field label="Title" value={title} autoFocus={!task} maxLength={200} error={titleError} onChange={event=>{setTitle(event.target.value);if(titleError)setError('');}}/>
   <Field label="Estimate · minutes" optional inputMode="numeric" value={estimate} placeholder="e.g. 25" onChange={event=>setEstimate(event.target.value.replace(/[^\d]/g,''))}/>
   <div className="v7-field-group"><span>Priority</span><Segmented measureUnwrapped={repair} label="Priority" options={Object.keys(PRIORITY)} value={label(PRIORITY,priority)} onChange={value=>setPriority(PRIORITY[value])}/></div>
   <div className="v7-field-group"><span>Due</span><Segmented measureUnwrapped={repair} label="Due" options={Object.keys(DUE)} value={label(DUE,dueKind)} onChange={value=>setDueKind(DUE[value])}/></div>
   {dueKind!=='none'&&!datesReady&&<p role="status">Loading your time zone…</p>}
   {dueKind!=='none'&&datesReady&&<DatePicker label="Due date" today={repair?localWallParts(new Date().toISOString(),zone).day:undefined} value={dueDate} onChange={value=>{dueEdited.current=true;setDueDate(value);}}/>}
   {dueKind==='instant'&&datesReady&&(repair?<DirectDueTime value={dueTime} onChange={value=>{dueEdited.current=true;setDueTime(value);}}/>:<Picker label="Due time" value={dueTime} options={dueTimes(dueTime)} onChange={setDueTime}/>)}
   <Picker label="Subject" optional value={subjectRows.find(s=>s.id===subjectId)?.name??'Unassigned'} options={subjectNames} onChange={name=>setSubjectId(subjectRows.find(s=>s.name===name)?.id??'')}/>
   <Picker label="Path" optional value={projectNames[projectRows.findIndex(p=>p.id===projectId)+1]??'No path'} options={projectNames} onChange={name=>{const index=projectNames.indexOf(name)-1;setProjectId(index>=0?projectRows[index].id:'');}}/>
   {error&&!titleError&&<p className="v7-error" role="alert"><CircleX aria-hidden="true"/>{error}</p>}
   <button type="submit" hidden/>
  </form>
 </Sheet>;
}
