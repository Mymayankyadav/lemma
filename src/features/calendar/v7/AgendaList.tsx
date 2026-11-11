import {useMemo} from 'react';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import type {ProjectSummary} from '../../../data/types';
import {agendaGroups,calendarRange,shiftDay} from '../model';
import {DueDayItems,dueForDay,type CalendarDues} from '../deadlines/DueDayItems';
import {OverlapMarkers,useCalendarOverlaps} from '../overlaps/OverlapMarkers';
import {matchingAcknowledgement,overlapWindows} from '../overlaps/model';
import {civilDayLabel} from '../views/labels';
import type {BlockLook} from './DayGrid';
import {agendaTimeColumn,nothingPlanned} from './viewModel';

/** PLAN §6.5 Agenda: sticky day headings, a 92 px time column, an overlap chip that opens the existing resolve sheet. */
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
 return <div className="v7-ag" aria-label="Agenda">
  {groups.map(group=>{
   const open=overlapWindows([],group.blocks,calendarRange(group.day,zone)).filter(row=>!matchingAcknowledgement(row,controls.records));
   const dueCount=dueForDay(group.day,date,zone,dues).length,empty=!group.entries.length&&!group.blocks.length&&!dueCount;
   return <section key={group.day} className="v7-ag-day" aria-labelledby={'ag-'+group.day}>
    <h2 id={'ag-'+group.day} className="v7-ag-heading">{group.day===today?'Today · ':''}{civilDayLabel(group.day)}</h2>
    {empty?<p className="v7-ag-empty">{nothingPlanned} · <button type="button" onClick={()=>onAdd(group.day)}>Add</button></p>:<>
     {open.length>0&&<OverlapMarkers zone={zone} controls={controls} clock24h={clock24h} windows={open}/>}
     <ul>
      {group.entries.map((slice,index)=><li key={slice.entry.id+':'+index} className="v7-ag-row" data-kind="logged">
       <span className="v7-ag-time">{agendaTimeColumn(slice.start,slice.end,clock)}</span>
       <span className="v7-ag-body"><strong>{slice.entry.intent||'Study'}</strong><small>Logged · {Math.round((Date.parse(slice.end)-Date.parse(slice.start))/60000)} min</small></span></li>)}
      {group.blocks.map(block=>{const look=lookOf(block);
       return <li key={block.id} className={'v7-ag-row '+look.subjectClass} data-kind={block.kind==='busy'?'busy':block.status==='done'?'done':'study'}>
        <button type="button" aria-label={'Edit block '+block.title} onClick={()=>onEdit(block)}>
         <span className="v7-ag-time">{agendaTimeColumn(block.startsAt,block.endsAt,clock)}</span>
         <span className="v7-ag-body"><strong>{block.title}</strong><small>{block.kind==='busy'?'Busy':block.status==='done'?'Done':'Planned study'}{look.path?' · '+look.path:''}</small></span>
        </button></li>;})}
     </ul>
     <DueDayItems date={group.day} firstVisible={date} zone={zone} dues={dues} projects={projects}/>
    </>}
   </section>;
  })}
 </div>;
}
