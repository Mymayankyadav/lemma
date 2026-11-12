import {useMemo,useRef,useState} from 'react';
import {getTaskApi} from '../../../data/tasks';
import {useProjects,useSubjects} from '../../../data/hooks';
import type {TaskDue,TaskPriority,TaskRecord} from '../../../data/tasks/contract';
import {useToast} from '../../../ui/Toast';
import {CircleX} from 'lucide-react';
import {Button,DatePicker,Field,Picker,Segmented,Sheet} from '../../../ui/v7/components';
import {taskInput} from '../TaskSheet';

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
export default function TaskSheetV7({onDismiss,task,onSaved,onConflict}:{onDismiss:()=>void;task?:TaskRecord;onSaved?:(record:TaskRecord)=>void;onConflict?:()=>void}){
 const notify=useToast(),subjects=useSubjects(),projects=useProjects(),busy=useRef(false);
 const initialInstant=task?.due.kind==='instant'?new Date(task.due.at):null;
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const [title,setTitle]=useState(task?.title??'');
 const [estimate,setEstimate]=useState(task?.estimateMinutes==null?'':String(task.estimateMinutes));
 const [priority,setPriority]=useState<TaskPriority>(task?.priority??'normal');
 const [dueKind,setDueKind]=useState<TaskDue['kind']>(task?.due.kind??'none');
 const [dueDate,setDueDate]=useState(task?.due.kind==='date'?task.due.date:initialInstant?initialInstant.getFullYear()+'-'+pad(initialInstant.getMonth()+1)+'-'+pad(initialInstant.getDate()):today());
 const [dueTime,setDueTime]=useState(initialInstant?pad(initialInstant.getHours())+':'+pad(initialInstant.getMinutes()):'17:00');
 const [subjectId,setSubjectId]=useState(task?.subjectId??'');
 const [projectId,setProjectId]=useState(task?.projectId??'');
 const subjectRows=subjects.data??[],projectRows=useMemo(()=>(projects.data??[]).filter(p=>p.status!=='archived'),[projects.data]);
 const subjectNames=['Unassigned',...subjectRows.map(s=>s.name)];
 const projectNames=['No path',...projectRows.map(p=>projectRows.filter(q=>q.title===p.title).length>1?p.title+' · '+p.subject.name:p.title)];
 async function save(){
  if(busy.current)return;
  let input:ReturnType<typeof taskInput>;
  try{input=taskInput({title,estimate,priority,dueKind,dueDate,dueInstant:dueDate+'T'+dueTime,subjectId,projectId});}
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
   <div className="v7-field-group"><span>Priority</span><Segmented label="Priority" options={Object.keys(PRIORITY)} value={label(PRIORITY,priority)} onChange={value=>setPriority(PRIORITY[value])}/></div>
   <div className="v7-field-group"><span>Due</span><Segmented label="Due" options={Object.keys(DUE)} value={label(DUE,dueKind)} onChange={value=>setDueKind(DUE[value])}/></div>
   {dueKind!=='none'&&<DatePicker label="Due date" value={dueDate} onChange={setDueDate}/>}
   {dueKind==='instant'&&<Picker label="Due time" value={dueTime} options={dueTimes(dueTime)} onChange={setDueTime}/>}
   <Picker label="Subject" optional value={subjectRows.find(s=>s.id===subjectId)?.name??'Unassigned'} options={subjectNames} onChange={name=>setSubjectId(subjectRows.find(s=>s.name===name)?.id??'')}/>
   <Picker label="Path" optional value={projectNames[projectRows.findIndex(p=>p.id===projectId)+1]??'No path'} options={projectNames} onChange={name=>{const index=projectNames.indexOf(name)-1;setProjectId(index>=0?projectRows[index].id:'');}}/>
   {error&&!titleError&&<p className="v7-error" role="alert"><CircleX aria-hidden="true"/>{error}</p>}
   <button type="submit" hidden/>
  </form>
 </Sheet>;
}
