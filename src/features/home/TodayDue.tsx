import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {AlertCircle,ChevronRight,Clock} from 'lucide-react';
import {getTaskApi} from '../../data/tasks';
import type {TaskRecord} from '../../data/tasks/contract';
import {loadCalendarDues} from '../calendar/deadlines/load';
import {deadlineDay,type CalendarDues} from '../calendar/deadlines/DueDayItems';
import {dayKey} from '../calendar/model';
import {Sheet} from '../../ui/Sheet';
import {formatDay} from '../../lib/format';

type DueRow={key:string;title:string;day:string;kind:'Task'|'Deadline'|'Practice';to:string};
export type TodayDueGroups={today:DueRow[];overdue:DueRow[]};
/** A single civil-day calculation for tasks, owner deadlines and practice.
 * In-progress work counts; completed/cancelled work never does. */
export function groupTodayDue(today:string,zone:string,
 tasks:readonly Pick<TaskRecord,'id'|'title'|'status'|'due'>[],dues:CalendarDues):TodayDueGroups{
 const rows:DueRow[]=[];
 for(const task of tasks){
  if(task.status!=='backlog'&&task.status!=='in_progress')continue;
  const day=task.due.kind==='none'?null:task.due.kind==='date'?task.due.date:
   dayKey(new Date(task.due.at),zone);
  if(day)rows.push({key:'task:'+task.id,title:task.title,day,kind:'Task',to:'/tasks'});
 }
 for(const row of dues.deadlines){
  if(row.status!=='open')continue;
  rows.push({key:'deadline:'+row.id,title:row.title,day:deadlineDay(row,zone),
   kind:'Deadline',to:'/calendar'});
 }
 for(const row of dues.topics){
  if(row.archivedAt!==null||row.nextDueDate===null)continue;
  rows.push({key:'practice:'+row.id,title:row.title,day:row.nextDueDate,
   kind:'Practice',to:'/practice'});
 }
 const priority={Task:0,Deadline:1,Practice:2};
 rows.sort((a,b)=>a.day.localeCompare(b.day)||priority[a.kind]-priority[b.kind]||a.key.localeCompare(b.key));
 return {today:rows.filter(x=>x.day===today),overdue:rows.filter(x=>x.day<today)};
}
async function readOpenTasks():Promise<TaskRecord[]>{
 const rows:TaskRecord[]=[],seen=new Set<string>();
 let cursor:string|null=null,total:number|null=null;
 for(let i=0;i<100;i++){
  const page=await getTaskApi().listTasks({status:['backlog','in_progress'],limit:50,cursor});
  if(!Number.isSafeInteger(page.total)||page.total<0||page.items.length>50||
   (total!==null&&total!==page.total))throw Error('Task list changed during loading');
  total=page.total;rows.push(...page.items);
  if(page.nextCursor===null){
   if(rows.length!==total)throw Error('Task list incomplete');
   return rows;
  }
  if(!page.nextCursor||seen.has(page.nextCursor)||!page.items.length)
   throw Error('Task cursor did not advance');
  seen.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw Error('Too many tasks to show on Today');
}
export default function TodayDue({date,zone}:{date:string;zone:string}){
 const [items,setItems]=useState<TodayDueGroups>({today:[],overdue:[]});
 const [open,setOpen]=useState(false);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 useEffect(()=>{
  let mounted=true;setLoading(true);setError('');
  void Promise.all([readOpenTasks(),loadCalendarDues()]).then(([tasks,dues])=>{
   if(!mounted)return;
   setItems(groupTodayDue(date,zone,tasks,dues));setLoading(false);
  }).catch(reason=>{if(mounted){setLoading(false);setError(reason instanceof Error?reason.message:'Could not load due items')}});
  return()=>{mounted=false};
 },[date,zone,reload]);
 if(loading)return null; // cold Today never adds an intermediate list or loading wall
 return <>
  {items.today.length>0&&<button type="button" className="notebook-task-row w-full text-left" onClick={()=>setOpen(true)}>
   <Clock size={20} aria-hidden="true"/>
   <span><strong>{items.today.length} due today</strong><small>Tasks, deadlines and practice</small></span>
   <ChevronRight size={19} aria-hidden="true"/>
  </button>}
  {items.overdue.length>0&&<div className="notebook-task-row">
   <AlertCircle size={20} aria-hidden="true"/>
   <span><strong>{items.overdue.length} overdue</strong><small>{items.overdue.slice(0,2).map(row=>row.title).join(', ')}{items.overdue.length>2?'…':''}</small></span>
   <span className="shrink-0 gap-3" style={{flex:"none",flexDirection:"row"}}>
    {items.overdue.some(row=>row.kind==='Task')&&<Link className="inline-flex min-h-11 items-center underline" to="/tasks?show=overdue">Tasks</Link>}
    {items.overdue.some(row=>row.kind!=='Task')&&<Link className="inline-flex min-h-11 items-center underline" to="/calendar">Calendar</Link>}
   </span>
  </div>}
  {error&&<div role="alert" className="text-caption text-ink-2">Due items unavailable.
   <button type="button" className="min-h-11 underline" onClick={()=>setReload(x=>x+1)}>Retry</button></div>}
  {open&&<Sheet open onClose={()=>setOpen(false)} title="Due today" footer={
   <button type="button" className="ui-button ghost" onClick={()=>setOpen(false)}>Close</button>
  }>
   <ul className="flex flex-col gap-2">{items.today.map(row=><li key={row.key} className="rounded-ctl border border-edge p-3">
    <strong className="block break-words">{row.title}</strong>
    <span className="text-caption text-ink-2">{row.kind} · {formatDay(row.day,{zone})}</span>
    <Link to={row.to} className="mt-1 flex min-h-11 items-center font-semibold underline" onClick={()=>setOpen(false)}>
     Open {row.kind.toLowerCase()}
    </Link>
   </li>)}</ul>
  </Sheet>}
 </>;
}
