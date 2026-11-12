import {dayBounds} from '../../../lib/effort';
import type {StudyEntryRecord} from '../../../data/study/contract';
import type {GoalRecord} from '../../../data/study-goals/contract';
import {addDays,civilDay,effortSummary,periodFor,type EffortPeriod,type EffortRange} from '../../progress-v6/model';
import {formatDuration} from '../../../lib/format';

/** PLAN §6.13. Pure rules for v7 Progress so the figures are testable and add up. */
export type ProgressRange='day'|'7'|'30'|'90';
export const ranges:readonly {value:ProgressRange;label:string}[]=[{value:'day',label:'Today'},{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'}];
export const asRange=(value:string|null):ProgressRange=>value==='day'||value==='7'||value==='90'?value:'30';
export const rangePhrase=(range:ProgressRange)=>range==='day'?'today':'in the last '+range+' days';
export const previousPhrase=(range:ProgressRange)=>range==='day'?'yesterday':'the '+range+' days before';
/** The insight read only knows 7, 30 and 90 days; Today filters the 7-day read to one day. */
export const insightDays=(range:ProgressRange):7|30|90=>range==='day'||range==='7'?7:Number(range) as 30|90;
export const rangeLength=(range:ProgressRange)=>range==='day'?1:Number(range);

function periodOf(days:string[],range:EffortRange,zone:string):EffortPeriod{
 return {range,days,span:{start:dayBounds(days[0],zone).start,end:dayBounds(addDays(days[days.length-1],1),zone).start}};
}
export function currentPeriod(range:ProgressRange,now:Date,zone:string):EffortPeriod{return periodFor(range,now,zone);}
/** The same number of days immediately before the current range. */
export function previousPeriod(period:EffortPeriod,zone:string):EffortPeriod{
 const length=period.days.length,first=addDays(period.days[0],-length);
 return periodOf(Array.from({length},(_,index)=>addDays(first,index)),period.range,zone);
}
/** The almanac: whole weeks (Monday first) ending with the current week. */
export function almanacPeriod(now:Date,zone:string,weeks=26):EffortPeriod{
 const today=civilDay(now,zone),[y,m,d]=today.split('-').map(Number);
 const monday=addDays(today,-((new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7));
 const first=addDays(monday,-7*(weeks-1));
 return periodOf(Array.from({length:weeks*7},(_,index)=>addDays(first,index)),'90',zone);
}
/** The span that covers every read on the page, so one study read serves them all. */
export const coveringSpan=(...periods:EffortPeriod[])=>({start:periods.map(p=>p.span.start).sort()[0],end:periods.map(p=>p.span.end).sort().at(-1)!});

/** Columns for the range: one per day, or one per week (from the first day) at 90 days or for subject stacks. */
export function groupDays(days:readonly string[],size:number):string[][]{
 const out:string[][]=[];
 for(let index=0;index<days.length;index+=size)out.push(days.slice(index,index+size));
 return out;
}
export interface StackColumn{label:string;from:string;to:string;minutes:number;bySubject:Record<string,number>}
/** Minutes per column and per subject. Each column is its own exact partition, so the columns sum to the range total. */
export function stackColumns(entries:StudyEntryRecord[],groups:string[][],zone:string,now:string):StackColumn[]{
 return groups.map(days=>{
  const summary=effortSummary(entries,periodOf(days,'7',zone),zone,now);
  return {label:days[0],from:days[0],to:days[days.length-1],minutes:summary.minutes,bySubject:Object.fromEntries(summary.exactParts.map(part=>[part.id,part.minutes]))};
 });
}
export function changeChip(current:number,previous:number,range:ProgressRange):{text:string;tone:'success'|'info'}|null{
 if(previous<=0&&current<=0)return null;
 const delta=Math.round(current-previous);
 if(Math.abs(delta)<1)return {text:'The same as '+previousPhrase(range),tone:'info'};
 return {text:formatDuration(Math.abs(delta))+(delta>0?' more than ':' less than ')+previousPhrase(range),tone:delta>0?'success':'info'};
}
/** At most two plain sentences from fixed rules, each only when its rule has enough data. */
export function insightSentences({parts,total,name,unsure}:{parts:{id:string;minutes:number}[];total:number;name:(id:string)=>string;unsure:{total:number;rate:number|null}|undefined}):string[]{
 const out:string[]=[];
 const top=parts.filter(part=>part.id!=='unassigned').sort((a,b)=>b.minutes-a.minutes)[0];
 if(top&&total>=60&&parts.length>1){
  const share=Math.round(top.minutes/total*100);
  if(share>=30)out.push(name(top.id)+' took '+share+'% of your time '+'in this range.');
 }
 if(unsure&&unsure.total>=5&&unsure.rate!==null)out.push('Your recall on cards you were unsure of is '+Math.round(unsure.rate*100)+'%.');
 return out.slice(0,2);
}
/** "Tue 13 Oct · 4 h 10 min" style tooltip text is the chart's job; this is the goal card's wording. */
export interface GoalView{title:string;done:string;target:string;fraction:number;pace:number|null;rest:string;finished:boolean;reached:boolean}
const periodWord:Record<string,string>={week:'This week',month:'This month',day:'Today',custom:'Custom range'};
export function goalView(goal:GoalRecord,minutes:number,scope:string,now:Date):GoalView{
 const today=civilDay(now,goal.timeZone);
 const total=Math.max(1,Math.round((Date.parse(goal.endDate+'T12:00:00Z')-Date.parse(goal.startDate+'T12:00:00Z'))/86_400_000)+1);
 const elapsed=Math.min(total,Math.max(0,Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(goal.startDate+'T12:00:00Z'))/86_400_000)+1));
 const finished=today>goal.endDate;
 const remaining=Math.max(0,goal.targetMinutes-minutes),reached=minutes>=goal.targetMinutes;
 const daysLeft=finished?0:Math.max(1,total-elapsed+1);
 return {
  title:(periodWord[goal.period]??'Goal')+' · '+scope,
  done:formatDuration(minutes),target:formatDuration(goal.targetMinutes),
  fraction:Math.min(1,minutes/Math.max(1,goal.targetMinutes)),
  pace:finished?null:Math.min(1,elapsed/total),
  rest:reached?'Reached':finished?formatDuration(remaining)+' short':formatDuration(remaining)+' to go · '+daysLeft+(daysLeft===1?' day left':' days left'),
  finished,reached,
 };
}
