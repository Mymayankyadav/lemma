import {useState} from 'react';
import {Link} from 'react-router';
import {getDeadlineApi} from '../../../data/deadlines';
import type {DeadlineRecord} from '../../../data/deadlines/contract';
import type {ProjectSummary} from '../../../data/types';
import {useToast} from '../../../ui/Toast';
import {formatDay} from '../../../lib/format';
import {dayKey,shiftDay} from '../model';
import {deadlineDay, type CalendarDues} from './DueDayItems';

const control='flex min-h-11 items-center rounded-[8px] border border-[var(--control-edge)] px-3 text-label text-ink';

/** Items overdue against the owner's today: a deadline or practice topic due before today. */
export function overdueItems(dues:CalendarDues,zone:string,now:Date=new Date()){
 const today=dayKey(now,zone);
 return {
  today,
  deadlines:dues.deadlines.filter(row=>row.status==='open'&&deadlineDay(row,zone)<today),
  topics:dues.topics.filter(row=>row.archivedAt===null&&row.nextDueDate!==null&&row.nextDueDate<today),
 };
}
/** "Real Analysis" plus a link to the path, when the deadline is linked and the path is known. */
function pathOf(row:DeadlineRecord,projects:readonly ProjectSummary[]){
 return row.projectId?projects.find(project=>project.id===row.projectId)??null:null;
}

/** N121 B1: one dismissible banner, computed against today and never against the viewed range. */
export default function OverdueBanner({dues,zone,projects=[],onRefresh}:{
 dues:CalendarDues;zone:string;projects?:readonly ProjectSummary[];onRefresh:()=>void;
}){
 const {today,deadlines,topics}=overdueItems(dues,zone);
 const key='lemma.v6.overdue-hidden.'+today;
 const [hiddenKey,setHiddenKey]=useState(()=>{
  try{return localStorage.getItem(key)==='1'?key:''}catch{return ''}
 });
 const [rescheduling,setRescheduling]=useState<string|null>(null);
 const [newDate,setNewDate]=useState(shiftDay(today,1));
 const [busy,setBusy]=useState(false);
 const notify=useToast();
 const count=deadlines.length+topics.length;
 if(!count||hiddenKey===key)return null;
 const names=[...deadlines.map(row=>row.title),...topics.map(row=>row.title)];
 async function complete(row:DeadlineRecord){
  if(busy)return;setBusy(true);
  try{
   const receipt=await getDeadlineApi().completeDeadline(row.id,row.version);
   onRefresh();
   notify('Marked done',{tone:'success',action:{label:'Undo',onClick:()=>{
    void getDeadlineApi().reopenDeadline(row.id,receipt.record.version).then(onRefresh)
      .catch(()=>notify('Could not reopen the deadline',{tone:'danger'}));
   }}});
  }catch{
   notify('Could not mark the deadline done. Try again.',{tone:'danger'});
  }finally{setBusy(false)}
 }
 async function reschedule(row:DeadlineRecord){
  if(busy||!/^\d{4}-\d\d-\d\d$/.test(newDate)||newDate<today)return;
  setBusy(true);
  const before=row.due;
  try{
   const receipt=await getDeadlineApi().updateDeadline(row.id,row.version,{due:{kind:'date',date:newDate}});
   setRescheduling(null);onRefresh();
   notify('Moved to '+formatDay(newDate,{zone}),{tone:'success',action:{label:'Undo',onClick:()=>{
    void getDeadlineApi().updateDeadline(row.id,receipt.record.version,{due:before}).then(onRefresh)
      .catch(()=>notify('Could not undo the new date',{tone:'danger'}));
   }}});
  }catch{
   notify('Could not change the date. Try again.',{tone:'danger'});
  }finally{setBusy(false)}
 }
 return <section aria-label="Overdue items" className="lemma-overdue-banner rounded-[12px] border border-[var(--warn)] bg-[var(--paper)] px-3">
  <details className="lemma-disclosure">
   <summary className="flex min-h-11 cursor-pointer items-center text-label font-semibold text-ink">
    <span className="min-w-0 truncate">{count} overdue · {names.slice(0,2).join(', ')}{names.length>2?'…':''}</span>
   </summary>
   <ul className="flex flex-col gap-3 pb-3">
    {deadlines.map(row=>{
     const path=pathOf(row,projects);
     return <li key={row.id} className="flex min-w-0 flex-col gap-2 border-t border-[var(--hair)] pt-3">
      <span className="min-w-0 text-label text-ink"><strong className="block break-words font-medium">{row.title}</strong>
       <span className="text-ink-2">{path?path.title+' · ':''}Due {formatDay(deadlineDay(row,zone),{zone})}</span></span>
      <div className="flex flex-wrap gap-2">
       {row.origin==='owner'&&<button type="button" className={control} disabled={busy}
        aria-label={'Mark '+row.title+' done'} onClick={()=>{void complete(row);}}>Done</button>}
       {row.origin==='owner'&&<button type="button" className={control} disabled={busy}
        aria-expanded={rescheduling===row.id} onClick={()=>{setNewDate(shiftDay(today,1));setRescheduling(old=>old===row.id?null:row.id);}}>Reschedule</button>}
       {path&&<Link to={'/p/'+path.slug} className={control}>Open path</Link>}
      </div>
      {rescheduling===row.id&&<form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();void reschedule(row);}}>
       <label className="flex flex-col text-caption text-ink-2">New due date
        <input type="date" aria-label={'New due date for '+row.title} min={today} value={newDate}
         onChange={event=>setNewDate(event.target.value)}
         className="min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-body text-ink"/></label>
       <button type="submit" className={control} disabled={busy||newDate<today}>Save date</button>
      </form>}
     </li>;
    })}
    {topics.map(row=><li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--hair)] pt-3">
     <span className="min-w-0 flex-1 text-label text-ink"><strong className="block break-words font-medium">{row.title}</strong>
      <span className="text-ink-2">Practice · due {formatDay(row.nextDueDate!,{zone})}</span></span>
     <Link to={'/practice#topic-'+row.id} className={control}>Practice now</Link>
    </li>)}
    <li><button type="button" className="min-h-11 text-label text-ink-2 underline"
     onClick={()=>{try{localStorage.setItem(key,'1')}catch{/* keep local state */}setHiddenKey(key);}}>
     Hide until tomorrow
    </button></li>
   </ul>
  </details>
 </section>;
}
