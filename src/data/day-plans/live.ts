// N60.2: bounded owner-RLS reads and one audited RPC transaction per mutation.
import {DayPlanError,type DayPlanApi,type DayPlanItem,type DayPlanPatch,type DayPlanQuery,
 type DayPlanRecord,type DayPlanStatus,type NewDayPlan,type NewDayPlanItem,type PlanAvailability} from './contract';
import {civilPlanDate,normalizeAvailability,normalizeDayPlan,normalizePlanItems} from './model';

type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Response={status:'ok'|'conflict';actionNo?:number|null;changed?:{id:string;version:number}[];conflict?:{currentVersion?:number}};
type Operation='create'|'update'|'preview'|'commit'|'close'|'reopen';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses:DayPlanStatus[]=['draft','previewed','committed','closed'];
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{throw new DayPlanError(code,message)};
async function client(){return (await import('../live/client')).liveClient()}
function uuid(){
 const c=globalThis.crypto;
 if(c?.randomUUID)return c.randomUUID();
 if(!c?.getRandomValues)return fail('invalid','Secure UUID generation unavailable');
 const a=c.getRandomValues(new Uint8Array(16));
 a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;
 const h=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function mapError(e:SqlError):DayPlanError{
 const message=e.message??'Day plan command failed';
 if(e.code==='23505'||/conflict|stale|version|duplicate|already exists/i.test(message))
  return new DayPlanError('conflict',message);
 if(/not found|no rows|other owner/i.test(message))
  return new DayPlanError('not_found',message);
 if(e.code==='23514'||e.code==='23503'||e.code==='22P02'||
   /invalid|unknown|requires|must|only|unsupported|future|snapshot/i.test(message))
  return new DayPlanError('invalid',message);
 return new DayPlanError('invalid','Day plan server operation failed');
}
function unwrap<T>(response:{data:T|null;error:SqlError|null}):T{
 if(response.error)throw mapError(response.error);
 return response.data as T;
}
const optional=(v:unknown)=>v==null?null:String(v);
function mapPlan(row:Row):DayPlanRecord{
 return {
  id:String(row.id),planDate:String(row.plan_date),timeZone:String(row.time_zone),
  intention:String(row.intention??''),capacityMinutes:Number(row.capacity_minutes),
  availability:normalizeAvailability(row.availability as PlanAvailability),
  status:row.status as DayPlanStatus,closedAt:optional(row.closed_at),
  tomorrowFirstTaskId:optional(row.tomorrow_first_task_id),
  ritual:row.ritual as Record<string,unknown>,
  version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
 };
}
function mapItem(row:Row):DayPlanItem{
 return {id:String(row.id),planId:String(row.plan_id),taskId:String(row.task_id),
  blockId:optional(row.calendar_block_id),
  disposition:row.disposition as DayPlanItem['disposition'],
  reason:optional(row.reason),position:Number(row.position),version:Number(row.version)};
}
const encode=(x:unknown)=>btoa(JSON.stringify(x)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function cursor(input:string|null|undefined,filter:string,kind:'plan'|'item'):{
 date?:string;id:string;position?:number}|null{
 if(input==null)return null;
 try{
  if(typeof input!=='string'||input.length>1024||!/^[A-Za-z0-9_-]{6,}$/.test(input))
   return fail('invalid','Invalid day-plan cursor');
  const val:unknown=JSON.parse(atob(input.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-input.length%4)%4)));
  if(!val||typeof val!=='object')return fail('invalid','Invalid day-plan cursor');
  const t=val as {v:number;f:string;k:string;id:string;date?:string;position?:number};
  if(t.v!==1||t.f!==filter||t.k!==kind||typeof t.id!=='string'||!UUID.test(t.id)||
    (kind==='plan'&&(!t.date||civilPlanDate(t.date)!==t.date))||
    (kind==='item'&&(!Number.isSafeInteger(t.position)||t.position!<0)))
   return fail('invalid','Day-plan cursor does not match its query');
  return t;
 }catch{return fail('invalid','Invalid day-plan cursor');}
}
const limitOf=(n:number|undefined)=>{
 const limit=n??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)return fail('invalid','Plan page limit must be 1–50');
 return limit;
};
const validVersion=(v:number)=>{
 if(!Number.isSafeInteger(v)||v<1||v>2147483647)fail('invalid','Expected positive int4 version');
};
function patchColumns(input:DayPlanPatch):Row{
 if(!input||typeof input!=='object'||Array.isArray(input))return fail('invalid','Invalid plan patch');
 const allowed=['timeZone','intention','capacityMinutes','availability','tomorrowFirstTaskId','ritual'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))fail('invalid','Unknown plan patch field');
 const result:Row={};
 for(const [key,column] of [
  ['timeZone','time_zone'],['intention','intention'],['capacityMinutes','capacity_minutes'],
  ['availability','availability'],['tomorrowFirstTaskId','tomorrow_first_task_id'],['ritual','ritual'],
 ] as const)if(input[key]!==undefined)result[column]=input[key];
 return result;
}
const today=(zone:string)=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const pick=(key:string)=>parts.find(p=>p.type===key)?.value??'';
 return pick('year')+'-'+pick('month')+'-'+pick('day');
};
export function createLiveDayPlanApi():DayPlanApi{
 const uncertain=new Map<string,string>();
 async function readPlan(id:string):Promise<DayPlanRecord|null>{
  if(!UUID.test(id))return fail('invalid','Invalid plan ID');
  const api=await client();
  const row=unwrap<Row|null>(await api.from('day_plans').select('*').eq('id',id).maybeSingle());
  return row?mapPlan(row):null;
 }
 async function write(op:Operation,patch:Row={},id?:string,v?:number){
  const request:Row={schemaVersion:1,resource:'day_plans',operation:op,patch};
  if(id!==undefined){
   if(!UUID.test(id))fail('invalid','Invalid plan ID');
   validVersion(v!);request.target={id};request.expectedVersion=v;
  }
  const key=JSON.stringify(request),operationId=uncertain.get(key)??uuid();
  const envelope={operationId,...request};
  let accepted=false;
  try{
   const api=await client();
   const response=unwrap<Response>(await api.rpc('day_plans_command',{p:envelope}));
   if(response.status==='conflict'){
    uncertain.delete(key);
    return fail('conflict','Day plan version changed (current '+String(response.conflict?.currentVersion??'unknown')+')');
   }
   if(response.status!=='ok'||!Array.isArray(response.changed)||!response.changed.length)
    throw Error('Invalid day_plans_command receipt');
   const target=response.changed.find(x=>typeof x.id==='string'&&Number.isSafeInteger(x.version) &&
      (id===undefined||x.id===id));
   if(!target)throw Error('Command did not return the target plan');
   accepted=true;
   const record=await readPlan(target.id);
   if(!record||record.version!==target.version)throw Error('Plan readback version mismatch');
   uncertain.delete(key);
   return {record,actionNo:Number.isSafeInteger(response.actionNo)?response.actionNo!:null};
  }catch(e){
   if(accepted||!(e instanceof DayPlanError)||e.code==='invalid')uncertain.set(key,operationId);
   else uncertain.delete(key);
   throw e;
  }
 }
 return {
  mode:'live',
  async getPlan(id){return readPlan(id)},
  async listPlans(query:DayPlanQuery={}){
   const limit=limitOf(query.limit),from=query.from===undefined?null:civilPlanDate(query.from),
    through=query.through===undefined?null:civilPlanDate(query.through);
   if(from&&through&&from>through)fail('invalid','Invalid date range');
   const selected=query.status===undefined?null:[...new Set(query.status)].sort();
   if(selected&&(!Array.isArray(query.status)||selected.some(s=>!statuses.includes(s))))
    fail('invalid','Invalid plan statuses');
   const signature=JSON.stringify([from,through,selected]),after=cursor(query.cursor,signature,'plan');
   const api=await client();
   let count=api.from('day_plans').select('id',{head:true,count:'exact'});
   let rows=api.from('day_plans').select('*');
   if(from){count=count.gte('plan_date',from);rows=rows.gte('plan_date',from)}
   if(through){count=count.lte('plan_date',through);rows=rows.lte('plan_date',through)}
   if(selected){
    if(!selected.length)return {items:[],total:0,nextCursor:null};
    count=count.in('status',selected);rows=rows.in('status',selected);
   }
   const totalRes=await count;
   if(totalRes.error)throw mapError(totalRes.error);
   if(!Number.isSafeInteger(totalRes.count)||totalRes.count<0)
    return fail('invalid','Plan total unavailable');
   if(after)rows=rows.or('plan_date.gt.'+after.date+',and(plan_date.eq.'+after.date+',id.gt.'+after.id+')');
   const records=unwrap<Row[]>(await rows.order('plan_date',{ascending:true}).order('id',{ascending:true}).limit(limit+1));
   const items=records.slice(0,limit).map(mapPlan);
   return {items,total:totalRes.count as number,nextCursor:records.length>limit&&items.length?
    encode({v:1,f:signature,k:'plan',id:items[items.length-1].id,date:items[items.length-1].planDate}):null};
  },
  async listItems(planId,query={}){
   if(!UUID.test(planId))fail('invalid','Invalid plan ID');
   if(!await readPlan(planId))fail('not_found','Day plan not found');
   const limit=limitOf(query.limit),after=cursor(query.cursor,planId,'item');
   const api=await client();
   const counted=await api.from('day_plan_items').select('id',{head:true,count:'exact'}).eq('plan_id',planId);
   if(counted.error)throw mapError(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count<0)fail('invalid','Item total unavailable');
   let rows=api.from('day_plan_items').select('*').eq('plan_id',planId);
   if(after)rows=rows.or('position.gt.'+after.position+',and(position.eq.'+after.position+',id.gt.'+after.id+')');
   const raw=unwrap<Row[]>(await rows.order('position',{ascending:true}).order('id',{ascending:true}).limit(limit+1));
   const items=raw.slice(0,limit).map(mapItem);
   return {items,total:counted.count as number,nextCursor:raw.length>limit&&items.length?
    encode({v:1,f:planId,k:'item',id:items[items.length-1].id,position:items[items.length-1].position}):null};
  },
  createPlan(input:NewDayPlan){
   const plan=normalizeDayPlan(input);
   return write('create',{
    plan_date:plan.planDate,time_zone:plan.timeZone,intention:plan.intention,
    capacity_minutes:plan.capacityMinutes,availability:plan.availability,
    tomorrow_first_task_id:plan.tomorrowFirstTaskId,ritual:plan.ritual,
   });
  },
  async updatePlan(id,version,patch){
   const current=await readPlan(id);
   if(!current)return fail('not_found','Day plan not found');
   const input=normalizeDayPlan({planDate:current.planDate,
    timeZone:patch.timeZone??current.timeZone,intention:patch.intention??current.intention,
    capacityMinutes:patch.capacityMinutes??current.capacityMinutes,
    availability:patch.availability??current.availability,
    tomorrowFirstTaskId:patch.tomorrowFirstTaskId===undefined?current.tomorrowFirstTaskId:patch.tomorrowFirstTaskId,
    ritual:patch.ritual??current.ritual,
   });
   void input;
   return write('update',patchColumns(patch),id,version);
  },
  previewPlan(id,version,items:NewDayPlanItem[],availability:PlanAvailability){
   const prepared=normalizePlanItems(items),sources=normalizeAvailability(availability);
   if(prepared.length>500||sources.sources.length>1000)fail('invalid','Preview exceeds server item limit');
   for(const item of prepared)if(!sources.sources.some(s=>s.resource==='tasks'&&s.id===item.taskId)||
     (item.blockId&&!sources.sources.some(s=>s.resource==='calendar_blocks'&&s.id===item.blockId)))
    fail('invalid','Preview items must occur in the captured source snapshot');
   return write('preview',{availability:sources,items:prepared.map(item=>({
    task_id:item.taskId,calendar_block_id:item.blockId??null,
    disposition:item.disposition,reason:item.reason??null,position:item.position,
   }))},id,version);
  },
  commitPlan(id,version){
   // Source versions are re-checked under owner locks by day_plans_command.
   return write('commit',{},id,version);
  },
  async closePlan(id,version,ritual){
   const current=await readPlan(id);
   if(!current)return fail('not_found','Day plan not found');
   if(current.planDate>today(current.timeZone))fail('invalid','Future plan dates cannot be closed');
   if(ritual!==undefined)normalizeDayPlan({planDate:current.planDate,
    timeZone:current.timeZone,ritual});
   return write('close',ritual===undefined?{}:{ritual},id,version);
  },
  reopenPlan(id,version){return write('reopen',{},id,version)},
 };
}
