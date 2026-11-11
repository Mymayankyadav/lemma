import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {v7Screen} from '../../app/v7Kit';
import {Navigate,useSearchParams} from 'react-router';
import {Check,Ellipsis} from 'lucide-react';
import {formatDateTime,formatDay} from '../../lib/format';
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
/** Refuse malformed/infinite pagination without hiding already-loaded owner tasks. */
function checkTaskPage(page:TaskPage,limit:number):void {
 if(!Array.isArray(page.items)||page.items.length>limit||
  !Number.isSafeInteger(page.total)||page.total<page.items.length||
  (page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!page.nextCursor)))
  throw new Error('Invalid task page; refresh the backlog');
}
/** N121 F10: owner-zone overdue state: a civil due date before today, or a due instant already past. */
export function taskOverdue(task:Pick<TaskRecord,'status'|'due'>,now:Date=new Date(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'):boolean{
 if(task.status==='completed'||task.status==='cancelled'||task.due.kind==='none')return false;
 if(task.due.kind==='instant')return Date.parse(task.due.at)<now.getTime();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(now);
 return task.due.date<today;
}
function dueText(task:TaskRecord):string{
 if(task.due.kind==='none')return 'No due date';
 return 'Due '+(task.due.kind==='date'?formatDay(task.due.date):formatDateTime(task.due.at,{clock24h:true}));
}
/** A one-row, versioned move crosses the adjacent row even when positions are equal. */
export function movedPosition(task:TaskRecord,adjacent:TaskRecord,up:boolean):number {
 if(task.status!==adjacent.status)throw new Error('Move within one status only');
 return up?Math.min(task.position,adjacent.position)-1:
  Math.max(task.position,adjacent.position)+1;
}

function Backlog(){
 const [params,setParams]=useSearchParams();
 const overdueOnly=params.get('show')==='overdue';
 const [rows,setRows]=useState<TaskRecord[]>([]);
 const [total,setTotal]=useState(0);
 const [cursor,setCursor]=useState<string|null>(null);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const busyRef=useRef(false);busyRef.current=busy;
 const [editing,setEditing]=useState<TaskRecord|null>(null);
 const editTrigger=useRef<HTMLButtonElement|null>(null);
 const [reloadKey,setReloadKey]=useState(0);
 const viewEpoch=useRef(0);
 const seenCursors=useRef<Set<string>>(new Set());

 useEffect(()=>{
  let active=true;
  const epoch=++viewEpoch.current;
  seenCursors.current.clear();
  setPhase('loading');setMessage('');
  void getTaskApi().listTasks({limit:20,status:statuses}).then(page=>{
   if(!active||viewEpoch.current!==epoch)return;
   checkTaskPage(page,20);
   setRows(appendTaskPage([],page));setTotal(page.total);setCursor(page.nextCursor);
   if(page.nextCursor)seenCursors.current.add(page.nextCursor);
   setPhase('ready');
  }).catch(error=>{
   if(!active||viewEpoch.current!==epoch)return;
   setMessage(error instanceof Error?error.message:'Could not load the backlog.');
   setPhase('error');
  });
  return ()=>{active=false;};
 },[reloadKey]);
 function refresh(){++viewEpoch.current;setReloadKey(n=>n+1);}
 // N121 X10: refetch when the window regains focus; there is no manual Refresh button.
 useEffect(()=>{const again=()=>{if(!busyRef.current)refresh();};window.addEventListener('focus',again);return()=>window.removeEventListener('focus',again);},[]);
 async function more(){
  if(busy||!cursor)return;
  const epoch=viewEpoch.current,requested=cursor;
  setBusy(true);setMessage('');
  try{
   const page=await getTaskApi().listTasks({limit:20,status:statuses,cursor:requested});
   if(epoch!==viewEpoch.current)return;
   checkTaskPage(page,20);
   if((page.nextCursor&&seenCursors.current.has(page.nextCursor))||
      (page.nextCursor&&page.items.length===0))
    throw new Error('Task cursor did not advance; refresh the backlog');
   if(page.nextCursor)seenCursors.current.add(page.nextCursor);
   setRows(old=>appendTaskPage(old,page));
   setCursor(page.nextCursor);setTotal(page.total);
  }catch(error){
   if(epoch===viewEpoch.current)
    setMessage(error instanceof Error?error.message:'Could not load more tasks.');
  }finally{setBusy(false);}
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
 // N121 F10: overdue tasks lead their group; ?show=overdue keeps only them.
 const groups=statuses.map(status=>({status,items:rows.filter(item=>item.status===status&&(!overdueOnly||taskOverdue(item)))
  .sort((x,y)=>Number(taskOverdue(y))-Number(taskOverdue(x)))}))
  .filter(group=>!overdueOnly||group.items.length>0);
 const overdueCount=rows.filter(item=>taskOverdue(item)).length;
 const toggleOverdue=()=>{const next=new URLSearchParams(params);if(overdueOnly)next.delete('show');else next.set('show','overdue');setParams(next,{replace:true});};
 return <section aria-label="Tasks backlog" className="flex flex-col gap-4 pb-8">
  <h1 className="sr-only">Tasks</h1>
  {phase==='loading'&&<p role="status">Loading tasks…</p>}
  {phase==='error'&&<p role="alert">{message} <button type="button" onClick={refresh} className={button}>Retry</button></p>}
  {phase==='ready'&&<>
   {(overdueCount>0||overdueOnly)&&<button type="button" aria-pressed={overdueOnly} onClick={toggleOverdue}
    className={'self-start rounded-full border px-3 py-2 text-label '+(overdueOnly?'border-[var(--again)] bg-danger-tint text-again':'border-[var(--control-edge)] text-ink')}>
    {overdueOnly?'Showing overdue · Show all':overdueCount+' overdue'}</button>}
   {message&&<p role="alert" className="text-label text-again">{message}</p>}
   {total===0&&<p>No tasks yet. Use Add → Task to create one.</p>}
   {groups.map(group=><section key={group.status} aria-label={statusNames[group.status]} className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
    <h2 className="mb-3 text-body font-semibold">{statusNames[group.status]} · {group.items.length}</h2>
    {group.items.length===0&&<p className="text-label text-ink-2">No tasks here.</p>}
    <ul className="flex flex-col divide-y divide-[var(--hair)]">{group.items.map((task,index)=>{
     const done=task.status==='completed',closed=done||task.status==='cancelled',late=taskOverdue(task);
     return <li key={task.id} className="flex min-w-0 items-start gap-3 py-2">
      <button type="button" role="checkbox" aria-checked={done} disabled={busy||task.status==='cancelled'}
       aria-label={(done?'Reopen ':'Complete ')+task.title}
       onClick={()=>{void mutate(task,{status:done?'backlog':'completed'});}}
       className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-[8px] disabled:opacity-40">
       <span aria-hidden="true" className={'flex size-6 items-center justify-center rounded-[6px] border-2 '+(done?'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]':'border-[var(--control-edge)]')}>
        {done&&<Check size={16}/>}</span></button>
      <div className="min-w-0 flex-1">
       <h3 className={'break-words text-body font-medium '+(closed?'text-ink-2 line-through':'text-ink')}>{task.title}</h3>
       <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-ink-2">
        {late?<span className="rounded-full bg-danger-tint px-2 py-0.5 font-medium text-again">Overdue · {task.due.kind==='date'?formatDay(task.due.date):task.due.kind==='instant'?formatDateTime(task.due.at,{clock24h:true}):''}</span>:<span>{dueText(task)}</span>}
        <span>{({low:'Low',normal:'Normal',high:'High'} as Record<string,string>)[task.priority]??'Normal'} priority</span>
        {task.estimateMinutes!=null&&<span>{task.estimateMinutes} min</span>}
       </p>
      </div>
      <details className="relative shrink-0">
       <summary aria-label={'More actions for '+task.title} className="flex size-11 cursor-pointer list-none items-center justify-center rounded-[8px] text-ink-2 [&::-webkit-details-marker]:hidden"><Ellipsis size={18} aria-hidden="true"/></summary>
       <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col gap-1 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-1 shadow-lg">
        <button type="button" disabled={busy} className={button+' text-left'} aria-label={'Edit '+task.title}
         onClick={event=>{(event.currentTarget.closest('details') as HTMLDetailsElement|null)?.removeAttribute('open');editTrigger.current=event.currentTarget;setEditing(task);}}>Edit</button>
        {!closed&&<button type="button" disabled={busy||index===0} className={button+' text-left'} aria-label={'Move '+task.title+' up'}
         onClick={()=>{void mutate(task,{position:movedPosition(task,group.items[index-1],true)});}}>Move up</button>}
        {!closed&&<button type="button" disabled={busy||index===group.items.length-1} className={button+' text-left'} aria-label={'Move '+task.title+' down'}
         onClick={()=>{void mutate(task,{position:movedPosition(task,group.items[index+1],false)});}}>Move down</button>}
        {!closed&&<button type="button" disabled={busy} className={button+' lemma-destructive text-left'} aria-label={'Cancel '+task.title}
         onClick={()=>{void mutate(task,{status:'cancelled'});}}>Cancel task</button>}
        {task.status==='cancelled'&&<button type="button" disabled={busy} className={button+' text-left'} aria-label={'Reopen '+task.title}
         onClick={()=>{void mutate(task,{status:'backlog'});}}>Reopen</button>}
       </div>
      </details>
     </li>;})}</ul>
   </section>)}
   {cursor&&<div className="flex flex-wrap items-center gap-3 text-label text-ink-2">
    <span>{rows.length} of {total} tasks shown</span>
    <button type="button" className={button} disabled={busy} onClick={()=>{void more();}}>{busy?'Loading…':'Load more'}</button>
   </div>}
  </>}
  {editing&&<TaskSheet key={editing.id+':'+editing.version} task={editing} onDismiss={dismissEdit}
   onSaved={record=>{setRows(old=>appendTaskPage(old.filter(t=>t.id!==record.id),{items:[record],total,nextCursor:null}));}}
   onConflict={()=>{setMessage('Task changed elsewhere. The latest version was reloaded.');refresh();dismissEdit();}}/>}
 </section>;
}
const TasksV7=lazy(()=>import('./v7/TasksV7'));
export default function TasksPage(){
 if(v7Screen()==='tasks')return <Suspense fallback={<div role="status" aria-label="Tasks loading" className="min-h-dvh"/>}><TasksV7/></Suspense>;
 if(!isFlagOn('v6Shell'))return <Navigate to="/" replace/>;
 return <Backlog/>;
}
