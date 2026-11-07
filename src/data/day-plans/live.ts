// N60.2 owner-only day plans. Reads rely on RLS; every write goes through
// public.day_plans_command, which verifies source versions under DB locks.
import {DayPlanError,type DayPlanApi,type DayPlanRecord,type DayPlanItem,
 type DayPlanPatch,type DayPlanQuery,type DayPlanStatus,type NewDayPlan,
 type NewDayPlanItem,type PlanAvailability} from './contract';
import {civilPlanDate,normalizeAvailability,normalizeDayPlan,
 normalizePlanItems} from './model';

type Row=Record<string,unknown>;
type Operation='create'|'update'|'preview'|'commit'|'close'|'reopen';
type Changed={id:string;version:number;resource?:string};
type Receipt={status:'ok'|'conflict';actionNo?:number|null;
 plan?:Row;changed?:Changed[];conflict?:{currentVersion?:number;reason?:string}};
type Envelope={schemaVersion:1;resource:'day_plans';operation:Operation;
 operationId:string;target?:{id:string};expectedVersion?:number;patch:Row};
type PageCursor={v:1;filter:string;date?:string;position?:number;id:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new DayPlanError(code,message);
};
async function client(){return (await import('../live/client')).liveClient();}
function secureId():string{
 if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
 const bytes=new Uint8Array(16);
 if(!globalThis.crypto?.getRandomValues)throw new Error('Secure operation IDs unavailable');
 globalThis.crypto.getRandomValues(bytes);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20);
}
function validateId(id:string):string{
 if(typeof id!=='string'||!UUID.test(id))return fail('invalid','Expected UUID plan ID');
 return id;
}
function positive(v:number):void{
 if(!Number.isSafeInteger(v)||v<1||v>2147483647)
  fail('invalid','Expected positive int4 version');
}
function sqlError(error:{code?:string;message?:string}):Error{
 const message=error.message??'Day plan request failed';
 if(error.code==='23505'||/stale|version|duplicate|already exists|conflict|one per owner/i.test(message))
  return new DayPlanError('conflict',message);
 if(/not found|no rows/i.test(message))return new DayPlanError('not_found',message);
 if(error.code==='23503'||error.code==='23514'||error.code==='22P02'||
  /invalid|unknown|unsupported|required|cannot|only |malformed|source snapshot/i.test(message))
  return new DayPlanError('invalid',message);
 return new Error(message);
}
function plan(row:Row):DayPlanRecord{
 const value:DayPlanRecord={
  id:String(row.id),planDate:String(row.plan_date),timeZone:String(row.time_zone),
  intention:String(row.intention??''),capacityMinutes:Number(row.capacity_minutes),
  availability:normalizeAvailability(row.availability as PlanAvailability),
  status:row.status as DayPlanStatus,
  closedAt:row.closed_at==null?null:String(row.closed_at),
  tomorrowFirstTaskId:row.tomorrow_first_task_id==null?
   null:String(row.tomorrow_first_task_id),
  ritual:clone(row.ritual as Record<string,unknown>??{}),
  version:Number(row.version),createdAt:String(row.created_at),
  updatedAt:String(row.updated_at),
 };
 if(!UUID.test(value.id)||!Number.isInteger(value.version)||value.version<1)
  throw new Error('Malformed owner day-plan row');
 return value;
}
function item(row:Row):DayPlanItem{
 const r:DayPlanItem={
  id:String(row.id),planId:String(row.plan_id),taskId:String(row.task_id),
  blockId:row.calendar_block_id==null?null:String(row.calendar_block_id),
  disposition:row.disposition as DayPlanItem['disposition'],
  reason:row.reason==null?null:String(row.reason),
  position:Number(row.position),version:Number(row.version),
 };
 if(!UUID.test(r.id)||!UUID.test(r.planId)||!UUID.test(r.taskId)||
  !Number.isInteger(r.position)||!Number.isInteger(r.version))
  throw new Error('Malformed owner day-plan item row');
 return r;
}
function pageSize(value:number|undefined):number{
 const n=value??20;
 if(!Number.isSafeInteger(n)||n<1||n>50)return fail('invalid','Page size must be 1–50');
 return n;
}
function cursor(raw:string|null|undefined,filter:string):PageCursor|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||raw.length>2048||!/^[A-Za-z0-9_-]+$/.test(raw))
   return fail('invalid','Malformed day-plan cursor');
  const c=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4))) as PageCursor;
  if(c.v!==1||c.filter!==filter||typeof c.id!=='string'||!UUID.test(c.id))
   return fail('invalid','Day-plan cursor belongs to another filter');
  return c;
 }catch{return fail('invalid','Malformed day-plan cursor');}
}
function encode(c:PageCursor):string{
 return btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function query(q:DayPlanQuery={}):{
 from:string|null;through:string|null;statuses:DayPlanStatus[];
 size:number;after:PageCursor|null;filter:string
}{
 if(!q||typeof q!=='object'||Array.isArray(q)||
  Object.keys(q).some(x=>!['from','through','status','limit','cursor'].includes(x)))
  fail('invalid','Invalid day-plan query');
 const from=q.from===undefined?null:civilPlanDate(q.from);
 const through=q.through===undefined?null:civilPlanDate(q.through);
 if(from&&through&&from>through)fail('invalid','Date window is reversed');
 const valid:DayPlanStatus[]=['draft','previewed','committed','closed'];
 if(q.status!==undefined&&(!Array.isArray(q.status)||
  !q.status.every(x=>valid.includes(x))))
  fail('invalid','Unknown day-plan status filter');
 const statuses=q.status===undefined?valid:valid.filter(x=>q.status!.includes(x));
 const filter=JSON.stringify([from,through,statuses]);
 return {from,through,statuses,size:pageSize(q.limit),after:cursor(q.cursor,filter),filter};
}
function patchColumns(patch:DayPlanPatch):Row{
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||
  Object.keys(patch).some(x=>!['timeZone','intention','capacityMinutes',
   'availability','tomorrowFirstTaskId','ritual'].includes(x))||
  !Object.keys(patch).length)return fail('invalid','Invalid day-plan patch');
 const columns:Row={};
 if(patch.timeZone!==undefined)columns.time_zone=patch.timeZone;
 if(patch.intention!==undefined)columns.intention=patch.intention;
 if(patch.capacityMinutes!==undefined)columns.capacity_minutes=patch.capacityMinutes;
 if(patch.availability!==undefined)
  columns.availability=normalizeAvailability(patch.availability);
 if('tomorrowFirstTaskId'in patch)
  columns.tomorrow_first_task_id=patch.tomorrowFirstTaskId;
 if(patch.ritual!==undefined)columns.ritual=patch.ritual;
 return columns;
}
function normalizeRitual(ritual:Record<string,unknown>):Record<string,unknown>{
 return normalizeDayPlan({planDate:'2000-01-01',timeZone:'UTC',ritual}).ritual;
}
export function createLiveDayPlanApi():DayPlanApi{
 // Ambiguous errors/readback failures preserve the exact op id and envelope.
 // Deterministic SQL conflicts discard them so a corrected user action is new.
 const retry=new Map<string,Envelope>();
 const getPlan=async(id:string):Promise<DayPlanRecord|null>=>{
  const key=validateId(id),c=await client();
  const r=await c.from('day_plans').select('*').eq('id',key).maybeSingle();
  if(r.error)throw sqlError(r.error);
  return r.data===null?null:plan(r.data as Row);
 };
 async function write(operation:Operation,fields:{
  target?:{id:string};expectedVersion?:number;patch:Row
 }):Promise<{record:DayPlanRecord;actionNo:number|null}>{
  const base={schemaVersion:1 as const,resource:'day_plans' as const,operation,...fields};
  const key=JSON.stringify(base);
  const envelope=retry.get(key)??{...base,operationId:secureId()};
  retry.set(key,envelope);
  try{
   const c=await client(),result=await c.rpc('day_plans_command',{p:envelope});
   if(result.error)throw sqlError(result.error);
   const receipt=result.data as Receipt|null;
   if(receipt?.status==='conflict')
    return fail('conflict','Day-plan command conflict: '+
     String(receipt.conflict?.reason??receipt.conflict?.currentVersion??'stale version'));
   if(receipt?.status!=='ok'||!Number.isSafeInteger(receipt.actionNo)||
    (receipt.actionNo??0)<1||!receipt.plan||!Array.isArray(receipt.changed)||
    !receipt.changed.some(x=>x.resource==='day_plans'&&
     x.id===receipt.plan!.id&&Number.isInteger(x.version)&&x.version>0))
    throw new Error('Malformed or unaudited day-plan command receipt');
   const expected=plan(receipt.plan);
   const record=await getPlan(expected.id);
   if(!record||record.version!==expected.version||
    record.status!==expected.status||record.planDate!==expected.planDate)
    throw new Error('Day-plan receipt/readback mismatch');
   retry.delete(key);
   return {record:clone(record),actionNo:receipt.actionNo!};
  }catch(e){
   if(e instanceof DayPlanError)retry.delete(key);
   throw e;
  }
 }
 return {
  mode:'live',
  async listPlans(q:DayPlanQuery={}){
   const opts=query(q);
   if(!opts.statuses.length)return {items:[],total:0,nextCursor:null};
   const c=await client();
   let count=c.from('day_plans').select('id',{head:true,count:'exact'});
   if(opts.from)count=count.gte('plan_date',opts.from);
   if(opts.through)count=count.lte('plan_date',opts.through);
   count=count.in('status',opts.statuses);
   const counted=await count;
   if(counted.error)throw sqlError(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count!<0)
    throw new Error('Missing exact owner day-plan total');
   let rows=c.from('day_plans').select('*')
    .in('status',opts.statuses);
   if(opts.from)rows=rows.gte('plan_date',opts.from);
   if(opts.through)rows=rows.lte('plan_date',opts.through);
   if(opts.after){
    if(!opts.after.date||!UUID.test(opts.after.id))
     fail('invalid','Invalid day-plan keyset cursor');
    civilPlanDate(opts.after.date);
    rows=rows.or('plan_date.gt.'+opts.after.date+
     ',and(plan_date.eq.'+opts.after.date+',id.gt.'+opts.after.id+')');
   }
   const result=await rows.order('plan_date',{ascending:true})
    .order('id',{ascending:true}).range(0,opts.size);
   if(result.error)throw sqlError(result.error);
   if(!Array.isArray(result.data)||result.data.length>opts.size+1)
    throw new Error('Malformed bounded owner day-plan page');
   const all=(result.data as Row[]).map(plan);
   const items=all.slice(0,opts.size),last=items.at(-1);
   return {items:clone(items),total:counted.count!,
    nextCursor:all.length>opts.size&&last?
     encode({v:1,filter:opts.filter,date:last.planDate,id:last.id}):null};
  },
  getPlan,
  async listItems(planId:string,q={}){
   const key=validateId(planId);
   const valid=q as {limit?:number;cursor?:string|null};
   if(!valid||typeof valid!=='object'||Array.isArray(valid)||
    Object.keys(valid).some(x=>!['limit','cursor'].includes(x)))
    fail('invalid','Invalid plan item query');
   const size=pageSize(valid.limit),c=await client();
   const ownerPlan=await getPlan(key);
   if(!ownerPlan)return fail('not_found','Day plan not found');
   const filter=key+':'+ownerPlan.version,after=cursor(valid.cursor,filter);
   const counted=await c.from('day_plan_items')
    .select('id',{head:true,count:'exact'}).eq('plan_id',key);
   if(counted.error)throw sqlError(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count!<0)
    throw new Error('Missing exact owner item total');
   let read=c.from('day_plan_items').select('*').eq('plan_id',key);
   if(after){
    if(!Number.isInteger(after.position)||after.position!<0)
     fail('invalid','Invalid item position cursor');
    read=read.or('position.gt.'+after.position+
     ',and(position.eq.'+after.position+',id.gt.'+after.id+')');
   }
   const result=await read.order('position',{ascending:true})
    .order('id',{ascending:true}).range(0,size);
   if(result.error)throw sqlError(result.error);
   if(!Array.isArray(result.data)||result.data.length>size+1)
    throw new Error('Malformed bounded owner day-plan item page');
   const all=(result.data as Row[]).map(item);
   const items=all.slice(0,size),last=items.at(-1);
   return {items:clone(items),total:counted.count!,
    nextCursor:all.length>size&&last?
     encode({v:1,filter,position:last.position,id:last.id}):null};
  },
  async createPlan(input:NewDayPlan){
   const n=normalizeDayPlan(input);
   return write('create',{patch:{
    plan_date:n.planDate,time_zone:n.timeZone,intention:n.intention,
    capacity_minutes:n.capacityMinutes,availability:n.availability,
    tomorrow_first_task_id:n.tomorrowFirstTaskId,ritual:n.ritual,
   }});
  },
  async updatePlan(id:string,expectedVersion:number,patch:DayPlanPatch){
   const target=validateId(id);positive(expectedVersion);
   return write('update',{target:{id:target},expectedVersion,
    patch:patchColumns(patch)});
  },
  async previewPlan(id:string,expectedVersion:number,
   items:NewDayPlanItem[],availability:PlanAvailability){
   const target=validateId(id);positive(expectedVersion);
   const normalized=normalizePlanItems(items),sources=normalizeAvailability(availability);
   if(normalized.length>500||sources.sources.length>1000)
    fail('invalid','Plan preview is too large');
   const sourceKeys=new Set(sources.sources.map(x=>x.resource+':'+x.id));
   for(const entry of normalized){
    if(!sourceKeys.has('tasks:'+entry.taskId)||
     (entry.blockId&&!sourceKeys.has('calendar_blocks:'+entry.blockId)))
     fail('invalid','Preview item must be in source snapshot');
   }
   return write('preview',{target:{id:target},expectedVersion,patch:{
    availability:sources,items:normalized.map(x=>({
     task_id:x.taskId,calendar_block_id:x.blockId??null,
     disposition:x.disposition,reason:x.reason??null,position:x.position,
    })),
   }});
  },
  async commitPlan(id:string,expectedVersion:number){
   const target=validateId(id);positive(expectedVersion);
   // Never run client-only comparePlanSources; SQL rechecks under locks.
   return write('commit',{target:{id:target},expectedVersion,patch:{}});
  },
  async closePlan(id:string,expectedVersion:number,ritual?:Record<string,unknown>){
   const target=validateId(id);positive(expectedVersion);
   return write('close',{target:{id:target},expectedVersion,
    patch:ritual===undefined?{}:{ritual:normalizeRitual(ritual)}});
  },
  async reopenPlan(id:string,expectedVersion:number){
   const target=validateId(id);positive(expectedVersion);
   return write('reopen',{target:{id:target},expectedVersion,patch:{}});
  },
 };
}
