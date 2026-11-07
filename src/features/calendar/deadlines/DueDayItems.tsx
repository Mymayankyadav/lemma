// N74: owner-visible deadline projections and due practice topics in Calendar.
// This view is read-only: neither due items nor estimates affect study effort totals.
import {useState} from 'react';
import type {DeadlineRecord} from '../../../data/deadlines/contract';
import type {PracticeTopicRecord} from '../../../data/practice-topics/contract';
import {dayKey} from '../model';

export interface CalendarDues {
 deadlines:DeadlineRecord[];
 topics:PracticeTopicRecord[];
}
export const emptyCalendarDues:CalendarDues={deadlines:[],topics:[]};
export type DueItem=
 | {type:'deadline';key:string;date:string;value:DeadlineRecord;overdue:boolean}
 | {type:'practice';key:string;date:string;value:PracticeTopicRecord;overdue:boolean};

export function deadlineDay(row:DeadlineRecord,zone:string):string {
 // Plain civil due dates are never timezone-converted. Instants are.
 return row.due.kind==='date'?row.due.date:dayKey(new Date(row.due.at),zone);
}
export function dueForDay(date:string,firstVisible:string,zone:string,
 dues:CalendarDues):DueItem[]{
 const result:DueItem[]=[];
 for(const row of dues.deadlines){
  if(row.status!=='open')continue;
  const due=deadlineDay(row,zone),shown=due<firstVisible?firstVisible:due;
  if(shown===date)result.push({type:'deadline',key:'deadline:'+row.id,date:due,
   value:row,overdue:due<firstVisible});
 }
 for(const row of dues.topics){
  if(row.archivedAt!==null||row.nextDueDate===null)continue;
  const due=row.nextDueDate,shown=due<firstVisible?firstVisible:due;
  if(shown===date)result.push({type:'practice',key:'practice:'+row.id,date:due,
   value:row,overdue:due<firstVisible});
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||
  a.type.localeCompare(b.type)||a.key.localeCompare(b.key));
}
const origin=(kind:DeadlineRecord['origin']):string=>
 kind==='owner'?'Deadline':kind==='project_target'?'Project target':'Checkpoint due';
const days=(number:number)=>number===1?'day':'days';
function detail(item:DueItem,zone:string){
 if(item.type==='deadline'){
  const row=item.value;
  return <>
   <p>Origin: {origin(row.origin)} · {row.kind}</p>
   <p>Due: {row.due.kind==='date'?row.due.date:
    new Intl.DateTimeFormat('en',{timeZone:zone,dateStyle:'medium',
     timeStyle:'short'}).format(new Date(row.due.at))}</p>
   <p>{row.remainingMinutes===null?'Remaining effort not estimated':
     row.remainingMinutes+' minutes remaining'+
      (row.estimateSource?' ('+row.estimateSource+' estimate)':'')}</p>
   {row.origin!=='owner'&&<p>Read-only projection from an existing linked record</p>}
   {row.projectId&&<p>Project: {row.projectId}</p>}
   {row.checkpointId&&<p>Checkpoint: {row.checkpointId}</p>}
  </>;
 }
 const row=item.value;
 return <>
  <p>Next practice: {row.nextDueDate}</p>
  <p>{row.cadence.kind==='fixed_days'?
    'Repeat every '+row.cadence.days+' '+days(row.cadence.days):
    'After rating: '+row.cadence.daysByRating.join(' / ')+' days'}</p>
  <p>{row.lastPracticedAt?
    'Last practiced '+new Intl.DateTimeFormat('en',{timeZone:zone,dateStyle:'medium'})
     .format(new Date(row.lastPracticedAt)):
    'Not yet practiced'}</p>
  {row.checkpointId&&<p>Checkpoint: {row.checkpointId}</p>}
 </>;
}

/** Accessible record disclosures; no route to an unshipped feature is invented. */
export function DueDayItems({date,firstVisible,zone,dues,compact=false}:{
 date:string;firstVisible:string;zone:string;dues:CalendarDues;compact?:boolean;
}){
 const [opened,setOpened]=useState<string|null>(null);
 const rows=dueForDay(date,firstVisible,zone,dues);
 if(rows.length===0)return null;
 return <section aria-label={'Deadlines and practice for '+date}
   className={'flex min-w-0 flex-col gap-1 '+(compact?'text-caption':'text-label')}>
  {rows.map(item=>{
   const title=item.value.title,show=opened===item.key;
   return <article key={item.key} data-due-id={item.key}
    className="min-w-0 rounded-ctl border border-edge bg-fill-1 p-2 text-ink">
    <button type="button" aria-expanded={show}
      aria-label={'Open '+(item.type==='deadline'?'deadline ':'practice topic ')+title}
      onClick={()=>setOpened(old=>old===item.key?null:item.key)}
      className="min-h-9 w-full rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-amber">
     <strong className="block break-words">{title}</strong>
     <span className="block break-words text-ink-2">
      {item.type==='deadline'?origin(item.value.origin):'Practice due'}
      {item.overdue?' · Overdue since '+item.date:''}
      {item.type==='deadline'&&item.value.remainingMinutes!==null?
        ' · '+item.value.remainingMinutes+' min remaining':''}
     </span>
    </button>
    {show&&<section aria-label={'Details for '+title}
      className="mt-2 space-y-1 border-t border-edge pt-2 text-ink-2">
      {detail(item,zone)}
    </section>}
   </article>;
  })}
 </section>;
}
