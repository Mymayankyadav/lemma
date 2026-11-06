import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {getTaskApi} from '../../data/tasks';
import {useProjects, useSubjects} from '../../data/hooks';
import type {TaskDue, TaskPriority, TaskRecord} from '../../data/tasks/contract';
import {useToast} from '../../ui/Toast';

const field='min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink';
const label='flex flex-col gap-1.5 text-label font-medium text-ink-2';
type DueKind = TaskDue['kind'];

function localInstant(value:string):string|null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const date=new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const pad=(n:number)=>String(n).padStart(2,'0');
  const roundtrip=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return roundtrip===value?date.toISOString():null;
}
export function taskInput(values:{
  title:string; estimate:string; priority:TaskPriority; dueKind:DueKind; dueDate:string;
  dueInstant:string; subjectId:string; projectId:string;
}) {
  const title=values.title.trim();
  if (!title) throw new Error('Enter a task title.');
  if (title.length>200) throw new Error('Task title must be 200 characters or fewer.');
  const raw=values.estimate.trim();
  if (raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)>2147483647))
    throw new Error('Estimate must be whole minutes, 0 or more.');
  if (!['low','normal','high'].includes(values.priority)) throw new Error('Choose a priority.');
  let due:TaskDue={kind:'none'};
  if (values.dueKind==='date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dueDate) ||
        !Number.isFinite(Date.parse(values.dueDate))) throw new Error('Choose a valid due date.');
    const [y,m,d]=values.dueDate.split('-').map(Number);
    const date=new Date(Date.UTC(y,m-1,d));
    if (date.getUTCFullYear()!==y || date.getUTCMonth()+1!==m || date.getUTCDate()!==d)
      throw new Error('Choose a valid due date.');
    due={kind:'date',date:values.dueDate};
  } else if (values.dueKind==='instant') {
    const at=localInstant(values.dueInstant);
    if (!at) throw new Error('Choose a valid local date and time.');
    due={kind:'instant',at};
  } else if (values.dueKind!=='none') throw new Error('Choose a due type.');
  return {
    title,estimateMinutes:raw?Number(raw):null,priority:values.priority,due,
    subjectId:values.subjectId||null,projectId:values.projectId||null,
  };
}

/** Shared create/edit sheet; its opener owns focus restoration. */
function localDateTime(iso:string):string {
 const d=new Date(iso),pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export default function TaskSheet({onDismiss,task,onSaved,onConflict}:{
 onDismiss:()=>void;task?:TaskRecord;onSaved?:(record:TaskRecord)=>void;onConflict?:()=>void;
}) {
  const id=useId(),dialog=useRef<HTMLDialogElement>(null);
  const notify=useToast();
  const subjects=useSubjects(),projects=useProjects();
  const busy=useRef(false);
  const [saving,setSaving]=useState(false);
  const [title,setTitle]=useState(task?.title??'');
  const [estimate,setEstimate]=useState(task?.estimateMinutes==null?'':String(task.estimateMinutes));
  const [priority,setPriority]=useState<TaskPriority>(task?.priority??'normal');
  const [dueKind,setDueKind]=useState<DueKind>(task?.due.kind??'none');
  const [dueDate,setDueDate]=useState(task?.due.kind==='date'?task.due.date:'');
  const [dueInstant,setDueInstant]=useState(task?.due.kind==='instant'?localDateTime(task.due.at):'');
  const [subjectId,setSubjectId]=useState(task?.subjectId??'');
  const [projectId,setProjectId]=useState(task?.projectId??'');
  const [error,setError]=useState('');
  useEffect(()=>{
    const node=dialog.current;
    if (!node) return;
    if (typeof node.showModal==='function') node.showModal();
    else node.setAttribute('open','');
    return ()=>{if (node.open && typeof node.close==='function') node.close();};
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if (busy.current) return;
    let input:ReturnType<typeof taskInput>;
    try {input=taskInput({title,estimate,priority,dueKind,dueDate,dueInstant,subjectId,projectId});}
    catch (e) {setError(e instanceof Error?e.message:'Invalid task details.');return;}
    busy.current=true;setSaving(true);setError('');
    try {
      const api=getTaskApi();
      const saved=task?await api.updateTask(task.id,task.version,input):await api.createTask(input);
      if(task){notify('Task updated',{tone:'success'});onSaved?.(saved.record);onDismiss();return;}
      notify('Task saved', {tone:'success',action:{label:'Undo',onClick:()=>{
        void api.deleteTask(saved.record.id,saved.record.version).catch(()=>{
          notify('Task changed elsewhere. Open your backlog to check it.',{tone:'danger'});
        });
      }}});
      onSaved?.(saved.record);
      onDismiss();
    } catch (e) {
      const failure=e as {code?:string;message?:string};
      if(task&&(failure?.code==='conflict'||/conflict|version|stale/i.test(failure?.message??''))){
       onConflict?.();setError('Task changed elsewhere. Reload the task and try again.');
      }else setError(e instanceof Error?e.message:'Could not save task. Try again.');
    } finally {busy.current=false;setSaving(false);}
  }
  return <dialog ref={dialog} aria-labelledby={id} onCancel={e=>{e.preventDefault();if(!saving)onDismiss();}}
    className="w-[calc(100%-2rem)] max-w-[440px] max-h-[90dvh] overflow-y-auto rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-xl backdrop:bg-black/50"
    style={{paddingBottom:'max(1rem,env(safe-area-inset-bottom))'}}>
    <h2 id={id} className="text-title-s font-semibold">{task?'Edit task':'New task'}</h2>
    <p className="mt-1 text-label text-ink-2">{task?'Update this task in your backlog.':'Add a task to your backlog.'}</p>
    <form noValidate className="mt-4 flex flex-col gap-3" onSubmit={e=>{void submit(e);}}>
      <label className={label}>Title
        <input aria-label="Task title" className={field} value={title} autoFocus
          onChange={e=>setTitle(e.target.value)} maxLength={200}/>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Estimate (min)
          <input aria-label="Estimate minutes" inputMode="numeric" className={field}
            value={estimate} onChange={e=>setEstimate(e.target.value)} placeholder="Optional"/>
        </label>
        <label className={label}>Priority
          <select aria-label="Task priority" className={field} value={priority}
            onChange={e=>setPriority(e.target.value as TaskPriority)}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
          </select>
        </label>
      </div>
      <label className={label}>Due
        <select aria-label="Due type" className={field} value={dueKind} onChange={e=>setDueKind(e.target.value as DueKind)}>
          <option value="none">No due date</option><option value="date">Date only</option><option value="instant">Date and time</option>
        </select>
      </label>
      {dueKind==='date'&&<label className={label}>Due date
        <input aria-label="Due date" type="date" className={field} value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
      </label>}
      {dueKind==='instant'&&<label className={label}>Due date and time
        <input aria-label="Due date and time" type="datetime-local" className={field} value={dueInstant}
          onChange={e=>setDueInstant(e.target.value)}/>
      </label>}
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Subject (optional)
          <select aria-label="Task subject" className={field} value={subjectId} onChange={e=>setSubjectId(e.target.value)}>
            <option value="">Unassigned</option>
            {(subjects.data??[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className={label}>Path (optional)
          <select aria-label="Task path" className={field} value={projectId} onChange={e=>setProjectId(e.target.value)}>
            <option value="">No path</option>
            {(projects.data??[]).filter(p=>p.status!=='archived').map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
      </div>
      {error&&<p role="alert" className="text-label text-again">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={saving} className="min-h-11 flex-1 rounded-ctl border border-edge px-3 text-label font-semibold"
          onClick={onDismiss}>Cancel</button>
        <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-ctl bg-amber px-3 text-label font-semibold text-amber-ink">
          {saving?'Saving…':task?'Save changes':'Save task'}
        </button>
      </div>
    </form>
  </dialog>;
}
