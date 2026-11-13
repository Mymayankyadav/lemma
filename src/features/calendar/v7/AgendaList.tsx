import {useMemo} from 'react';
import {MEANING_ICON} from '../../../ui/v7/meanings';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import type {ProjectSummary} from '../../../data/types';
import {formatDuration,formatShortDate,formatTimeLeft} from '../../../lib/format';
import {SubjectMark,subjectClass,subjectFromClass} from '../../../ui/v7/Subject';
import {kitSubject} from '../../atlas/v7/model';
import {agendaGroups,calendarRange,shiftDay} from '../model';
import {dueForDay,type CalendarDues,type DueItem} from '../deadlines/DueDayItems';
import {OverlapMarkers,useCalendarOverlaps} from '../overlaps/OverlapMarkers';
import {matchingAcknowledgement,overlapWindows} from '../overlaps/model';
import type {BlockLook} from './DayGrid';
import {agendaTimeColumn,collapseEmptyRuns,nothingPlanned} from './viewModel';

const origin=(kind:string)=>kind==='owner'?'Deadline':kind==='project_target'?'Path target date':'Checkpoint due';
/** CA2: deadlines and practice share the block row's design — time column, icon, subject rule, title in Body.
 *  B2: the time column says how long is left from the full due date and time, never the effort still left. */
export function DueRow({item,zone,projects=[],now}:{item:DueItem;zone:string;projects?:readonly ProjectSummary[];now?:Date}){
 const options={zone,now:now??new Date(),clock24h:true};
 if(item.type==='deadline'){
  const row=item.value,project=row.projectId?projects.find(candidate=>candidate.id===row.projectId):undefined;
  const subject=project?kitSubject(project.subject.name):null;
  return <li className={'v7-ag-row'+(subject?' '+subjectClass(subject):'')} data-kind="due">
   <span className="v7-ag-time">{formatTimeLeft(row.due,options)}</span>
   <span className="v7-ag-body"><strong><MEANING_ICON.deadline aria-hidden="true" className="v7-ag-icon"/>{row.title}</strong>
    <small>{origin(row.origin)}{project?' · '+project.title:''}{row.remainingMinutes!==null?' · about '+formatDuration(row.remainingMinutes)+' of work':''}</small></span>
  </li>;
 }
 const row=item.value;
 return <li className="v7-ag-row" data-kind="due">
  <span className="v7-ag-time">{formatTimeLeft({kind:'date',date:row.nextDueDate!},options)}</span>
  <span className="v7-ag-body"><strong><MEANING_ICON.practice aria-hidden="true" className="v7-ag-icon"/>{row.title}</strong><small>Practice due</small></span>
 </li>;
}

/** PLAN §6.5 Agenda: sticky day headings, a time column, one row design for every kind of item, runs of empty days as one line. */
export default function AgendaList({date,today,zone,clock,entries,blocks,dues,projects,lookOf,onEdit,onAdd,clock24h}:{
 date:string;today:string;zone:string;clock:(instant:string)=>string;clock24h:boolean;entries:StudyEntryRecord[];blocks:CalendarBlockRecord[];dues:CalendarDues;
 projects:readonly ProjectSummary[];lookOf:(block:CalendarBlockRecord)=>BlockLook;onEdit:(block:CalendarBlockRecord)=>void;onAdd:(day:string)=>void;
}){
 const range=useMemo(()=>calendarRange(date,zone,14),[date,zone]);
 const controls=useCalendarOverlaps(range);
 const groups=useMemo(()=>{
  const first=agendaGroups(date,zone,entries,blocks);
  const more=agendaGroups(shiftDay(date,7),zone,entries,blocks);
  return [...first,...more];
 },[date,zone,entries,blocks]);
 const runs=useMemo(()=>collapseEmptyRuns(groups.map(group=>({day:group.day,empty:!group.entries.length&&!group.blocks.length&&!dueForDay(group.day,date,zone,dues).length}))),[groups,date,zone,dues]);
 const byDay=new Map(groups.map(group=>[group.day,group]));
 const label=(day:string)=>(day===today?'Today · ':'')+formatShortDate(day,{zone});
 return <div className="v7-ag" aria-label="Agenda">
  {runs.map(run=>{
   if(run.empty){
    const heading=run.from===run.to?label(run.from):formatShortDate(run.from,{zone})+' – '+formatShortDate(run.to,{zone});
    return <section key={run.from} className="v7-ag-day" aria-labelledby={'ag-'+run.from}>
     <h2 id={'ag-'+run.from} className="v7-ag-heading">{heading}</h2>
     <p className="v7-ag-empty">{nothingPlanned} · <button type="button" onClick={()=>onAdd(run.from)}>Add</button></p>
    </section>;
   }
   const group=byDay.get(run.from)!;
   const open=overlapWindows([],group.blocks,calendarRange(group.day,zone)).filter(row=>!matchingAcknowledgement(row,controls.records));
   const due=dueForDay(group.day,date,zone,dues);
   return <section key={group.day} className="v7-ag-day" aria-labelledby={'ag-'+group.day}>
    <h2 id={'ag-'+group.day} className="v7-ag-heading">{label(group.day)}</h2>
    {open.length>0&&<OverlapMarkers zone={zone} controls={controls} clock24h={clock24h} windows={open}/>}
    <ul>
     {group.entries.map((slice,index)=><li key={slice.entry.id+':'+index} className="v7-ag-row" data-kind="logged">
      <span className="v7-ag-time">{agendaTimeColumn(slice.start,slice.end,clock)}</span>
      <span className="v7-ag-body"><strong>{slice.entry.intent||'Study'}</strong><small>Logged · {Math.round((Date.parse(slice.end)-Date.parse(slice.start))/60000)} min</small></span></li>)}
     {group.blocks.map(block=>{const look=lookOf(block);
      return <li key={block.id} className={'v7-ag-row '+look.subjectClass} data-kind={block.kind==='busy'?'busy':block.status==='done'?'done':'study'}>
       <button type="button" aria-label={'Edit block '+block.title} onClick={()=>onEdit(block)}>
        <span className="v7-ag-time">{agendaTimeColumn(block.startsAt,block.endsAt,clock)}</span>
        <span className="v7-ag-body"><strong>{look.subjectClass&&block.kind!=='busy'?<SubjectMark subject={subjectFromClass(look.subjectClass)}/>:null}{block.title}</strong>
         <small>{block.kind==='busy'?'Busy':block.status==='done'?'Done':'Planned study'}{look.path?' · '+look.path:''}</small></span>
       </button></li>;})}
     {due.map(item=><DueRow key={item.key} item={item} zone={zone} projects={projects}/>)}
    </ul>
   </section>;
  })}
 </div>;
}
