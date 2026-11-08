// N60.2: owner-RLS day-plan adapter. Writes only through one journalled RPC.
import {DayPlanError,type DayPlanApi,type DayPlanItem,type DayPlanPatch,
 type DayPlanQuery,type DayPlanRecord,type DayPlanStatus,type AtomicPlacementResult,type NewDayPlan,
 type NewDayPlanItem,type PlanAvailability} from './contract';
import {normalizeCommitPlacements,type CommitPlacementsInput} from './placements';
import {civilPlanDate,normalizeAvailability,normalizeDayPlan,
 normalizePlanItems,planTimeZone,validatePlanClosure} from './model';

type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Changed={resource?:string;id:string;version:number};
type Receipt={status?:string;operationId?:string;actionNo?:number|null;
 changed?:Changed[];conflict?:{currentVersion?:number};plan?:Row};
type Operation='create'|'update'|'preview'|'commit'|'close'|'reopen';
type Envelope={schemaVersion:1;resource:'day_plans';operation:Operation;
 operationId:string;patch:Row;target?:{id:string};expectedVersion?:number};
type PlanCursor={v:1;signature:string;date:string;id:string};
type ItemCursor={v:1;planId:string;position:number;id:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i;
const statuses:DayPlanStatus[]=['draft','previewed','committed','closed'];
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new DayPlanError(code,message);
};
const unavailable=(message:string):never=>{
 throw Error('Live day plans: '+message);
};
const clone=<T>(value:T):T=>structuredClone(value);
async function client(){return (await import('../live/client')).liveClient()}
function id(value:unknown):string{
 if(typeof value!=='string'||!UUID.test(value))
  return fail('invalid','Expected a day-plan UUID');
 return value.toLowerCase();
}
function version(value:unknown):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||
  value<1||value>2147483647)
  return fail('invalid','Expected positive int4 version');
 return value;
}
function timestamp(value:unknown):string{
 if(typeof value!=='string'||!ISO.test(value)||!Number.isFinite(Date.parse(value)))
  return unavailable('Invalid owner timestamp');
 return new Date(value).toISOString();
}
function record(row:Row):DayPlanRecord{
 if(!row||typeof row!=='object'||Array.isArray(row))
  return unavailable('Invalid owner plan row');
 const status=row.status as DayPlanStatus;
 if(!statuses.includes(status))return unavailable('Unexpected owner plan status');
 const plan:DayPlanRecord={
  id:id(row.id),planDate:civilPlanDate(String(row.plan_date)),
  timeZone:planTimeZone(String(row.time_zone)),
  intention:String(row.intention),capacityMinutes:Number(row.capacity_minutes),
  availability:normalizeAvailability(row.availability as PlanAvailability),
  status,closedAt:row.closed_at==null?null:timestamp(row.closed_at),
  tomorrowFirstTaskId:row.tomorrow_first_task_id==null?
   null:id(row.tomorrow_first_task_id),
  ritual:row.ritual as Record<string,unknown>,
  version:version(row.version),
  createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at),
 };
 if(!Number.isSafeInteger(plan.capacityMinutes)||plan.capacityMinutes<0||
  plan.capacityMinutes>1440||plan.intention.length>1200||
  !plan.ritual||typeof plan.ritual!=='object'||Array.isArray(plan.ritual))
  return unavailable('Invalid owner plan values');
 validatePlanClosure(plan.status,plan.closedAt);
 return plan;
}
function item(row:Row):DayPlanItem{
 if(!row||typeof row!=='object'||Array.isArray(row))
  return unavailable('Invalid plan item row');
 const disposition=row.disposition;
 if(disposition!=='placed'&&disposition!=='unplaced'&&
  disposition!=='carried_over')return unavailable('Unknown item disposition');
 const value:DayPlanItem={
  id:id(row.id),planId:id(row.plan_id),taskId:id(row.task_id),
  blockId:row.calendar_block_id==null?null:id(row.calendar_block_id),
  disposition,reason:row.reason==null?null:String(row.reason),
  position:Number(row.position),version:version(row.version),
 };
 if(!Number.isSafeInteger(value.position)||value.position<0||
  (value.disposition!=='placed'&&
   (value.blockId!==null||!value.reason?.trim())))
  return unavailable('Invalid plan item values');
 return value;
}
function secureId():string{
 const c=globalThis.crypto;
 if(typeof c?.randomUUID==='function')return c.randomUUID();
 if(!c?.getRandomValues)return unavailable('Secure operationId unavailable');
 const bytes=c.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const s=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
function errorOf(e:SqlError):Error{
 const message=e.message??'Day-plan owner command failed';
 if(['PGRST202','42883'].includes(e.code??'')||
   /function .* not found|undefined function/i.test(message))
  return Error('Live day plans: N46.2 RPC is not deployed');
 if(e.code==='23505'||/version|duplicate|stale|conflict|reused|already exists/i.test(message))
  return new DayPlanError('conflict',message);
 if(/not found for owner|not found/i.test(message))
  return new DayPlanError('not_found',message);
 if(['23503','23514','22P02'].includes(e.code??'')||
  /invalid|unknown|required|unsupported|must be|constraint/i.test(message))
  return new DayPlanError('invalid',message);
 return Error('Live day plans: '+message);
}
function pageSize(raw:unknown):number{
 const n=raw??20;
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1||n>50)
  return fail('invalid','Page size must be 1–50');
 return n;
}
function encode(value:object):string{
 return btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode<T>(raw:string|null|undefined):T|null{
 if(raw==null)return null;
 if(typeof raw!=='string'||raw.length>4096||!/^[A-Za-z0-9_-]+$/.test(raw))
  return fail('invalid','Invalid day-plan cursor');
 try{return JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
  '='.repeat((4-raw.length%4)%4))) as T}
 catch{return fail('invalid','Invalid day-plan cursor')}
}
function filters(raw:DayPlanQuery={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).some(k=>!['from','through','status','limit','cursor'].includes(k)))
  return fail('invalid','Unknown day-plan filters');
 const from=raw.from===undefined?null:civilPlanDate(raw.from);
 const through=raw.through===undefined?null:civilPlanDate(raw.through);
 if(from&&through&&from>through)fail('invalid','Invalid date range');
 const allowed=raw.status??statuses;
 if(!Array.isArray(allowed)||new Set(allowed).size!==allowed.length||
  allowed.some(s=>!statuses.includes(s)))fail('invalid','Invalid statuses');
 const signature=JSON.stringify([from,through,[...allowed].sort()]);
 const cursor=decode<PlanCursor>(raw.cursor);
 if(cursor&&(cursor.v!==1||cursor.signature!==signature||
  !UUID.test(cursor.id)||civilPlanDate(cursor.date)!==cursor.date))
  fail('invalid','Cursor filters do not match');
 return {from,through,allowed,signature,cursor,limit:pageSize(raw.limit)};
}
function itemCursor(planId:string,query:{limit?:number;cursor?:string|null}={}){
 if(!query||typeof query!=='object'||Array.isArray(query)||
   Object.keys(query).some(k=>!['limit','cursor'].includes(k)))
  return fail('invalid','Unknown plan item query');
 const cursor=decode<ItemCursor>(query.cursor);
 if(cursor&&(cursor.v!==1||cursor.planId!==planId||
  !UUID.test(cursor.id)||!Number.isSafeInteger(cursor.position)||
  cursor.position<0))fail('invalid','Item cursor plan mismatch');
 return {cursor,limit:pageSize(query.limit)};
}
function normalizedPatch(row:DayPlanRecord,patch:DayPlanPatch):Row{
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||
  Object.keys(patch).some(k=>!['timeZone','intention','capacityMinutes',
   'availability','tomorrowFirstTaskId','ritual'].includes(k)))
  return fail('invalid','Unknown plan patch');
 for(const [key,value] of Object.entries(patch))
  if(value===null&&key!=='tomorrowFirstTaskId')
   fail('invalid','Unexpected null day-plan patch field');
 const merged=normalizeDayPlan({
  planDate:row.planDate,timeZone:patch.timeZone??row.timeZone,
  intention:patch.intention??row.intention,
  capacityMinutes:patch.capacityMinutes??row.capacityMinutes,
  availability:patch.availability??row.availability,
  tomorrowFirstTaskId:patch.tomorrowFirstTaskId===undefined?
   row.tomorrowFirstTaskId:patch.tomorrowFirstTaskId,
  ritual:patch.ritual??row.ritual,
 });
 return {
  ...('timeZone'in patch?{time_zone:merged.timeZone}:{}),
  ...('intention'in patch?{intention:merged.intention}:{}),
  ...('capacityMinutes'in patch?{capacity_minutes:merged.capacityMinutes}:{}),
  ...('availability'in patch?{availability:merged.availability}:{}),
  ...('tomorrowFirstTaskId'in patch?{tomorrow_first_task_id:merged.tomorrowFirstTaskId}:{}),
  ...('ritual'in patch?{ritual:merged.ritual}:{}),
 };
}
function zonedToday(zone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',
  month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const pick=(name:string)=>parts.find(x=>x.type===name)?.value??'';
 return pick('year')+'-'+pick('month')+'-'+pick('day');
}
export function createLiveDayPlanApi():DayPlanApi{
 const retries=new Map<string,Envelope>();
 const atomicRetries=new Map<string,Record<string,unknown>>();
 const getPlan=async(key:string):Promise<DayPlanRecord|null>=>{
  const c=await client(),result=await c.from('day_plans')
   .select('*').eq('id',id(key)).maybeSingle();
  if(result.error)throw errorOf(result.error);
  return result.data===null?null:clone(record(result.data as Row));
 };
 async function write(op:Operation,fields:{patch:Row;target?:{id:string};
  expectedVersion?:number},check?:{items?:number}){
  const base={schemaVersion:1 as const,resource:'day_plans' as const,
   operation:op,...fields};
  const key=JSON.stringify(base);
  const envelope=retries.get(key)??{...base,operationId:secureId()};
  retries.set(key,envelope);
  let response:Receipt|null=null;
  // A network-uncertain outcome is retried using the exact same serialized
  // owner-free envelope. Deterministic SQL conflicts are never retried.
  for(let attempt=0;attempt<2;attempt++){
   const c=await client();
   const answer=await c.rpc('day_plans_command',{p:envelope});
   if(answer.error){
    const mapped=errorOf(answer.error);
    if(mapped instanceof DayPlanError||
      mapped.message.includes('not deployed')){
     retries.delete(key);throw mapped;
    }
    if(attempt===0)continue;
    throw mapped;
   }
   if(answer.data==null){
    if(attempt===0)continue;
    return unavailable('Missing owner command receipt');
   }
   response=answer.data as Receipt;break;
  }
  if(response?.status==='conflict'){
   retries.delete(key);
   return fail('conflict','Day plan version conflict (current '+
    String(response.conflict?.currentVersion??'unknown')+')');
  }
  const actionNo=response?.actionNo;
  if(response?.status!=='ok'||typeof actionNo!=='number'||
   !Number.isSafeInteger(actionNo)||actionNo<1||!Array.isArray(response.changed)||
   !response.changed.length||response.changed.some(x=>
    !x||!UUID.test(x.id)||!Number.isSafeInteger(x.version)||x.version<1))
   return unavailable('Malformed or unaudited day-plan receipt');
  const main=response.changed.find(x=>x.resource==='day_plans');
  if(!main||response.changed.filter(x=>x.resource==='day_plans').length!==1)
   return unavailable('Missing authoritative plan mutation');
  if(check?.items!==undefined&&
   response.changed.filter(x=>x.resource==='day_plan_items').length!==check.items)
   return unavailable('Partial preview item receipt');
  const stored=await getPlan(main.id);
  if(!stored||stored.version!==main.version)
   return unavailable('Owner plan readback differs from command receipt');
  if(response.plan&&record(response.plan).version!==stored.version)
   return unavailable('RPC plan snapshot differs from readback');
  retries.delete(key);
  return {record:stored,actionNo};
 }
 return {
  mode:'live',
  async listPlans(query={}){
   const f=filters(query);if(!f.allowed.length)return {items:[],total:0,nextCursor:null};
   const c=await client();
   let countQuery=c.from('day_plans').select('id',{count:'exact',head:true});
   if(f.from)countQuery=countQuery.gte('plan_date',f.from);
   if(f.through)countQuery=countQuery.lte('plan_date',f.through);
   countQuery=countQuery.in('status',f.allowed);
   const count=await countQuery;
   if(count.error)throw errorOf(count.error);
   if(!Number.isSafeInteger(count.count))return unavailable('Missing exact owner plan total');
   let rows=c.from('day_plans').select('*');
   if(f.from)rows=rows.gte('plan_date',f.from);
   if(f.through)rows=rows.lte('plan_date',f.through);
   rows=rows.in('status',f.allowed);
   if(f.cursor)rows=rows.or('plan_date.gt.'+f.cursor.date+
    ',and(plan_date.eq.'+f.cursor.date+',id.gt.'+f.cursor.id+')');
   const result=await rows.order('plan_date',{ascending:true})
    .order('id',{ascending:true}).range(0,f.limit);
   if(result.error)throw errorOf(result.error);
   if(!Array.isArray(result.data)||result.data.length>f.limit+1)
    return unavailable('Invalid bounded owner plan page');
   const ordered=(result.data as Row[]).map(record);
   const items=ordered.slice(0,f.limit),last=items.at(-1);
   return {items:clone(items),total:count.count as number,
    nextCursor:ordered.length>f.limit&&last?encode({
     v:1,signature:f.signature,date:last.planDate,id:last.id}):null};
  },
  getPlan,
  async listItems(planId,query={}){
   const key=id(planId),f=itemCursor(key,query),c=await client();
   const count=await c.from('day_plan_items').select('id',{count:'exact',head:true})
    .eq('plan_id',key);
   if(count.error)throw errorOf(count.error);
   if(!Number.isSafeInteger(count.count))
    return unavailable('Missing exact owner item total');
   let rows=c.from('day_plan_items').select('*').eq('plan_id',key);
   if(f.cursor)rows=rows.or('position.gt.'+f.cursor.position+
    ',and(position.eq.'+f.cursor.position+',id.gt.'+f.cursor.id+')');
   const result=await rows.order('position',{ascending:true})
    .order('id',{ascending:true}).range(0,f.limit);
   if(result.error)throw errorOf(result.error);
   if(!Array.isArray(result.data)||result.data.length>f.limit+1)
    return unavailable('Invalid bounded owner item page');
   const ordered=(result.data as Row[]).map(item);
   const items=ordered.slice(0,f.limit),last=items.at(-1);
   return {items:clone(items),total:count.count as number,
    nextCursor:ordered.length>f.limit&&last?encode({
     v:1,planId:key,position:last.position,id:last.id}):null};
  },
  async createPlan(input:NewDayPlan){
   const value=normalizeDayPlan(input);
   return write('create',{patch:{
    plan_date:value.planDate,time_zone:value.timeZone,intention:value.intention,
    capacity_minutes:value.capacityMinutes,availability:value.availability,
    tomorrow_first_task_id:value.tomorrowFirstTaskId,ritual:value.ritual,
   }});
  },
  async updatePlan(key,expected,patch:DayPlanPatch){
   version(expected);
   const plan=await getPlan(key);
   if(!plan)return fail('not_found','Owner plan not found');
   return write('update',{target:{id:plan.id},expectedVersion:expected,
    patch:normalizedPatch(plan,patch)});
  },
  async previewPlan(key,expected,items:NewDayPlanItem[],availability){
   version(expected);
   const validated=normalizePlanItems(items),snapshot=normalizeAvailability(availability);
   if(validated.length>500)return fail('invalid','Preview exceeds 500 items');
   const known=new Set(snapshot.sources.map(s=>s.resource+':'+s.id));
   for(const candidate of validated){
    if(!known.has('tasks:'+candidate.taskId)||
     (candidate.blockId&&!known.has('calendar_blocks:'+candidate.blockId)))
     fail('invalid','Plan item missing from source snapshot');
   }
   return write('preview',{target:{id:id(key)},expectedVersion:expected,patch:{
    availability:snapshot,items:validated.map(x=>({
     task_id:id(x.taskId),calendar_block_id:x.blockId==null?null:id(x.blockId),
     disposition:x.disposition,reason:x.reason??null,position:x.position,
    })),
   }},{items:validated.length});
  },
  async commitPlacements(input:CommitPlacementsInput){
   const validated=normalizeCommitPlacements(input);
   // No caller-supplied owner: the command checks owner/version under row locks.
   const days=validated.days.map(day=>({
    plan_date:day.planDate,time_zone:day.timeZone,
    ...(day.planId?{plan_id:id(day.planId),expected_version:day.expectedVersion}:{}),
    intention:day.intention??'',capacity_minutes:day.capacityMinutes??0,
    sources:day.sources.map(s=>({resource:s.resource,id:id(s.id),version:s.version})),
    placements:day.placements.map(p=>({task_id:id(p.taskId),title:p.title,
     starts_at:p.startsAt,ends_at:p.endsAt,position:p.position})),
    unplaced:(day.unplaced??[]).map(u=>({task_id:id(u.taskId),
     reason:u.reason,position:u.position})),
   }));
   const base={schemaVersion:1 as const,resource:'day_plans' as const,
    operation:'commit_placements' as const,patch:{days}};
   const key=JSON.stringify({...base,operationId:validated.operationId??null});
   const envelope=atomicRetries.get(key)??{...base,
    operationId:validated.operationId??secureId()};
   atomicRetries.set(key,envelope);
   let receipt:(Receipt&{plans?:Row[];blockIds?:unknown;
    conflict?:{reason?:string;currentVersion?:number}})|null=null;
   for(let attempt=0;attempt<2;attempt++){
    const c=await client();
    const response=await c.rpc('day_plans_command',{p:envelope});
    if(response.error){
     const error=errorOf(response.error);
     if(error instanceof DayPlanError||error.message.includes('not deployed')){
      atomicRetries.delete(key);throw error;
     }
     if(attempt===0)continue;
     throw error;
    }
    if(response.data==null){
     if(attempt===0)continue;
     return unavailable('Missing atomic planner receipt');
    }
    receipt=response.data as Receipt&{plans?:Row[];blockIds?:unknown;
     conflict?:{reason?:string;currentVersion?:number}};break;
   }
   if(receipt?.status==='conflict'){
    atomicRetries.delete(key);
    return fail('conflict',receipt.conflict?.reason??'Atomic planner source/version conflict');
   }
   const changed=receipt?.changed;
   const count=(resource:string)=>changed?.filter(c=>c.resource===resource).length??0;
   const blocks=days.reduce((n,d)=>n+d.placements.length,0);
   const items=days.reduce((n,d)=>n+d.placements.length+d.unplaced.length,0);
   if(receipt?.status!=='ok'||typeof receipt.actionNo!=='number'||
    !Number.isSafeInteger(receipt.actionNo)||receipt.actionNo<1||
    !Array.isArray(changed)||
    changed.some(x=>!x||!UUID.test(x.id)||
     !Number.isSafeInteger(x.version)||x.version<1)||
    count('day_plans')!==days.length||
    count('calendar_blocks')!==blocks||count('day_plan_items')!==items||
    !Array.isArray(receipt.plans)||receipt.plans.length!==days.length||
    !Array.isArray(receipt.blockIds)||receipt.blockIds.length!==blocks||
    receipt.blockIds.some(x=>typeof x!=='string'||!UUID.test(x)))
    return unavailable('Malformed or unaudited atomic planner receipt');
   const authoritative:AtomicPlacementResult={plans:[],
    blockIds:[...receipt.blockIds] as string[]};
   for(let i=0;i<days.length;i++){
    const fromReceipt=record(receipt.plans[i]);
    const saved=await getPlan(fromReceipt.id);
    if(!saved||saved.version!==fromReceipt.version||
     saved.status!=='committed'||saved.planDate!==days[i].plan_date||
     fromReceipt.planDate!==days[i].plan_date||
     !changed.some(c=>c.resource==='day_plans'&&c.id===saved.id&&
      c.version===saved.version))
     return unavailable('Atomic planner owner readback disagrees with receipt');
    authoritative.plans.push(saved);
   }
   atomicRetries.delete(key);
   return {record:authoritative,actionNo:receipt.actionNo};
  },
  async undoPlacements(actionNo){
   if(!Number.isSafeInteger(actionNo)||actionNo<1)
    return fail('invalid','Undo needs a positive action number');
   const db=await client();
   const user=await db.auth.getUser();
   const owner=user.data?.user?.id;
   if(user.error||!owner)return unavailable('Sign in again to undo');
   // undo_action refuses another owner's action, an already undone action
   // and an action with a newer owner write after it (no force from the app).
   const {error}=await db.rpc('undo_action',{p_user:owner,p_no:actionNo});
   if(error){
    const message=error.message??'Undo failed';
    if(/^Undo .* first$|Undo would also remove|already undone|is not yours/i.test(message))
     return fail('conflict',message);
    return unavailable(message);
   }
  },
  async commitPlan(key,expected){
   version(expected);
   // Only the N46.2 SQL command can atomically recheck the persisted source
   // version snapshot and apply the commit. Browser comparisons are advisory.
   return write('commit',{target:{id:id(key)},expectedVersion:expected,patch:{}});
  },
  async closePlan(key,expected,ritual){
   version(expected);
   const plan=await getPlan(key);
   if(!plan)return fail('not_found','Owner plan not found');
   if(plan.planDate>zonedToday(plan.timeZone))
    return fail('invalid','Future owner dates cannot be closed');
   const patch:Row={};
   if(ritual!==undefined){
    // The strict model accepts only new-plan fields. Passing the fetched
    // DayPlanRecord wholesale would include read-only id/status/version and
    // incorrectly reject every real close with a supplied ritual.
    const value=normalizeDayPlan({
     planDate:plan.planDate,timeZone:plan.timeZone,
     intention:plan.intention,capacityMinutes:plan.capacityMinutes,
     availability:plan.availability,
     tomorrowFirstTaskId:plan.tomorrowFirstTaskId,ritual,
    });
    patch.ritual=value.ritual;
   }
   return write('close',{target:{id:plan.id},expectedVersion:expected,patch});
  },
  async reopenPlan(key,expected){
   version(expected);
   return write('reopen',{target:{id:id(key)},expectedVersion:expected,patch:{}});
  },
 };
}
