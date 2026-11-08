// N107: immutable, strictly validated atomic placement requests.
// Browser checks are advisory. The database command must lock/recheck every
// source version before any blocks, day plans or plan items are written.
import {DayPlanError} from './contract';
import {civilPlanDate,planTimeZone} from './model';

export type PlacementSourceResource='tasks'|'calendar_blocks'|'study_entries';
export interface PlacementSourceVersion {
 resource:PlacementSourceResource;id:string;version:number;
}
export interface AtomicPlacement {
 taskId:string;title:string;startsAt:string;endsAt:string;position:number;
}
export interface AtomicUnplaced {
 taskId:string;reason:string;position:number;
}
export interface AtomicPlacementDay {
 planDate:string;timeZone:string;planId?:string;expectedVersion?:number;
 intention?:string;capacityMinutes?:number;
 sources:PlacementSourceVersion[];
 placements:AtomicPlacement[];
 unplaced?:AtomicUnplaced[];
}
export interface CommitPlacementsInput {
 days:AtomicPlacementDay[];
 /** Reuse this exact identifier on network retries; never synthesize it in SQL. */
 operationId?:string;
}

const fail=(message:string):never=>{throw new DayPlanError('invalid',message)};
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const fields=(x:Record<string,unknown>,allowed:string[]):void=>{
 for(const key of Object.keys(x))if(!allowed.includes(key))
  fail('Unknown placement field: '+key);
};
const ident=(x:unknown):string=>{
 if(typeof x!=='string'||!x.trim()||x.length>256)
  return fail('Placement resource ID required');
 return x;
};
const version=(x:unknown):number=>{
 if(typeof x!=='number'||!Number.isSafeInteger(x)||x<1||x>2147483647)
  return fail('Placement version must be a positive int4');
 return x;
};
const ordinal=(x:unknown):number=>{
 if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0||x>2147483647)
  return fail('Placement position must be a non-negative int4');
 return x;
};
const instant=(x:unknown):string=>{
 if(typeof x!=='string'||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i.test(x)||
  !Number.isFinite(Date.parse(x)))return fail('Placement requires an absolute ISO instant');
 return new Date(x).toISOString();
};
const localDate=(utc:string,zone:string):string=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',
  month:'2-digit',day:'2-digit'}).formatToParts(new Date(utc));
 const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';
 return get('year')+'-'+get('month')+'-'+get('day');
};

/** No mutations, no invented versions and no partial accepted days. */
export function normalizeCommitPlacements(raw:CommitPlacementsInput):CommitPlacementsInput {
 if(!obj(raw))return fail('Atomic placement request must be an object');
 fields(raw,['days','operationId']);
 if(raw.operationId!==undefined&&
  (typeof raw.operationId!=='string'||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.operationId)))
  fail('Invalid atomic placement operationId');
 if(!Array.isArray(raw.days)||raw.days.length<1||raw.days.length>31)
  return fail('Atomic placement request needs 1–31 days');
 const dates=new Set<string>();
 const days=raw.days.map((value:unknown):AtomicPlacementDay=>{
  if(!obj(value))return fail('Invalid placement day');
  fields(value,['planDate','timeZone','planId','expectedVersion',
   'intention','capacityMinutes','sources','placements','unplaced']);
  const planDate=civilPlanDate(value.planDate as string);
  const timeZone=planTimeZone(value.timeZone as string);
  if(dates.has(planDate))fail('Duplicate atomic placement day');
  dates.add(planDate);
  if((value.planId===undefined)!==(value.expectedVersion===undefined))
   fail('Existing day plan needs both ID and version');
  const planId=value.planId===undefined?undefined:ident(value.planId);
  const expectedVersion=value.expectedVersion===undefined?undefined:
   version(value.expectedVersion);
  const intention:string=value.intention===undefined?'':
   typeof value.intention==='string'&&value.intention.length<=1200?
    value.intention:fail('Invalid plan intention');
  const candidateCapacity=value.capacityMinutes;
  const capacityMinutes:number=candidateCapacity===undefined?0:
   typeof candidateCapacity==='number'&&Number.isSafeInteger(candidateCapacity)&&
   candidateCapacity>=0&&candidateCapacity<=1440?
    candidateCapacity:fail('Invalid plan capacity');
  if(!Array.isArray(value.sources)||value.sources.length>2000)
   return fail('Atomic placement sources must be a bounded list');
  const keys=new Set<string>();
  const sources=value.sources.map((s:unknown):PlacementSourceVersion=>{
   if(!obj(s))return fail('Invalid placement source');
   fields(s,['resource','id','version']);
   if(!['tasks','calendar_blocks','study_entries'].includes(String(s.resource)))
    return fail('Unknown placement source kind');
   const resource=s.resource as PlacementSourceResource;
   const id=ident(s.id),key=resource+':'+id;
   if(keys.has(key))fail('Duplicate placement source version');
   keys.add(key);
   return {resource,id,version:version(s.version)};
  });
  if(!Array.isArray(value.placements)||value.placements.length>500)
   return fail('Atomic placements must be a bounded list');
  const positions=new Set<number>(),spans:{start:number;end:number}[]=[];
  const placements=value.placements.map((p:unknown):AtomicPlacement=>{
   if(!obj(p))return fail('Invalid placement');
   fields(p,['taskId','title','startsAt','endsAt','position']);
   const taskId=ident(p.taskId),position=ordinal(p.position);
   if(!keys.has('tasks:'+taskId))
    fail('Placement task is missing its preview version');
   if(positions.has(position))fail('Duplicate plan item position');
   positions.add(position);
   const title:string=typeof p.title==='string'&&p.title.trim()&&p.title.length<=500?
    p.title:fail('Placement block needs a title');
   const startsAt=instant(p.startsAt),endsAt=instant(p.endsAt);
   const start=Date.parse(startsAt),end=Date.parse(endsAt);
   if(end<=start||end-start>24*3600000)
    fail('Invalid planned block interval');
   if(localDate(startsAt,timeZone)!==planDate)
    fail('Placement start falls outside its owner plan date');
   if(spans.some(s=>start<s.end&&end>s.start))
    fail('New placements overlap');
   spans.push({start,end});
   return {taskId,title,startsAt,endsAt,position};
  });
  const unplacedInput:unknown[]=value.unplaced===undefined?[]:
   Array.isArray(value.unplaced)?value.unplaced:
    fail('Unplaced items must be an array');
  if(unplacedInput.length>500)fail('Too many unplaced items');
  const unplaced=unplacedInput.map((u:unknown):AtomicUnplaced=>{
   if(!obj(u))return fail('Invalid unplaced item');
   fields(u,['taskId','reason','position']);
   const taskId=ident(u.taskId),position=ordinal(u.position);
   if(!keys.has('tasks:'+taskId))fail('Unplaced task missing preview version');
   if(positions.has(position))fail('Duplicate plan item position');
   positions.add(position);
   const reason:string=typeof u.reason==='string'&&u.reason.trim()&&
    u.reason.length<=1200?u.reason:fail('Unplaced task requires a reason');
   return {taskId,reason,position};
  });
  return {planDate,timeZone,...(planId?{planId,expectedVersion}:{}),
   intention,capacityMinutes,sources,placements,unplaced};
 });
 return {days,...(raw.operationId?{operationId:raw.operationId}:{})};
}
