import {useState} from 'react';
import {Link} from 'react-router';
import {getDeadlineApi} from '../../../data/deadlines';
import type {DeadlineRecord} from '../../../data/deadlines/contract';
import {Button,Field,Sheet} from '../../../ui/v7/components';
import {useToast} from '../../../ui/Toast';
import {formatDay} from '../../../lib/format';
import {shiftDay} from '../model';
import {deadlineDay,type CalendarDues} from '../deadlines/DueDayItems';
import {overdueItems} from '../deadlines/OverdueBanner';

/** PLAN §6.6 overdue sheet: Done, Reschedule, Hide until tomorrow. Same writes as the v6 banner. */
export default function OverdueSheetV7({open,dues,zone,onClose,onRefresh}:{open:boolean;dues:CalendarDues;zone:string;onClose:()=>void;onRefresh:()=>void}){
 const notify=useToast(),{today,deadlines,topics}=overdueItems(dues,zone);
 const [moving,setMoving]=useState<string|null>(null),[date,setDate]=useState(shiftDay(today,1)),[busy,setBusy]=useState(false);
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
   notify('Moved to '+formatDay(date,{zone}),{tone:'success',action:{label:'Undo',onClick:()=>{void getDeadlineApi().updateDeadline(row.id,receipt.record.version,{due:before}).then(onRefresh).catch(()=>notify('Could not undo the new date',{tone:'danger'}));}}});
  }catch{notify('Could not change the date. Try again.',{tone:'danger'});}finally{setBusy(false);}
 }
 const hide=()=>{try{localStorage.setItem('lemma.v6.overdue-hidden.'+today,'1');}catch{/* keep local state */}onClose();};
 return <Sheet open={open} onClose={onClose} title={deadlines.length+topics.length+' overdue'} eyebrow="Needs a decision" footer={<Button variant="ghost" onClick={hide}>Hide until tomorrow</Button>}>
  <ul className="v7-od">
   {deadlines.map(row=><li key={row.id}>
    <p><strong>{row.title}</strong><small>Due {formatDay(deadlineDay(row,zone),{zone})}</small></p>
    {row.origin==='owner'&&<div className="v7-od-actions">
     <Button small variant="secondary" aria-label={'Mark '+row.title+' done'} onClick={()=>{void done(row);}}>Done</Button>
     <Button small variant="ghost" onClick={()=>{setDate(shiftDay(today,1));setMoving(moving===row.id?null:row.id);}}>Reschedule</Button></div>}
    {moving===row.id&&<form onSubmit={event=>{event.preventDefault();void move(row);}}>
     <Field label={'New due date for '+row.title} type="date" min={today} value={date} onChange={event=>setDate(event.target.value)}/>
     <Button small variant="primary" disabled={busy||date<today} onClick={()=>{void move(row);}}>Save date</Button></form>}
   </li>)}
   {topics.map(row=><li key={row.id}><p><strong>{row.title}</strong><small>Practice · due {formatDay(row.nextDueDate!,{zone})}</small></p>
    <div className="v7-od-actions"><Link className="v7-button v7-secondary v7-small" to={'/practice#topic-'+row.id}><span>Practice now</span></Link></div></li>)}
  </ul>
 </Sheet>;
}
