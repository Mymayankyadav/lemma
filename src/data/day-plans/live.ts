// N60: owner-RLS reads and versioned N46 day_plans_command writes.
// No service role, direct client UPDATE, or fabricated successful records.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {DayAvailability,DayClosure,DayPlanApi,DayPlanItem,DayPlanPatch,
 DayPlanQuery,DayPlanRecord,DayPlanRitual,NewDayPlan,NewDayPlanItem} from './contract';
import {closure,date,decodeCursor,encodeCursor,id,invalid,newPlan,patch,query,version} from './validate';

type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Changed={id:string;version:number};
type Response={status:'ok'|'conflict';changed:Changed[];actionNo?:number|null;conflict?:{currentVersion?:number}};
type Operation='create'|'update'|'commit'|'close'|'reopen';
const isUUID=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function client(){return (await import('../live/client')).liveClient()}
function newId():string {
 const c=globalThis.crypto;
 if(c?.randomUUID)return c.randomUUID();
 if(!c?.getRandomValues)throw new LemmaError('server','Secure operation ID unavailable');
 const b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function liveId(value:string):string {
 id(value);
 if(!isUUID(value))invalid('Invalid day plan UUID');
 return value;
}
function fail(error:SqlError):LemmaError {
 const msg=error.message??'Day plan operation failed';
 if(error.code==='23505'||/conflict|version|stale|duplicate|already|preview changed/i.test(msg))
  return new LemmaError('conflict',msg);
 if(/not found|no rows/i.test(msg))return new LemmaError('not_found',msg);
 if(['23514','23503','22P02','22007'].includes(error.code??'')||
  /invalid|required|unsupported|constraint|must be/i.test(msg))return new LemmaError('invalid',msg);
 if(['42501','PGRST301'].includes(error.code??''))return new LemmaError('auth',msg);
 return new LemmaError('server',msg);
}
function unwrap<T>(r:{data:T|null;error:SqlError|null}):T {
 if(r.error)throw fail(r.error);
 return r.data as T;
}
function json<T>(v:unknown):T {
 if(typeof v==='string'){
  try{return JSON.parse(v) as T}catch{throw new LemmaError('server','Malformed server JSON')}
 }
 return v as T;
}
function fromItem(row:Row):DayPlanItem{
 return {id:String(row.id),planId:String(row.day_plan_id),taskId:String(row.task_id),
  calendarBlockId:row.calendar_block_id==null?null:String(row.calendar_block_id),
  disposition:row.disposition as DayPlanItem['disposition'],
  reason:row.reason==null?null:String(row.reason),position:Number(row.position)};
}
function fromPlan(row:Row,items:DayPlanItem[]):DayPlanRecord{
 return {id:String(row.id),planDate:String(row.plan_date),timeZone:String(row.time_zone),
  intention:String(row.intention),capacityMinutes:Number(row.capacity_minutes),
  availability:json<DayAvailability>(row.availability),status:row.status as DayPlanRecord['status'],
  closedAt:row.closed_at==null?null:String(row.closed_at),
  tomorrowFirstTaskId:row.tomorrow_first_task_id==null?null:String(row.tomorrow_first_task_id),
  ritual:json<DayPlanRitual>(row.ritual),items,source:row.source as DayPlanRecord['source'],
  version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};
}
function snakeItems(input:NewDayPlanItem[]):Row[]{
 return input.map(i=>({task_id:i.taskId,calendar_block_id:i.calendarBlockId,
  disposition:i.disposition,reason:i.reason,position:i.position}));
}
function payload(p:NewDayPlan|DayPlanPatch|DayClosure):Row {
 const out:Row={};
 const columns:Record<string,string>={planDate:'plan_date',timeZone:'time_zone',
  intention:'intention',capacityMinutes:'capacity_minutes',availability:'availability',
  items:'items',ritual:'ritual',status:'status',tomorrowFirstTaskId:'tomorrow_first_task_id'};
 for(const [key,val] of Object.entries(p)){
  if(!(key in columns))invalid('Unsupported day plan field '+key);
  out[columns[key]]=key==='items'?snakeItems(val as NewDayPlanItem[]):val;
 }
 return out;
}
export function createLiveDayPlanApi():DayPlanApi{
 const retryIds=new Map<string,string>();
 async function readChildren(ids:string[]):Promise<Map<string,DayPlanItem[]>>{
  const grouped=new Map<string,DayPlanItem[]>();
  if(!ids.length)return grouped;
  // Parent page is capped at 50. Child records are always filtered by its IDs.
  const api=await client();
  const rows=unwrap<Row[]>(await api.from('day_plan_items').select('*')
   .in('day_plan_id',ids).order('position',{ascending:true}).order('id',{ascending:true}));
  for(const row of rows){
   const p=fromItem(row);
   if(!ids.includes(p.planId))throw new LemmaError('server','Unexpected owner plan item');
   const items=grouped.get(p.planId)??[];
   items.push(p);grouped.set(p.planId,items);
  }
  return grouped;
 }
 async function read(planId:string):Promise<DayPlanRecord|null>{
  const validId=liveId(planId);const api=await client();
  const parent=unwrap<Row|null>(await api.from('day_plans').select('*')
   .eq('id',validId).maybeSingle());
  if(!parent)return null;
  const children=await readChildren([validId]);
  return fromPlan(parent,children.get(validId)??[]);
 }
 async function requiredRead(planId:string):Promise<DayPlanRecord>{
  const row=await read(planId);
  if(!row)throw new LemmaError('not_found','Day plan not visible after command');
  return row;
 }
 async function write(operation:Operation,args:Row):Promise<StudyReceipt<DayPlanRecord>>{
  const base={schemaVersion:1,resource:'day_plans',operation,...args};
  const signature=JSON.stringify(base),operationId=retryIds.get(signature)??newId();
  let acknowledged=false;
  try{
   const api=await client();
   const receipt=unwrap<Response>(await api.rpc('day_plans_command',{p:{operationId,...base}}));
   if(receipt?.status==='conflict')throw new LemmaError('conflict','Day plan changed (current version '+
    (receipt.conflict?.currentVersion??'unknown')+')');
   if(receipt?.status!=='ok'||!Array.isArray(receipt.changed)||
    receipt.changed.length!==1||!isUUID(receipt.changed[0].id)||
    !Number.isSafeInteger(receipt.changed[0].version)||receipt.changed[0].version<1)
    throw new LemmaError('server','Invalid day_plans_command receipt');
   acknowledged=true;
   const record=await requiredRead(receipt.changed[0].id);
   if(record.version!==receipt.changed[0].version)
    throw new LemmaError('server','Owner read did not match committed version');
   retryIds.delete(signature);
   return {record,actionNo:Number.isSafeInteger(receipt.actionNo)?receipt.actionNo!:null};
  }catch(error){
   if(acknowledged||!(error instanceof LemmaError)||error.code==='server'||error.code==='offline')
    retryIds.set(signature,operationId);
   else retryIds.delete(signature);
   throw error;
  }
 }
 async function change(operation:Operation,planId:string,expectedVersion:number,p:DayPlanPatch|DayClosure={}){
  liveId(planId);version(expectedVersion);
  return write(operation,{target:{id:planId},expectedVersion,patch:payload(p)});
 }
 return {
  mode:'live',
  async listDayPlans(raw:DayPlanQuery={}){
   const opts=query(raw),cursor=decodeCursor(raw.cursor,opts);
   if(cursor)liveId(cursor.id);
   const api=await client();
   const filter=<T extends {eq:(a:string,b:string)=>T;gte:(a:string,b:string)=>T;lte:(a:string,b:string)=>T}>(b:T):T=>{
    let q=b;
    if(opts.status!=='all')q=q.eq('status',opts.status);
    if(opts.fromDate)q=q.gte('plan_date',opts.fromDate);
    if(opts.toDate)q=q.lte('plan_date',opts.toDate);
    return q;
   };
   const counted=await filter(api.from('day_plans').select('id',{count:'exact',head:true}));
   if(counted.error)throw fail(counted.error);
   if(counted.count===null||!Number.isSafeInteger(counted.count)||counted.count<0)
    throw new LemmaError('server','Day plan total unavailable');
   let queryBuilder=filter(api.from('day_plans').select('*'));
   if(cursor)queryBuilder=queryBuilder.or('plan_date.gt.'+cursor.date+
    ',and(plan_date.eq.'+cursor.date+',id.gt.'+cursor.id+')');
   const rows=unwrap<Row[]>(await queryBuilder.order('plan_date',{ascending:true})
    .order('id',{ascending:true}).limit(opts.limit+1));
   const parents=rows.slice(0,opts.limit);
   const ids=parents.map(p=>String(p.id));
   const children=await readChildren(ids);
   const items=parents.map(p=>fromPlan(p,children.get(String(p.id))??[]));
   return {items,total:counted.count!,nextCursor:rows.length>opts.limit&&items.length?
    encodeCursor(items[items.length-1],opts):null};
  },
  getDayPlan:read,
  async createDayPlan(input:NewDayPlan){
   const n=newPlan(input);
   return write('create',{patch:payload(n)});
  },
  updateDayPlan:(planId,expected,p)=>change('update',planId,expected,patch(p)),
  commitDayPlan:(planId,expected)=>change('commit',planId,expected),
  closeDayPlan:(planId,expected,detail:DayClosure={})=>change('close',planId,expected,closure(detail)),
  reopenDayPlan:(planId,expected)=>change('reopen',planId,expected),
 };
}
