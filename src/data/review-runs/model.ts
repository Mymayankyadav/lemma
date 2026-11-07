// N62.1: pure, owner-independent validation and transition guards.
// These are advisory; N48.2's command must recheck under owner RLS + row locks.
import {ReviewRunError,type NewReviewRun,type ReviewRunAdvance,
 type ReviewRunItemRecord,type ReviewRunQuery,type ReviewRunRecord,
 type ReviewRunStatus} from './contract';

const statuses:readonly ReviewRunStatus[]=['running','paused','exhausted','completed','abandoned'];
const terminal:readonly ReviewRunStatus[]=['exhausted','completed','abandoned'];
const forbidden=new Set(['userId','user_id','owner','ownerId','owner_id','p_user']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const instant=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/;
const fail=(message:string):never=>{throw new ReviewRunError('invalid',message)};
const object=(value:unknown):value is Record<string,unknown>=>
 value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const integer=(value:unknown,min:number,max:number):value is number=>
 typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const ownKeys=(value:Record<string,unknown>,names:readonly string[])=>{
 for(const k of Object.keys(value))
  if(forbidden.has(k)||!names.includes(k))fail('Unexpected or owner-controlled field: '+k);
};
export function assertReviewUuid(value:unknown):string {
 if(typeof value!=='string'||!uuid.test(value))return fail('Expected UUID');
 return value;
}
export function assertReviewVersion(value:unknown):number{
 if(!integer(value,1,2147483647))return fail('Version must be a positive int32');
 return value;
}
/** Rejects civil date rollover, timezone-naive values, infinities and special SQL instants. */
export function assertReviewInstant(value:unknown):string{
 if(typeof value!=='string'||!instant.test(value))return fail('Expected an explicit-offset ISO instant');
 const civil=value.slice(0,10),d=new Date(civil+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==civil||
  !Number.isFinite(Date.parse(value)))return fail('Invalid calendar instant');
 return value;
}
function safeJson(value:unknown,depth=0):boolean{
 if(depth>12)return false;
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(Array.isArray(value))return value.length<=2048&&value.every(v=>safeJson(v,depth+1));
 if(!object(value))return false;
 const keys=Object.keys(value);
 return keys.length<=256&&keys.every(k=>!forbidden.has(k)&&
  k!=='__proto__'&&k!=='constructor'&&k!=='prototype'&&safeJson(value[k],depth+1));
}
export function validateReviewRunDraft(input:NewReviewRun):Required<NewReviewRun>{
 if(!object(input))return fail('Review run input must be an object');
 ownKeys(input,['filters','selectedDeckIds','cardBudget','minuteBudget','schedulerVersion','settingsVersion']);
 const filters=input.filters??{};
 if(!object(filters)||!safeJson(filters))return fail('Filters must be owner-independent JSON object');
 let filtersJson:string;
 try{filtersJson=JSON.stringify(filters)}catch{return fail('Filters must be serializable')}
 if(new TextEncoder().encode(filtersJson).length>8192)return fail('Filters exceed 8192 bytes');
 const selectedDeckIds=input.selectedDeckIds??[];
 if(!Array.isArray(selectedDeckIds)||selectedDeckIds.length>256||
  selectedDeckIds.some(k=>typeof k!=='string'||!k.trim()||k.length>180))
  return fail('Invalid selected deck identifiers');
 // Stable deck IDs are application keys such as project:<slug>, not UUIDs.
 if(new Set(selectedDeckIds).size!==selectedDeckIds.length)
  return fail('Duplicate selected deck key');
 const cardBudget=input.cardBudget??20,minuteBudget=input.minuteBudget??20;
 if(!integer(cardBudget,0,2000)||!integer(minuteBudget,0,1440))
  return fail('Review run budgets out of bounds');
 if(typeof input.schedulerVersion!=='string'||!input.schedulerVersion.trim()||
  input.schedulerVersion.length>80)return fail('Scheduler version is required');
 const settingsVersion=assertReviewVersion(input.settingsVersion);
 return {
  filters:JSON.parse(filtersJson) as Record<string,unknown>,
  selectedDeckIds:[...selectedDeckIds],
  cardBudget,minuteBudget,
  schedulerVersion:input.schedulerVersion,settingsVersion,
 };
}
export function validateReviewRunRecord(run:ReviewRunRecord):ReviewRunRecord{
 if(!object(run))return fail('Run must be an object');
 assertReviewUuid(run.id);assertReviewVersion(run.version);
 if(!statuses.includes(run.status))return fail('Unknown run status');
 if(!integer(run.position,0,2147483647))return fail('Invalid run position');
 if(typeof run.revealed!=='boolean')return fail('Reveal state must be boolean');
 assertReviewInstant(run.startedAt);assertReviewInstant(run.createdAt);
 assertReviewInstant(run.updatedAt);
 if(run.pausedAt!==null)assertReviewInstant(run.pausedAt);
 if(run.endedAt!==null)assertReviewInstant(run.endedAt);
 if((run.status==='paused')!==(run.pausedAt!==null))
  return fail('Pause status must agree with pausedAt');
 if(terminal.includes(run.status)!==(run.endedAt!==null))
  return fail('Terminal status must agree with endedAt');
 if(run.pausedAt!==null&&Date.parse(run.pausedAt)<Date.parse(run.startedAt))
  return fail('Pause predates start');
 if(run.endedAt!==null&&Date.parse(run.endedAt)<Date.parse(run.startedAt))
  return fail('End predates start');
 if(!['app','mcp','worker'].includes(run.source))return fail('Unknown run provenance');
 validateReviewRunDraft({
  filters:run.filters,selectedDeckIds:run.selectedDeckIds,cardBudget:run.cardBudget,
  minuteBudget:run.minuteBudget,schedulerVersion:run.schedulerVersion,
  settingsVersion:run.settingsVersion,
 });
 return run;
}
export function validateReviewRunItem(item:ReviewRunItemRecord):ReviewRunItemRecord{
 if(!object(item))return fail('Run item must be an object');
 assertReviewUuid(item.id);assertReviewUuid(item.runId);assertReviewUuid(item.cardId);
 assertReviewVersion(item.version);assertReviewVersion(item.expectedCardVersion);
 if(!integer(item.position,0,2147483647))return fail('Invalid item position');
 if(!['pending','graded','stale'].includes(item.state))return fail('Invalid item state');
 if((item.state==='graded')!==(item.reviewId!==null))
  return fail('Only graded items may reference a review');
 if((item.state==='stale')!==(item.staleReason!==null))
  return fail('Only stale items carry a reason');
 if(item.reviewId!==null&&(typeof item.reviewId!=='string'||
  !/^[1-9]\d{0,18}$/.test(item.reviewId)||
  BigInt(item.reviewId)>9223372036854775807n))
  return fail('Review receipt is not a positive bigint');
 if(item.staleReason!==null&&(!item.staleReason.trim()||item.staleReason.length>200))
  return fail('Invalid staleness reason');
 assertReviewInstant(item.createdAt);assertReviewInstant(item.updatedAt);
 if(!['app','mcp','worker'].includes(item.source))return fail('Unknown item provenance');
 return item;
}
/** Ensures no duplicate grade, no replay of skipped items, and no cross-run item. */
export function canAdvanceReviewRun(run:ReviewRunRecord,item:ReviewRunItemRecord):boolean{
 validateReviewRunRecord(run);validateReviewRunItem(item);
 return run.status==='running'&&item.runId===run.id&&
  item.position===run.position&&item.state==='pending';
}
export function assertReviewAdvance(input:ReviewRunAdvance):ReviewRunAdvance{
 if(!object(input))return fail('Advance input must be an object');
 if(input.kind==='graded'){
  ownKeys(input,['kind','itemId','reviewId']);
  assertReviewUuid(input.itemId);
  if(typeof input.reviewId!=='string'||!/^[1-9]\d{0,18}$/.test(input.reviewId)||
   BigInt(input.reviewId)>9223372036854775807n)
   return fail('Advance needs an existing positive review receipt ID');
  return {...input};
 }
 if(input.kind==='stale'){
  ownKeys(input,['kind','itemId','reason']);
  assertReviewUuid(input.itemId);
  if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>200)
   return fail('Stale skip requires a short reason');
  return {...input,reason:input.reason.trim()};
 }
 return fail('Invalid advance kind');
}
export function canTransitionReviewRun(from:ReviewRunStatus,to:ReviewRunStatus):boolean{
 if(!statuses.includes(from)||!statuses.includes(to)||from===to)return false;
 return from==='running'?['paused','exhausted','completed','abandoned'].includes(to):
  from==='paused'?['running','abandoned'].includes(to):false;
}
type Cursor={v:1;status:string;createdAt:string;id:string};
export function validateReviewRunQuery(query:ReviewRunQuery={}):{
 status:ReviewRunStatus[];limit:number;cursor:Pick<Cursor,'createdAt'|'id'>|null
}{
 if(!object(query))return fail('Review run query must be an object');
 ownKeys(query,['status','limit','cursor']);
 const requested=query.status??[...statuses];
 if(!Array.isArray(requested)||requested.some(x=>!statuses.includes(x))||
  new Set(requested).size!==requested.length)return fail('Invalid run status filter');
 const selected=statuses.filter(x=>requested.includes(x));
 const limit=query.limit??20;
 if(!integer(limit,1,50))return fail('Review run page size must be 1–50');
 let cursor:null|Pick<Cursor,'createdAt'|'id'>=null;
 if(query.cursor!==undefined&&query.cursor!==null){
  try{
   const raw=query.cursor;
   if(typeof raw!=='string'||raw.length>1024||raw.length<8||
    !/^[A-Za-z0-9_-]+$/.test(raw))return fail('Invalid review cursor');
   const data:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-raw.length%4)%4)));
   if(!object(data)||data.v!==1||data.status!==selected.join(','))
    return fail('Cursor does not match run filter');
   const createdAt=assertReviewInstant(data.createdAt),id=assertReviewUuid(data.id);
   cursor={createdAt,id};
  }catch{return fail('Invalid review cursor')}
 }
 return {status:[...selected],limit,cursor};
}
export function encodeReviewRunCursor(run:Pick<ReviewRunRecord,'createdAt'|'id'>,
 selected:readonly ReviewRunStatus[]):string{
 assertReviewInstant(run.createdAt);assertReviewUuid(run.id);
 if(selected.some(s=>!statuses.includes(s))||new Set(selected).size!==selected.length)
  return fail('Invalid cursor status signature');
 const signature=statuses.filter(s=>selected.includes(s)).join(',');
 return btoa(JSON.stringify({v:1,status:signature,createdAt:run.createdAt,id:run.id}))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
