import { LemmaError } from '../api';
import type {AvailabilityWindow,DayAvailability,DayClosure,DayPlanItem,DayPlanPatch,
  DayPlanQuery,DayPlanRitual,DayPlanStatus,DaySourceVersion,NewDayPlan,NewDayPlanItem} from './contract';
const statuses:readonly DayPlanStatus[]=['draft','previewed','committed','closed'];
const dispositions=['placed','unplaced','carried_over'] as const;
export const invalid=(message:string):never=>{throw new LemmaError('invalid',message)};
export function date(value:string):string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('Invalid civil date');
 const [y,m,d]=value.split('-').map(Number),check=new Date(Date.UTC(y,m-1,d));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==m||check.getUTCDate()!==d)
  invalid('Invalid civil date');
 return value;
}
export function zone(value:string):string {
 if(typeof value!=='string'||value.length>100||!value)invalid('Time zone required');
 try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date(0))}
 catch{invalid('Invalid IANA time zone')}
 return value;
}
export function instant(v:string):string {
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v)||
   !/(Z|[+-]\d\d:\d\d)$/i.test(v)||!Number.isFinite(Date.parse(v)))
  invalid('Invalid ISO instant');
 return v;
}
export function version(v:number):number {
 if(!Number.isSafeInteger(v)||v<1)invalid('Expected version must be positive');return v;
}
export function id(value:string):string {
 if(typeof value!=='string'||!value.trim()||value.length>160)invalid('Invalid record ID');
 return value;
}
export function minutes(v:number):number {
 if(!Number.isSafeInteger(v)||v<0||v>1440)invalid('Capacity must be 0..1440 minutes');
 return v;
}
function position(v:number):number {
 if(!Number.isSafeInteger(v)||v<0||v>2147483647)invalid('Invalid placement position');return v;
}
export function availability(v:DayAvailability):DayAvailability {
 if(!v||typeof v!=='object'||Array.isArray(v)||
   Object.keys(v).some(k=>!['windows','sources'].includes(k))||
   !Array.isArray(v.windows)||!Array.isArray(v.sources)||v.windows.length>48||v.sources.length>200)
  invalid('Invalid availability snapshot');
 const windows=v.windows.map((w:AvailabilityWindow)=>{
  if(!w||Object.keys(w).some(k=>!['start','end'].includes(k)))invalid('Invalid availability window');
  const start=instant(w.start),end=instant(w.end);
  if(Date.parse(end)<=Date.parse(start))invalid('Availability window must end after start');
  return {start,end};
 });
 const sources=v.sources.map((s:DaySourceVersion)=>{
  if(!s||Object.keys(s).some(k=>!['kind','id','version'].includes(k))||
    !['task','calendar_block'].includes(s.kind))invalid('Invalid availability source');
  return {kind:s.kind,id:id(s.id),version:version(s.version)};
 });
 if(new Set(sources.map(x=>x.kind+':'+x.id)).size!==sources.length)
  invalid('Repeated source version in preview');
 return {windows,sources};
}
export function ritual(v:DayPlanRitual):DayPlanRitual {
 if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['choice','completedSteps','reflection'].includes(k))||
   !Array.isArray(v.completedSteps)||v.completedSteps.length>24)invalid('Invalid day ritual');
 for(const key of ['choice','reflection'] as const)
  if(v[key]!==null&&(typeof v[key]!=='string'||v[key]!.length>1000))invalid('Invalid ritual '+key);
 if(v.completedSteps.some(x=>typeof x!=='string'||!x.trim()||x.length>120))
  invalid('Invalid ritual steps');
 return {choice:v.choice,completedSteps:[...v.completedSteps],reflection:v.reflection};
}
export const emptyRitual=():DayPlanRitual=>({choice:null,completedSteps:[],reflection:null});
export function items(input:NewDayPlanItem[]):NewDayPlanItem[] {
 if(!Array.isArray(input)||input.length>100)invalid('Day plan has too many items');
 const seen=new Set<string>(),positions=new Set<number>();
 return input.map(item=>{
  if(!item||typeof item!=='object'||Object.keys(item).some(k=>
    !['taskId','calendarBlockId','disposition','reason','position'].includes(k))||
    !dispositions.includes(item.disposition))invalid('Invalid placement');
  const taskId=id(item.taskId),block=item.calendarBlockId===null?null:id(item.calendarBlockId);
  const where=position(item.position);
  if(item.reason!==null&&(typeof item.reason!=='string'||item.reason.length>1000))
    invalid('Invalid unplaced reason');
  if(item.disposition==='placed'&&!block)invalid('Placed task requires a calendar block');
  if(item.disposition!=='placed'&&block)invalid('Unplaced task cannot claim a block');
  if(seen.has(taskId)||positions.has(where))invalid('Repeated task or position in day plan');
  seen.add(taskId);positions.add(where);
  return {taskId,calendarBlockId:block,disposition:item.disposition,reason:item.reason,position:where};
 });
}
export function newPlan(input:NewDayPlan):NewDayPlan {
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).some(k=>!['planDate','timeZone','intention','capacityMinutes','availability','items','ritual'].includes(k)))
  invalid('Unknown day plan field');
 if(typeof input.intention!=='string'||input.intention.length>2000)invalid('Invalid intention');
 return {planDate:date(input.planDate),timeZone:zone(input.timeZone),intention:input.intention,
  capacityMinutes:minutes(input.capacityMinutes),availability:availability(input.availability),
  items:items(input.items??[]),ritual:ritual(input.ritual??emptyRitual())};
}
export function patch(input:DayPlanPatch):DayPlanPatch {
 if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).some(k=>!['intention','capacityMinutes','availability','items','ritual','status'].includes(k)))
  invalid('Unknown or immutable day plan field');
 const out:DayPlanPatch={};
 if(input.intention!==undefined){if(typeof input.intention!=='string'||input.intention.length>2000)invalid('Invalid intention');out.intention=input.intention}
 if(input.capacityMinutes!==undefined)out.capacityMinutes=minutes(input.capacityMinutes);
 if(input.availability!==undefined)out.availability=availability(input.availability);
 if(input.items!==undefined)out.items=items(input.items);
 if(input.ritual!==undefined)out.ritual=ritual(input.ritual);
 if(input.status!==undefined){if(!['draft','previewed'].includes(input.status))invalid('Invalid draft status');out.status=input.status}
 if(!Object.keys(out).length)invalid('Day plan update is empty');
 return out;
}
export function closure(v:DayClosure):DayClosure {
 if(!v||typeof v!=='object'||Array.isArray(v)||
  Object.keys(v).some(k=>!['tomorrowFirstTaskId','ritual'].includes(k)))
  invalid('Invalid day closure');
 return {
  ...(v.tomorrowFirstTaskId!==undefined?{tomorrowFirstTaskId:v.tomorrowFirstTaskId===null?null:id(v.tomorrowFirstTaskId)}:{}),
  ...(v.ritual!==undefined?{ritual:ritual(v.ritual)}:{})
 };
}
export interface QueryOptions {fromDate:string|null;toDate:string|null;status:DayPlanStatus|'all';limit:number}
export function query(input:DayPlanQuery={}):QueryOptions {
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).some(k=>!['fromDate','toDate','status','limit','cursor'].includes(k)))
  invalid('Invalid day plan query');
 const fromDate=input.fromDate===undefined?null:date(input.fromDate);
 const toDate=input.toDate===undefined?null:date(input.toDate);
 if(fromDate&&toDate&&fromDate>toDate)invalid('Day plan range inverted');
 const status=input.status??'all';
 if(status!=='all'&&!statuses.includes(status))invalid('Invalid day plan status');
 const limit=input.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)invalid('Page size must be 1..50');
 return {fromDate,toDate,status,limit};
}
type Cursor={v:1;f:string|null;t:string|null;s:string;date:string;id:string};
export function encodeCursor(record:{planDate:string;id:string},opts:QueryOptions):string{
 return btoa(JSON.stringify({v:1,f:opts.fromDate,t:opts.toDate,s:opts.status,date:record.planDate,id:record.id}))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeCursor(raw:string|null|undefined,opts:QueryOptions):{date:string;id:string}|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||raw.length>900||raw.length<5||!/^[A-Za-z0-9_-]+$/.test(raw))
   invalid('Invalid day plan cursor');
  const value:Cursor=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4)));
  if(value.v!==1||value.f!==opts.fromDate||value.t!==opts.toDate||value.s!==opts.status)
   invalid('Mismatched day plan cursor');
  return {date:date(value.date),id:id(value.id)};
 }catch{return invalid('Invalid or mismatched day plan cursor')}
}
export function order(a:{planDate:string;id:string},b:{planDate:string;id:string}):number {
 return a.planDate.localeCompare(b.planDate)||a.id.localeCompare(b.id);
}
export function validatePersisted(row:unknown):row is {id:string;planDate:string;status:DayPlanStatus;version:number;items:DayPlanItem[];availability:DayAvailability}{
 if(!row||typeof row!=='object')return false;
 try{
  const p=row as import('./contract').DayPlanRecord;
  id(p.id);date(p.planDate);zone(p.timeZone);minutes(p.capacityMinutes);
  if(!statuses.includes(p.status)||!Number.isSafeInteger(p.version)||p.version<1||
    typeof p.intention!=='string'||p.intention.length>2000||
    typeof p.createdAt!=='string'||!Number.isFinite(Date.parse(p.createdAt))||
    typeof p.updatedAt!=='string'||!Number.isFinite(Date.parse(p.updatedAt))||
    (p.closedAt!==null&&(typeof p.closedAt!=='string'||!Number.isFinite(Date.parse(p.closedAt))))||
    (p.status==='closed')!==(p.closedAt!==null)||
    (p.tomorrowFirstTaskId!==null&&(typeof p.tomorrowFirstTaskId!=='string'||!p.tomorrowFirstTaskId))||
    !['app','mcp','worker'].includes(p.source))return false;
  availability(p.availability);ritual(p.ritual);
  items(p.items.map(x=>({taskId:x.taskId,calendarBlockId:x.calendarBlockId,
   disposition:x.disposition,reason:x.reason,position:x.position})));
  if(p.items.some(x=>typeof x.id!=='string'||!x.id||x.planId!==p.id))return false;
  return true;
 }catch{return false}
}
