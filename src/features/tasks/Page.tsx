import {useEffect,useRef,useState} from 'react';
import {Navigate} from 'react-router';
import {isFlagOn} from '../../flags';
import {getTaskApi} from '../../data/tasks';
import type {TaskRecord,TaskStatus,TaskPatch,TaskPage} from '../../data/tasks/contract';
import TaskSheet from './TaskSheet';

const statuses:TaskStatus[]=['backlog','in_progress','completed','cancelled'];
const statusNames:Record<TaskStatus,string>={
 backlog:'Backlog',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled',
};
const button='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink hover:bg-fill-1 disabled:opacity-40';
const byOrder=(a:TaskRecord,b:TaskRecord)=>
 statuses.indexOf(a.status)-statuses.indexOf(b.status)||a.position-b.position||
 a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);

/** Only the loaded page is appended. The API cursor is opaque, never client-calculated. */
export function appendTaskPage(previous:TaskRecord[],page:TaskPage):TaskRecord[] {
 const records=new Map(previous.map(item=>[item.id,item]));
 for(const item of page.items)records.set(item.id,item);
 return [...records.values()].sort(byOrder);
}
/** A one-row, versioned move crosses the adjacent row even when positions are equal. */
export function movedPosition(task:TaskRecord,adjacent:TaskRecord,up:boolean):number {
 if(task.status!==adjacent.status)throw new Error('Move within one status only');
 return up?Math.min(task.position,adjacent.position)-1:
  Math.max(task.position,adjacent.position)+1;
}

function Backlog(){
 const [rows,setRows]=useState<TaskRecord[]>([]);
 const [total,setTotal]=useState(0);
 const [cursor,setCursor]=useState<string|null>(null);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<TaskRecord|null>(null);
 const editTrigger=useRef<HTMLButtonElement|null>(null);
 const [reloadKey,setReloadKey]=useState(0);

 useEffect(()=>{
  let active=true;
  setPhase('loading');
  void getTaskApi().listTasks({limit:20,status:statuses}).then(page=>{
   if(!active)return;
   setRows(appendTaskPage([],page));setTotal(page.total);setCursor(page.nextCursor);
   setPhase('ready');
  }).catch(error=>{
   if(!active)return;
   setMessage(error instanceof Error?error.message:'Could not load the backlog.');
   setPhase('error');
  });
  return ()=>{active=false;};
 },[reloadKey]);
 function refresh(){setReloadKey(n=>n+1);}
 async function more(){
  if(busy||!cursor)return;
  setBusy(true);setMessage('');
  try{
   const page=await getTaskApi().listTasks({limit:20,status:statuses,cursor});
   setRows(old=>appendTaskPage(old,page));
   setCursor(page.nextCursor);setTotal(page.total);
  }catch(error){setMessage(error instanceof Error?error.message:'Could not load more tasks.');}
  finally{setBusy(false);}
 }
 async function mutate(row:TaskRecord,patch:TaskPatch){
  if(busy)return;
  setBusy(true);setMessage('');
  const api=getTaskApi();
  try{
   const receipt=await api.updateTask(row.id,row.version,patch);
   setRows(old=>appendTaskPage(old.filter(item=>item.id!==row.id),{
    items:[receipt.record],total,nextCursor:null,
   }));
  }catch(error){
   const value=error as {code?:string;message?:string};
   if(value?.code==='conflict'||/conflict|version|stale/i.test(value?.message??'')){
    const latest=await api.getTask(row.id).catch(()=>null);
    if(latest)setRows(old=>appendTaskPage(old.filter(item=>item.id!==row.id),{items:[latest],total,nextCursor:null}));
    else refresh();
    setMessage('Task changed elsewhere. The latest version was reloaded.');
   }else setMessage(value?.message??'Could not update task.');
  }finally{setBusy(false);}
 }
 function dismissEdit(){
  setEditing(null);
  queueMicrotask(()=>editTrigger.current?.focus());
 }
 const groups=statuses.map(status=>({status,items:rows.filter(item=>item.status===status)}));
 return <section aria-label="Tasks backlog" className="flex flex-col gap-4 pb-8">
  <div className="flex items-center justify-between gap-3">
   <h1 className="text-title-s font-semibold">Tasks</h1>
   <button type="button" onClick={refresh} className={button}>Refresh</button>
  </div>
  {phase==='loading'&&<p role="status">Loading tasks…</p>}
  {phase==='error'&&<p role="alert">{message} <button type="button" onClick={refresh} className={button}>Retry</button></p>}
  {phase==='ready'&&<>
   <p className="text-label text-ink-2">{rows.length} shown of {total} tasks</p>
   {message&&<p role="alert" className="text-label text-again">{message}</p>}
   {total===0&&<p>No tasks yet. Use Add → Task to create one.</p>}
   {groups.map(group=><section key={group.status} aria-label={statusNames[group.status]} className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
    <h2 className="mb-3 text-body font-semibold">{statusNames[group.status]} <span className="text-ink-2">({group.items.length} shown)</span></h2>
    {group.items.length===0&&<p className="text-label text-ink-2">None on this page.</p>}
    <ul className="flex flex-col gap-3">{group.items.map((task,index)=><li key={task.id} className="rounded-ctl border border-edge bg-fill-1 p-3">
     <h3 className="break-words text-body font-semibold">{task.title}</h3>
     <p className="mt-1 text-caption text-ink-2">{task.priority} priority{task.estimateMinutes==null?'':' · '+task.estimateMinutes+' min'} · {task.due.kind==='none'?'No due date':task.due.kind==='date'?'Due '+task.due.date:'Due '+new Date(task.due.at).toLocaleString()}</p>
     <div className="mt-2 flex flex-wrap gap-2">
      {task.status!=='completed'&&<button type="button" disabled={busy} className={button} aria-label={'Complete '+task.title}
       onClick={()=>{void mutate(task,{status:'completed'});}}>Complete</button>}
      {task.status==='completed'&&<button type="button" disabled={busy} className={button} aria-label={'Reopen '+task.title}
       onClick={()=>{void mutate(task,{status:'backlog'});}}>Reopen</button>}
      <button type="button" disabled={busy} className={button} aria-label={'Edit '+task.title}
       onClick={event=>{editTrigger.current=event.currentTarget;setEditing(task);}}>Edit</button>
      <button type="button" disabled={busy||index===0} className={button} aria-label={'Move '+task.title+' up'}
       onClick={()=>{void mutate(task,{position:movedPosition(task,group.items[index-1],true)});}}>Up</button>
      <button type="button" disabled={busy||index===group.items.length-1} className={button} aria-label={'Move '+task.title+' down'}
       onClick={()=>{void mutate(task,{position:movedPosition(task,group.items[index+1],false)});}}>Down</button>
     </div>
    </li>)}</ul>
   </section>)}
   {cursor&&<button type="button" className={button} disabled={busy} onClick={()=>{void more();}}>
    {busy?'Loading…':'Show more'}
   </button>}
  </>}
  {editing&&<TaskSheet key={editing.id+':'+editing.version} task={editing} onDismiss={dismissEdit}
   onSaved={record=>{setRows(old=>appendTaskPage(old.filter(t=>t.id!==record.id),{items:[record],total,nextCursor:null}));}}
   onConflict={()=>{setMessage('Task changed elsewhere. The latest version was reloaded.');refresh();dismissEdit();}}/>}
 </section>;
}
export default function TasksPage(){
 if(!isFlagOn('v6Shell'))return <Navigate to="/" replace/>;
 return <Backlog/>;
}
