import {useEffect,useMemo,useRef} from 'react';
import type {CSSProperties} from 'react';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {calendarRange,savedSlices,shiftDay} from '../model';
import {dayMinutes,layoutDayIntervals} from '../grid/layout';
import {dayCapacity} from '../model';
import {weekCells} from './dayModel';
import type {BlockLook} from './DayGrid';
import {loggedCaption,showWeekGlyph} from './viewModel';

export const WEEK_HOUR_PX=48;
const MINUTE=60_000;
/** PLAN §6.5 Week: the strip is the column header, an hour is 48 px, blocks are bars (titles from 600 px). */
export default function WeekGrid({weekStart,date,today,zone,clock,entries,blocks,now,lookOf,onDay,onEdit}:{
 weekStart:string;date:string;today:string;zone:string;clock:(instant:string)=>string;entries:StudyEntryRecord[];blocks:CalendarBlockRecord[];now:number;
 lookOf:(block:CalendarBlockRecord)=>BlockLook;onDay:(day:string)=>void;onEdit:(block:CalendarBlockRecord)=>void;
}){
 const scroll=useRef<HTMLDivElement>(null);
 const cells=useMemo(()=>weekCells(weekStart),[weekStart]);
 const columns=useMemo(()=>cells.map(cell=>{
  const range=calendarRange(cell.day,zone);
  const visible=blocks.filter(block=>block.status!=='cancelled');
  const saved=savedSlices(entries,range).map((slice,index)=>({id:'saved:'+slice.entry.id+':'+index,start:slice.start,end:slice.end}));
  const inputs=[...visible.map(block=>({id:'block:'+block.id,start:block.startsAt,end:block.endsAt})),...saved]
   .filter(item=>Date.parse(item.end)>Date.parse(range.start)&&Date.parse(item.start)<Date.parse(range.end));
  return {cell,range,whole:dayMinutes(range),items:layoutDayIntervals(inputs,range,WEEK_HOUR_PX),capacity:dayCapacity(cell.day,zone,entries,blocks)};
 }),[cells,zone,blocks,entries]);
 const first=Math.min(360,...columns.flatMap(column=>column.items.map(item=>Math.floor(item.startMinute/60)*60)));
 const whole=Math.max(...columns.map(column=>column.whole));
 const height=(whole-first)*WEEK_HOUR_PX/60;
 const anchor=columns.find(column=>column.cell.day===date)?.range.start??columns[0].range.start;
 const ticks=Array.from({length:Math.ceil((whole-first)/60)+1},(_,index)=>first+index*60).filter(minute=>minute<whole);
 const byId=useMemo(()=>new Map(blocks.map(block=>[block.id,block])),[blocks]);
 useEffect(()=>{
  const node=scroll.current;if(!node)return;
  node.scrollTop=Math.max(0,(480-first)*WEEK_HOUR_PX/60-WEEK_HOUR_PX/2);
  // Only on navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[weekStart,zone]);
 return <section className="v7-wk" aria-label="Week calendar">
  <div className="v7-wk-head" role="group" aria-label="Week">
   <span aria-hidden="true"/>
   {columns.map(({cell,capacity})=><button key={cell.day} type="button" data-strip-day={cell.day} aria-label={cell.long+(cell.day===today?', today':'')+(capacity.logged>0?', '+loggedCaption(capacity.logged)+' logged':'')+'. Open day'}
    data-today={cell.day===today?'true':'false'} data-selected={cell.day===date?'true':'false'} className="v7-wk-day" onClick={()=>onDay(cell.day)}>
    <small aria-hidden="true">{cell.initial}</small><span aria-hidden="true">{cell.number}</span><em aria-hidden="true">{loggedCaption(capacity.logged)}</em>
   </button>)}
  </div>
  <div ref={scroll} className="v7-wk-scroll" role="region" aria-label="Week time grid" tabIndex={0}>
   <div className="v7-wk-plane" style={{height}}>
    <div className="v7-wk-gutter" aria-hidden="true">{ticks.map(minute=>{const at=new Date(Date.parse(anchor)+minute*MINUTE).toISOString();
     return <time key={minute} dateTime={at} style={{top:(minute-first)*WEEK_HOUR_PX/60-7}}>{clock(at)}</time>;})}</div>
    <div className="v7-wk-cols">
     {ticks.map(minute=><i key={minute} aria-hidden="true" style={{top:(minute-first)*WEEK_HOUR_PX/60}}/>)}
     {columns.map(({cell,range,items})=><div key={cell.day} className="v7-wk-col" data-day={cell.day} data-today={cell.day===today?'true':'false'}>
      {items.map(item=>{
       const id=item.id.startsWith('block:')?item.id.slice(6):null,block=id?byId.get(id):undefined;
       const entry=!block?entries.find(candidate=>item.id.startsWith('saved:'+candidate.id+':')):undefined;
       const look=block?lookOf(block):entry?lookOf({projectId:entry.projectId} as CalendarBlockRecord):{subjectClass:'',path:''};
       const top=item.top-first*WEEK_HOUR_PX/60,shown=Math.max(12,item.height);
       const kind=block?(block.kind==='busy'?'busy':block.status==='done'?'done':'study'):'logged';
       const label=block?.title??entry?.intent??'Saved study',time=clock(item.start)+'–'+clock(item.end);
       const style:CSSProperties={top,height:shown,left:'calc('+item.lane/item.lanes*100+'% + 1px)',width:'calc('+100/item.lanes+'% - 2px)'};
       const spoken=label+', '+(kind==='busy'?'Busy':kind==='logged'?'Logged study':kind==='done'?'Completed study':'Planned study')+(look.path?', '+look.path:'')+', '+time;
       const past=Date.parse(item.end)<now&&now>=Date.parse(range.start)&&now<Date.parse(range.end);
       const inner=<>{showWeekGlyph(shown)&&kind!=='busy'&&<span className="v7-wk-glyph" aria-hidden="true"/>}<span className="v7-wk-title" aria-hidden="true">{label}</span></>;
       return block?<button key={item.id} type="button" data-calendar-block={block.id} data-kind={kind} data-past={past?'true':'false'} aria-label={spoken+'. Enter for details.'}
        className={'v7-wk-block '+look.subjectClass} style={style} onClick={()=>onEdit(block)}>{inner}</button>
       :<div key={item.id} role="img" aria-label={spoken} data-kind={kind} className={'v7-wk-block '+look.subjectClass} style={style}>{inner}</div>;
      })}
     </div>)}
    </div>
   </div>
  </div>
 </section>;
}
export const weekDayOf=(weekStart:string,offset:number)=>shiftDay(weekStart,offset);
