import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {getDeadlineApi} from '../../../data/deadlines';
import type {DeadlineRecord} from '../../../data/deadlines/contract';
import {Button,DatePicker,Sheet} from '../../../ui/v7/components';
import {getTaskApi} from '../../../data/tasks';
import type {TaskRecord} from '../../../data/tasks/contract';
import {readTasks} from '../../planner/readTasks';
import {isOverdue} from '../../tasks/v7/tasksModel';
import {useToast} from '../../../ui/Toast';
import {formatShortDate} from '../../../lib/format';
import {shiftDay} from '../model';
import {deadlineDay,type CalendarDues} from '../deadlines/DueDayItems';
import {overdueItems} from '../deadlines/OverdueBanner';

/** PLAN §6.6 overdue sheet: Done, Reschedule, Hide until tomorrow. Same writes as the v6 banner. */
export default function OverdueSheetV7({open,dues,zone,onClose,onRefresh}:{open:boolean;dues:CalendarDues;zone:string;onClose:()=>void;onRefresh:()=>void}){
 const notify=useToast(),{today,deadlines,topics}=overdueItems(dues,zone);
 const [moving,setMoving]=useState<string|null>(null),[date,setDate]=useState(shiftDay(today,1)),[busy,setBusy]=useState(false);
 // B3: the sheet lists tasks too, so its count is the shared overdue count.
 const [tasks,setTasks]=useState<TaskRecord[]>([]),[version,setVersion]=useState(0);
 useEffect(()=>{if(!open)return;let live=true;void readTasks().then(rows=>{if(live)setTasks(rows.filter(task=>isOverdue(task,new Date(),zone)));}).catch(()=>{});return()=>{live=false;};},[open,zone,version]);
 async function completeTask(task:TaskRecord){
  if(busy)return;setBusy(true);
  try{
   const receipt=await getTaskApi().updateTask(task.id,task.version,{status:'completed'});setVersion(v=>v+1);onRefresh();
   notify('Task completed',{tone:'success',action:{label:'Undo',onClick:()=>{void getTaskApi().updateTask(task.id,receipt.record.version,{status:task.status}).then(()=>{setVersion(v=>v+1);onRefresh();}).catch(()=>notify('Could not undo that',{tone:'danger'}));}}});
  }catch{notify('Could not complete that task. Try again.',{tone:'danger'});}finally{setBusy(false);}
 }
 async function done(row:DeadlineRecord){
  if(busy)return;setBusy(true);
  try{
   const receipt=await getDeadlineApi().completeDeadline(row.id,row.version);onRefresh();
   notify('Marked done',{tone:'success',action:{label:'Undo',onClick:()=>{void getDeadlineApi().reopenDeadline(row.id,receipt.record.version).then(onRefresh).catch(()=>notify('Could not reopen the deadline',{tone:'danger'}));}}});
  }catch{notify('Could not mark the deadline done. Try again.',{tone:'danger'});}finally{setBusy(false);}
 }
 async function move(row:DeadlineRecord){
  if(busy||!/^\d{4}-\d\d-\d\d$/.test(date)||date<today)return;setBusy(true);const before=row.due;
  try{
   const receipt=await getDeadlineApi().updateDeadline(row.id,row.version,{due:{kind:'date',date}});setMoving(null);onRefresh();
   notify('Moved to '+formatShortDate(date,{zone}),{tone:'success',action:{label:'Undo',onClick:()=>{void getDeadlineApi().updateDeadline(row.id,receipt.record.version,{due:before}).then(onRefresh).catch(()=>notify('Could not undo the new date',{tone:'danger'}));}}});
  }catch{notify('Could not change the date. Try again.',{tone:'danger'});}finally{setBusy(false);}
 }
 const hide=()=>{try{localStorage.setItem('lemma.v6.overdue-hidden.'+today,'1');}catch{/* keep local state */}onClose();};
 return <Sheet open={open} onClose={onClose} title={tasks.length+deadlines.length+topics.length+' overdue'} eyebrow="Needs a decision" footer={<Button variant="ghost" onClick={hide}>Hide until tomorrow</Button>}>
  <ul className="v7-od">
   {tasks.map(task=><li key={task.id}>
    <p><strong>{task.title}</strong><small>Task · due {task.due.kind==='date'?formatShortDate(task.due.date,{zone}):task.due.kind==='instant'?formatShortDate(task.due.at,{zone}):''}</small></p>
    <div className="v7-od-actions">
     <Button small variant="secondary" aria-label={'Mark '+task.title+' done'} onClick={()=>{void completeTask(task);}}>Done</Button>
     <Link className="v7-button v7-ghost v7-small" to={'/calendar?view=day&quick=1&task='+encodeURIComponent(task.id)+(task.estimateMinutes?'&len='+task.estimateMinutes:'')}><span>Reschedule</span></Link></div>
   </li>)}
   {deadlines.map(row=><li key={row.id}>
    <p><strong>{row.title}</strong><small>Due {formatShortDate(deadlineDay(row,zone),{zone})}</small></p>
    {row.origin==='owner'&&<div className="v7-od-actions">
     <Button small variant="secondary" aria-label={'Mark '+row.title+' done'} onClick={()=>{void done(row);}}>Done</Button>
     <Button small variant="ghost" onClick={()=>{setDate(shiftDay(today,1));setMoving(moving===row.id?null:row.id);}}>Reschedule</Button></div>}
    {moving===row.id&&<form onSubmit={event=>{event.preventDefault();void move(row);}}>
     <DatePicker label={'New due date for '+row.title} value={date} onChange={setDate}/>
     <Button small variant="primary" disabled={busy||date<today} onClick={()=>{void move(row);}}>Save date</Button></form>}
   </li>)}
   {topics.map(row=><li key={row.id}><p><strong>{row.title}</strong><small>Practice · due {formatShortDate(row.nextDueDate!,{zone})}</small></p>
    <div className="v7-od-actions"><Link className="v7-button v7-secondary v7-small" to={'/practice#topic-'+row.id}><span>Practice now</span></Link></div></li>)}
  </ul>
 </Sheet>;
}
