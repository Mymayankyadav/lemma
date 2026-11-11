import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import type {TaskRecord} from '../../../data/tasks/contract';
import type {ParkedThought} from '../../../data/parked-thoughts';
import {civilDay,dueDay} from '../../tasks/v7/tasksModel';

/** PLAN §6.7. Pure pieces of the three-step Close the day flow. */
export const STEPS=['Today','Loose ends','Tomorrow'] as const;
export type CloseStep=0|1|2;

export function focusMinutes(entry:Pick<StudyEntryRecord,'intervals'>):number{
 return entry.intervals.filter(interval=>interval.kind==='focus'&&interval.end)
  .reduce((sum,interval)=>sum+Math.max(0,(Date.parse(interval.end!)-Date.parse(interval.start))/60000),0);
}
export interface Meter{key:'focus'|'reviews'|'practice';label:string;value:number;max:number}
/** Only targets that exist today are listed; a goal of zero is not a target. */
export function meters(input:{focus:number;focusGoal:number;reviewsDone:number|null;reviewsDue:number;practiceDone:number|null;practiceDue:number}):Meter[]{
 const out:Meter[]=[];
 if(input.focusGoal>0)out.push({key:'focus',label:'Focus (min)',value:Math.round(input.focus),max:input.focusGoal});
 if(input.reviewsDone!==null&&input.reviewsDone+input.reviewsDue>0)out.push({key:'reviews',label:'Reviews',value:input.reviewsDone,max:input.reviewsDone+input.reviewsDue});
 if(input.practiceDone!==null&&input.practiceDone+input.practiceDue>0)out.push({key:'practice',label:'Practice',value:input.practiceDone,max:input.practiceDone+input.practiceDue});
 return out;
}

export type LooseEnd=
 |{kind:'block';id:string;title:string;meta:string;block:CalendarBlockRecord}
 |{kind:'task';id:string;title:string;meta:string;task:TaskRecord}
 |{kind:'thought';id:string;title:string;meta:string;thought:ParkedThought};
const clock=(instant:string,zone:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(instant));
/** Planned blocks of the day, tasks due that day and still open, and open thoughts. Everything else is settled. */
export function looseEnds(input:{date:string;zone:string;blocks:readonly CalendarBlockRecord[];tasks:readonly TaskRecord[];thoughts:readonly ParkedThought[]}):LooseEnd[]{
 const blocks=input.blocks.filter(block=>block.status==='planned'&&civilDay(block.startsAt,input.zone)===input.date)
  .sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
  .map((block):LooseEnd=>({kind:'block',id:block.id,title:block.title||'Time block',meta:clock(block.startsAt,input.zone)+'–'+clock(block.endsAt,input.zone),block}));
 const tasks=input.tasks.filter(task=>(task.status==='backlog'||task.status==='in_progress')&&dueDay(task,input.zone)===input.date)
  .map((task):LooseEnd=>({kind:'task',id:task.id,title:task.title,meta:'Due today',task}));
 const thoughts=input.thoughts.map((thought):LooseEnd=>({kind:'thought',id:thought.id,title:thought.text,meta:'Parked thought',thought}));
 return [...blocks,...tasks,...thoughts];
}
/** The next civil day as YYYY-MM-DD. */
export function nextDay(day:string):string{
 const [y,m,d]=day.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10);
}
/** A block's instants a whole day later. Wall-clock changes at a DST border are left to the study API's zone handling. */
export function blockTomorrow(block:Pick<CalendarBlockRecord,'startsAt'|'endsAt'>):{startsAt:string;endsAt:string}{
 const shift=(instant:string)=>new Date(Date.parse(instant)+86_400_000).toISOString();
 return {startsAt:shift(block.startsAt),endsAt:shift(block.endsAt)};
}
export const closeable=(status:string|undefined)=>status==='committed'||status==='previewed';
