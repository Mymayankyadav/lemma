// N60.1: side-effect-free validation and optimistic snapshot comparisons.
// The N46.2 SQL command must recheck source versions atomically under locks.
import {DayPlanError,type DayPlanStatus,type NewDayPlan,type NewDayPlanItem,
 type PlanAvailability,type PlanSourceResource,type PlanSourceVersion} from './contract';

const invalid=(message:string):never=>{throw new DayPlanError('invalid',message)};
const resourceNames:PlanSourceResource[]=['tasks','calendar_blocks','study_entries'];
const statuses:DayPlanStatus[]=['draft','previewed','committed','closed'];
const isObject=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const only=(x:Record<string,unknown>,keys:readonly string[]):void=>{
 if(Object.keys(x).some(k=>!keys.includes(k)))invalid('Unknown day-plan field');
};
const id=(value:unknown):string=>{
 if(typeof value!=='string'||!value.trim()||value.length>256)
  return invalid('Expected a non-empty owner-scoped resource ID');
 return value;
};
const sourceKey=(x:Pick<PlanSourceVersion,'resource'|'id'>):string=>
 x.resource+':'+x.id;

/** Strict YYYY-MM-DD civil date, independent of a viewer's timezone/DST. */
export function civilPlanDate(value:string):string {
 if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)||
  value.slice(0,4)==='0000')invalid('Expected a real YYYY-MM-DD plan date');
 const epoch=Date.parse(value+'T00:00:00Z');
 if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==value)
  invalid('Invalid calendar date');
 return value;
}
/** IANA time zones preserve the owner's plan date across travel and DST. */
export function planTimeZone(value:string):string {
 if(typeof value!=='string'||!value.trim()||value.length>80)
  invalid('Invalid day-plan timezone');
 try{new Intl.DateTimeFormat('en-US',{timeZone:value});}
 catch{return invalid('Unknown IANA day-plan timezone');}
 return value;
}
export function normalizeAvailability(value:PlanAvailability):PlanAvailability {
 if(!isObject(value))return invalid('Availability must be an object');
 only(value,['sources']);
 if(!Array.isArray(value.sources))invalid('Availability.sources must be an array');
 const seen=new Set<string>();
 const sources=value.sources.map((source:unknown):PlanSourceVersion=>{
  if(!isObject(source))return invalid('Invalid availability source');
  only(source,['resource','id','version']);
  if(!resourceNames.includes(source.resource as PlanSourceResource))
   invalid('Unknown availability resource');
  const resource=source.resource as PlanSourceResource;
  const keyId=id(source.id);
  if(typeof source.version!=='number'||!Number.isSafeInteger(source.version)||
   source.version<1||source.version>2147483647)
   return invalid('Availability version must be a positive int4');
  const key=sourceKey({resource,id:keyId});
  if(seen.has(key))invalid('Duplicate availability source');
  seen.add(key);
  return {resource,id:keyId,version:source.version};
 });
 return {sources};
}
export interface StalePlanSource extends PlanSourceVersion {
 currentVersion:number|null;
}
/** Advisory only. Server commit must recheck versions in one transaction. */
export function comparePlanSources(preview:PlanAvailability,current:PlanAvailability):
 {ok:boolean;stale:StalePlanSource[]} {
 const expected=normalizeAvailability(preview);
 const actual=normalizeAvailability(current);
 const found=new Map(actual.sources.map(s=>[sourceKey(s),s.version] as const));
 const stale=expected.sources.flatMap(s=>{
  const version=found.get(sourceKey(s))??null;
  return version===s.version?[]:[{...s,currentVersion:version}];
 });
 return {ok:stale.length===0,stale};
}
function jsonObject(value:unknown):Record<string,unknown> {
 if(!isObject(value))return invalid('Ritual must be a JSON object');
 let copy:unknown;
 try{copy=JSON.parse(JSON.stringify(value));}
 catch{return invalid('Ritual must be JSON-serializable');}
 if(!isObject(copy))return invalid('Ritual must be a JSON object');
 return copy;
}
export function normalizeDayPlan(input:NewDayPlan):Required<NewDayPlan> {
 if(!isObject(input))return invalid('Day-plan input must be an object');
 only(input,['planDate','timeZone','intention','capacityMinutes',
  'availability','tomorrowFirstTaskId','ritual']);
 const intention=input.intention??'';
 if(typeof intention!=='string'||intention.length>1200)
  invalid('Day-plan intention exceeds 1200 characters');
 const minutes=input.capacityMinutes??0;
 if(!Number.isInteger(minutes)||minutes<0||minutes>1440)
  invalid('Day-plan capacity must be 0–1440 whole minutes');
 const taskId=input.tomorrowFirstTaskId==null?null:id(input.tomorrowFirstTaskId);
 return {
  planDate:civilPlanDate(input.planDate),timeZone:planTimeZone(input.timeZone),
  intention,capacityMinutes:minutes,
  availability:normalizeAvailability(input.availability??{sources:[]}),
  tomorrowFirstTaskId:taskId,ritual:jsonObject(input.ritual??{}),
 };
}
/** Explicitly keep unplaced and carried-over tasks in the plan. */
export function normalizePlanItems(items:NewDayPlanItem[]):NewDayPlanItem[] {
 if(!Array.isArray(items))invalid('Plan items must be an array');
 const positions=new Set<number>();
 return items.map((item:unknown):NewDayPlanItem=>{
  if(!isObject(item))return invalid('Invalid plan item');
  only(item,['taskId','blockId','disposition','reason','position']);
  const taskId=id(item.taskId);
  const blockId=item.blockId==null?null:id(item.blockId);
  if(item.disposition!=='placed'&&item.disposition!=='unplaced'&&
   item.disposition!=='carried_over')return invalid('Unknown plan disposition');
  const disposition=item.disposition;
  if(typeof item.position!=='number'||!Number.isSafeInteger(item.position)||
   item.position<0||item.position>2147483647)
   return invalid('Plan item position must be a non-negative int4');
  if(positions.has(item.position))invalid('Duplicate plan position');
  positions.add(item.position);
  if(disposition!=='placed'&&blockId!==null)
   invalid('Unplaced or carried-over work cannot claim a calendar block');
  const reason=item.reason??null;
  if(reason!==null&&(typeof reason!=='string'||reason.length>1200))
   return invalid('Invalid plan disposition reason');
  if(disposition!=='placed'&&(!reason||!reason.trim()))
   invalid('Unplaced and carried-over work requires an explicit reason');
  return {taskId,blockId,disposition,reason,position:item.position};
 });
}
export function validatePlanClosure(status:DayPlanStatus,closedAt:string|null):void {
 if(!statuses.includes(status))invalid('Unknown plan status');
 if(status==='closed'){
  if(typeof closedAt!=='string'||
   !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(closedAt)||
   !Number.isFinite(Date.parse(closedAt)))
   return invalid('Closed plan requires a real timezone-aware closure instant');
  civilPlanDate(closedAt.slice(0,10));
 }else if(closedAt!==null)invalid('Non-closed plan cannot carry closedAt');
}

/** N108: normalize owner-selected carry-overs before an atomic close. */
export function normalizeDayCloseTransition(value:import('./contract').DayCloseTransition):{
 tomorrowFirstTaskId?:string|null;
 carryOver?:{taskId:string;reason:string}[];
} {
 if(!isObject(value))return invalid('Invalid day-close transition');
 only(value,['tomorrowFirstTaskId','carryOver']);
 return normalizeDayCloseFields(value);
}
function normalizeDayCloseFields(value:Record<string,unknown>){
 const result:{tomorrowFirstTaskId?:string|null;carryOver?:{taskId:string;reason:string}[]}={};
 if(Object.hasOwn(value,'tomorrowFirstTaskId'))result.tomorrowFirstTaskId=
  value.tomorrowFirstTaskId===null?null:id(value.tomorrowFirstTaskId);
 if(Object.hasOwn(value,'carryOver')){
  const choices=value.carryOver;
  if(!Array.isArray(choices)||choices.length>500)
   return invalid('Invalid carry-over list');
  const seen=new Set<string>();
  result.carryOver=choices.map((choice:unknown)=>{
   let taskId:string,reason:string;
   if(typeof choice==='string'){taskId=id(choice);reason='Carried over to tomorrow';}
   else if(isObject(choice)){
    only(choice,['taskId','reason']);
    taskId=id(choice.taskId);
    if(typeof choice.reason!=='string'||!choice.reason.trim()||choice.reason.length>1200)
     return invalid('Invalid carry-over reason');
    reason=choice.reason;
   }else return invalid('Invalid carry-over selection');
   if(seen.has(taskId))invalid('Duplicate carry-over task');
   seen.add(taskId);return {taskId,reason};
  });
 }
 return result;
}
