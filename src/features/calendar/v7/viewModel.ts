import type {CalendarBlockRecord} from '../../../data/study/contract';
import {calendarRange,monthBounds,weekStartDay} from '../model';
import type {StudyRange} from '../../../data/study/contract';

/** PLAN §6.5 Week, Month and Agenda: the pieces that do not need React. */
export type CalendarView='day'|'week'|'month'|'agenda';
export const calendarViews:readonly CalendarView[]=['day','week','month','agenda'];
export const viewLabel=(view:CalendarView)=>view[0].toUpperCase()+view.slice(1);
export const parseView=(value:string|null):CalendarView=>calendarViews.find(view=>view===value)??'day';
/** The span of days each view needs loaded. Agenda reads two weeks ahead. */
export function loadRange(view:CalendarView,date:string,zone:string,firstDay:number):StudyRange{
 if(view==='month')return monthBounds(date,zone,firstDay).range;
 if(view==='agenda')return calendarRange(date,zone,14);
 return calendarRange(weekStartDay(date,firstDay),zone,7);
}
/** KC6: the kit's heatmap steps — 0, 1–15, 16–30, 31–60 and 60+ min — on the Starlight (Night) and Ink (Day) ramps.
 *  0 means an outlined, unfilled cell (never printed as "0"). */
export const heatLegend=['0','1–15','16–30','31–60','60+ min'] as const;
export function tintStep(minutes:number):0|1|2|3|4{
 const m=Math.round(minutes);
 return m<=0?0:m<=15?1:m<=30?2:m<=60?3:4;
}
export const MAX_DOTS=3;
/** Up to three distinct subject classes for a day's planned study, in order of first appearance. */
export function dotClasses(blocks:readonly CalendarBlockRecord[],klass:(block:CalendarBlockRecord)=>string):string[]{
 const seen=new Set<string>(),out:string[]=[];
 for(const block of blocks){
  if(block.kind!=='study'||block.status==='cancelled')continue;
  const value=klass(block)||'v7-subject-none';
  if(!seen.has(value)){seen.add(value);out.push(value);}
 }
 return out.slice(0,MAX_DOTS);
}
/** Minutes logged under a week column: "40 min", "1 h 5 min", and nothing at all for a quiet day. */
export function loggedCaption(minutes:number):string{
 const total=Math.round(minutes);
 if(total<=0)return '';
 const h=Math.floor(total/60),m=total%60;
 return h?h+' h'+(m?' '+m+' min':''):m+' min';
}
/** Title text appears from 600 px; below that a block is a bar with no text, never a fragment. */
export const WEEK_TITLE_MIN_WIDTH=600;
export const weekGlyphMinHeight=28;
export const showWeekGlyph=(heightPx:number)=>heightPx>=weekGlyphMinHeight;
/** PA7/CA4: runs of empty days in Agenda become one line ("Thu 12 – Sat 14 Nov · Nothing planned · Add"). */
export function collapseEmptyRuns(days:readonly {day:string;empty:boolean}[]):{from:string;to:string;empty:boolean}[]{
 const out:{from:string;to:string;empty:boolean}[]=[];
 for(const item of days){
  const last=out[out.length-1];
  if(item.empty&&last?.empty)last.to=item.day;
  else out.push({from:item.day,to:item.day,empty:item.empty});
 }
 return out;
}
/** Rows for an empty-day line in Agenda. */
export const nothingPlanned='Nothing planned';
export function agendaTimeColumn(startsAt:string,endsAt:string,clock:(instant:string)=>string):string{
 return clock(startsAt)+'–'+clock(endsAt);
}
