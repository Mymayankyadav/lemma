import type {CalendarBlockKind,NewCalendarBlock} from '../../../data/study/contract';
import {instantInZone,suggestedBlockStart,zonedInput} from '../block-sheet/BlockSheet';

/** PLAN §6.6 quick-add: a title, a length, Study or Busy, and an optional path. */
export const QUICK_LENGTHS=[25,50,90] as const;
export const DEFAULT_LENGTH=50;
/** The instant the block starts: the tapped slot when valid, else the next half hour. */
export function quickStart(date:string,zone:string,requested?:string|null,now:Date=new Date()):string{
 if(requested&&Number.isFinite(Date.parse(requested))&&/Z$|[+-]\d\d:\d\d$/.test(requested))return new Date(requested).toISOString();
 return instantInZone(suggestedBlockStart(date,zone,now),zone)??new Date(now).toISOString();
}
/** A positive whole number of minutes from the `len` param; anything else is ignored. */
export function lengthFromParam(value:string|null):number|null{
 if(!value||!/^\d{1,3}$/.test(value))return null;
 const minutes=Number(value);
 return minutes>=5&&minutes<=600?minutes:null;
}
export function quickInput(values:{title:string;kind:CalendarBlockKind;startsAt:string;minutes:number;zone:string;projectId?:string|null;taskId?:string|null}):NewCalendarBlock{
 const title=values.title.trim();
 if(!title)throw new Error('Give the block a title.');
 if(title.length>200)throw new Error('Keep the title to 200 characters.');
 if(!Number.isFinite(values.minutes)||values.minutes<5)throw new Error('Choose a length of at least 5 minutes.');
 const endsAt=new Date(Date.parse(values.startsAt)+values.minutes*60_000).toISOString();
 return {title,kind:values.kind,startsAt:new Date(values.startsAt).toISOString(),endsAt,timeZone:values.zone,
  ...(values.projectId?{projectId:values.projectId}:{}),...(values.taskId?{taskId:values.taskId}:{})};
}
export const startLabel=(startsAt:string,zone:string)=>zonedInput(startsAt,zone).slice(11,16);
export const suggestionLabel=(count:number)=>count===1?'1 suggested block':count+' suggested blocks';
