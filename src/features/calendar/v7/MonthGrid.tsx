import {useMemo} from 'react';
import {Flag} from 'lucide-react';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {monthDays} from '../model';
import {dueForDay,type CalendarDues} from '../deadlines/DueDayItems';
import type {BlockLook} from './DayGrid';
import {dotClasses,heatLegend,tintStep} from './viewModel';
import {SubjectGlyph} from '../../../ui/v7/Subject';

/** PLAN §6.5 Month: a tinted grid with subject dots and a flag for due items. No cell prints "0". */
export default function MonthGrid({date,today,zone,firstDay,entries,blocks,dues,lookOf,onPick}:{
 date:string;today:string;zone:string;firstDay:number;entries:StudyEntryRecord[];blocks:CalendarBlockRecord[];dues:CalendarDues;
 lookOf:(block:CalendarBlockRecord)=>BlockLook;onPick:(day:string)=>void;
}){
 const grid=useMemo(()=>monthDays(date,zone,entries,blocks,firstDay),[date,zone,entries,blocks,firstDay]);
 const names=grid.days.slice(0,7).map(day=>new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short'}).format(new Date(day.day+'T12:00:00Z')));
 return <section className="v7-mo" aria-label="Month calendar">
  <div className="v7-mo-names" aria-hidden="true">{names.map((name,index)=><span key={index}>{name}</span>)}</div>
  <div className="v7-mo-grid" role="group" aria-label="Month date grid">
   {grid.days.map(day=>{
    const logged=Math.round(day.capacity.logged),dots=dotClasses(day.blocks,block=>lookOf(block).subjectClass),due=dueForDay(day.day,grid.first,zone,dues).length;
    const parts:string[]=[];
    if(logged>0)parts.push(logged+' min logged');
    if(day.blocks.length)parts.push(day.blocks.length+(day.blocks.length===1?' block':' blocks'));
    if(due)parts.push(due+' due');
    const long=new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(day.day+'T12:00:00Z'));
    return <button key={day.day} type="button" data-month-day={day.day} data-tint={tintStep(logged)} data-today={day.day===today?'true':'false'}
     data-selected={day.day===date?'true':'false'} data-outside={!day.inMonth||undefined} aria-pressed={day.day===date}
     aria-label={long+(day.day===today?', today':'')+(parts.length?', '+parts.join(', '):'')} onClick={()=>onPick(day.day)}>
     <span>{Number(day.day.slice(-2))}</span>
     <i aria-hidden="true">{dots.map(klass=><SubjectGlyph key={klass} klass={klass}/>)}</i>
     {due>0&&<Flag className="v7-mo-flag" aria-hidden="true"/>}
    </button>;
   })}
  </div>
  {/* KC6: the kit's five labelled swatches; glyphs, not dots, mark planned study (KC2). */}
  <div className="v7-mo-legend" aria-label="Legend">
   <span className="v7-mo-swatches">Logged {heatLegend.map((label,index)=><span key={label}><i data-tint={index} aria-hidden="true"/>{label}</span>)}</span>
   <span>Glyphs mark planned study · <Flag aria-hidden="true"/> something due</span>
  </div>
 </section>;
}
