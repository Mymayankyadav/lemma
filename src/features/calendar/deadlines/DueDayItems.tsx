// N74: owner-visible deadline projections and due practice topics in Calendar.
// This view is read-only: neither due items nor estimates affect study effort totals.
import {useState} from 'react';
import {Link} from 'react-router';
import type {ProjectSummary} from '../../../data/types';
import type {DeadlineRecord} from '../../../data/deadlines/contract';
import type {PracticeTopicRecord} from '../../../data/practice-topics/contract';
import {dayKey} from '../model';
import {formatDay,formatDateTime,formatDuration,formatInterval} from '../../../lib/format';

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
export function dueForDay(date:string,_firstVisible:string,zone:string,
 dues:CalendarDues,now:Date=new Date()):DueItem[]{
 const today=dayKey(now,zone);
 const result:DueItem[]=[];
 for(const row of dues.deadlines){
  if(row.status!=='open')continue;
  const due=deadlineDay(row,zone);
  if(due===date)result.push({type:'deadline',key:'deadline:'+row.id,date:due,
   value:row,overdue:due<today});
 }
 for(const row of dues.topics){
  if(row.archivedAt!==null||row.nextDueDate===null)continue;
  const due=row.nextDueDate;
  if(due===date)result.push({type:'practice',key:'practice:'+row.id,date:due,
   value:row,overdue:due<today});
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||
  a.type.localeCompare(b.type)||a.key.localeCompare(b.key));
}
const origin=(kind:DeadlineRecord['origin']):string=>
 kind==='owner'?'Deadline':kind==='project_target'?'Path target date':'Checkpoint due';
function detail(item:DueItem,zone:string,projects:readonly ProjectSummary[]){
 if(item.type==='deadline'){
  const row=item.value;
  const path=row.projectId?projects.find(project=>project.id===row.projectId):undefined;
  return <>
   <p>{origin(row.origin)} · {row.kind.charAt(0).toUpperCase()+row.kind.slice(1)}</p>
   <p>Due {row.due.kind==='date'?formatDay(row.due.date,{zone}):
    formatDateTime(row.due.at,{zone})}</p>
   <p>{row.remainingMinutes===null?'Remaining effort not estimated':
     'About '+formatDuration(row.remainingMinutes)+' of work left'}</p>
   {row.origin!=='owner'&&<p>From your path's target date</p>}
   {path&&<p><Link to={'/p/'+path.slug} className="text-[var(--link)] underline">{path.title}</Link></p>}
  </>;
 }
 const row=item.value;
 return <>
  <p>Next practice: {row.nextDueDate?formatDay(row.nextDueDate,{zone}):'Not scheduled'}</p>
  <p>{row.cadence.kind==='fixed_days'?
    'Repeat every '+formatInterval(row.cadence.days):
    'Next practice adapts to your rating'}</p>
  <p>{row.lastPracticedAt?
    'Last practiced '+formatDay(row.lastPracticedAt,{zone}):
    'Not yet practiced'}</p>
  <p><Link to={'/practice#topic-'+row.id} className="text-[var(--link)] underline">Practice now</Link></p>
 </>;
}

/** Accessible record disclosures; no route to an unshipped feature is invented. */
export function DueDayItems({date,firstVisible,zone,dues,compact=false,projects=[]}:{
 date:string;firstVisible:string;zone:string;dues:CalendarDues;compact?:boolean;
 projects?:readonly ProjectSummary[];
}){
 const [opened,setOpened]=useState<string|null>(null);
 const rows=dueForDay(date,firstVisible,zone,dues);
 if(rows.length===0)return null;
 return <section aria-label={'Deadlines and practice for '+date}
   className={'flex min-w-0 flex-col gap-1 '+(compact?'text-caption':'text-label')}>
  {rows.map(item=>{
   const title=item.value.title,show=opened===item.key;
   return <article key={item.key} data-due-id={item.key}
    className={'cr-agenda-due min-w-0 text-ink '+(compact?'rounded-ctl border border-edge bg-fill-1 p-2':
     'rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3')}>
    <button type="button" aria-expanded={show}
      aria-label={'Open '+(item.type==='deadline'?'deadline ':'practice topic ')+title}
      onClick={()=>setOpened(old=>old===item.key?null:item.key)}
      className="min-h-11 w-full rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-amber">
     <strong className="block break-words">{title}</strong>
     <span className="block break-words text-ink-2">
      {item.type==='deadline'?origin(item.value.origin):'Practice due'}
      {item.overdue?' · Overdue since '+formatDay(item.date,{zone}):''}
      {item.type==='deadline'&&item.value.remainingMinutes!==null?
        ' · '+formatDuration(item.value.remainingMinutes)+' left':''}
     </span>
    </button>
    {show&&<section aria-label={'Details for '+title}
      className="mt-2 space-y-1 border-t border-edge pt-2 text-ink-2">
      {detail(item,zone,projects)}
    </section>}
   </article>;
  })}
 </section>;
}
