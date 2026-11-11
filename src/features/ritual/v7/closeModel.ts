import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import type {TaskRecord} from '../../../data/tasks/contract';
import type {ParkedThought} from '../../../data/parked-thoughts';
import {civilDay,dueDay} from '../../tasks/v7/tasksModel';
import {localClockInstant,localWallParts} from '../../time-log/local-time';
import type {DayPlanApi,DayPlanRecord} from '../../../data/day-plans';
import {canCloseOwnerDay,normalizeCarryOverChoices} from '../model';

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
/** Preserve owner-local wall times across 23/25-hour days. Reject a DST gap. */
export function blockTomorrow(block:Pick<CalendarBlockRecord,'startsAt'|'endsAt'>,zone='UTC'):{startsAt:string;endsAt:string}{
 const shift=(instant:string)=>{const wall=localWallParts(instant,zone),next=localClockInstant(nextDay(wall.day),wall.clock,zone);if(!next)throw Error('That local time does not exist tomorrow. Choose another time in Calendar.');return next;};
 return {startsAt:shift(block.startsAt),endsAt:shift(block.endsAt)};
}
export const closeable=(status:string|undefined)=>status==='committed'||status==='previewed';

/** Close an unplanned day through the same durable lifecycle as a planned day.
 * A ritual-only draft is recoverable after any interrupted request; ordinary
 * drafts still require explicit plan confirmation. */
export async function closeDayRecord(api:DayPlanApi,input:{plan:DayPlanRecord|null;date:string;zone:string;aim:string;first:string;taskIds:string[]},onProgress:(plan:DayPlanRecord)=>void=()=>{}){
 if(!canCloseOwnerDay(input.date,new Date(),input.zone))throw Error('You can close a day once it has started.');
 let plan=input.plan;
 if(!plan)plan=(await api.createPlan({planDate:input.date,timeZone:input.zone,ritual:{v7RitualOnly:true}})).record;
 onProgress(plan);
 if(plan.status==='closed')return plan;
 if(plan.status==='draft'&&plan.ritual.v7RitualOnly===true){plan=(await api.previewPlan(plan.id,plan.version,[],{sources:[]})).record;onProgress(plan);}
 if(plan.status==='previewed'){plan=(await api.commitPlan(plan.id,plan.version)).record;onProgress(plan);}
 if(plan.status!=='committed')throw Error('Confirm the day plan before closing.');
 const choice=normalizeCarryOverChoices(input.taskIds,new Set(),input.first);
 return (await api.closePlan(plan.id,plan.version,{...plan.ritual,...choice,tomorrowAim:input.aim.trim()||null},{tomorrowFirstTaskId:choice.tomorrowFirstTaskId})).record;
}
