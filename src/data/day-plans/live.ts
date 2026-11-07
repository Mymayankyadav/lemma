// N60.2: owner-RLS reads and one atomic day_plans_command RPC per mutation.
// Browser never supplies an owner or writes plan tables directly.
import type {DayPlanApi,DayPlanItem,DayPlanItemPage,DayPlanPage,
 DayPlanPatch,DayPlanQuery,DayPlanRecord,DayPlanStatus,
 NewDayPlan,NewDayPlanItem,PlanAvailability} from './contract';
import {DayPlanError} from './contract';
import {civilPlanDate,normalizeAvailability,normalizeDayPlan,
 normalizePlanItems,validatePlanClosure} from './model';

type Row=Record<string,unknown>;
type Reply={data:unknown;error:{code?:string;message?:string}|null};
type Changed={resource:string;id:string;version:number};
type Receipt={status:'ok'|'conflict';actionNo?:number|null;
 changed?:Changed[];plan?:Row;conflict?:{currentVersion?:number;reason?:string}};
type Operation='create'|'update'|'preview'|'commit'|'close'|'reopen';
type Envelope={operationId:string;schemaVersion:1;resource:'day_plans';
 operation:Operation;patch:Row;target?:{id:string};expectedVersion?:number};
type Cursor={v:1;filter:string;sort:string;id:string};
const clone=<T>(x:T):T=>structuredClone(x);
const statuses:DayPlanStatus[]=['draft','previewed','committed','closed'];
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new DayPlanError(code,message);
};
function id(value:unknown):string{
 if(typeof value!=='string'||!value.trim()||value.length>256)
  return fail('invalid','Expected a day-plan record ID');
 return value;
}
function version(value:unknown):number{
 if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>2147483647)
  return fail('invalid','Expected a positive day-plan version');
 return value as number;
}
function date(value:unknown):string{
 if(typeof value!=='string')return fail('invalid','Expected an owner civil date');
 return civilPlanDate(value);
}
function instant(value:unknown):string{
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||
  !/(Z|[+-][0-9]{2}:[0-9]{2})$/i.test(value))
  return fail('invalid','Invalid saved instant');
 return new Date(value).toISOString();
}
function jsonObject(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))
  return fail('invalid','Expected JSON object');
 return clone(value as Record<string,unknown>);
}
function planRow(row:Row):DayPlanRecord{
 const input=normalizeDayPlan({
  planDate:date(row.plan_date),timeZone:String(row.time_zone),
  intention:row.intention as string,capacityMinutes:row.capacity_minutes as number,
  availability:row.availability as PlanAvailability,
  tomorrowFirstTaskId:row.tomorrow_first_task_id as string|null,
  ritual:jsonObject(row.ritual),
 });
 const status=row.status as DayPlanStatus;
 if(!statuses.includes(status))return fail('invalid','Invalid saved day-plan status');
 const closedAt=row.closed_at==null?null:instant(row.closed_at);
 validatePlanClosure(status,closedAt);
 return {id:id(row.id),...input,status,closedAt,version:version(row.version),
  createdAt:instant(row.created_at),updatedAt:instant(row.updated_at)};
}
function itemRow(row:Row):DayPlanItem{
 const [value]=normalizePlanItems([{taskId:row.task_id as string,
  blockId:row.calendar_block_id as string|null,
  disposition:row.disposition as DayPlanItem['disposition'],
  reason:row.reason as string|null,position:row.position as number}]);
 return {id:id(row.id),planId:id(row.plan_id),taskId:value.taskId,
  blockId:value.blockId??null,disposition:value.disposition,
  reason:value.reason??null,position:value.position,version:version(row.version)};
}
function encode(cursor:Cursor):string{
 return btoa(JSON.stringify(cursor)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(raw:string|null|undefined,filter:string):Cursor|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||raw.length>1024||!/^[A-Za-z0-9_-]{8,1024}$/.test(raw))
   return fail('invalid','Invalid day-plan cursor');
  const data:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4)));
  if(!data||typeof data!=='object'||Array.isArray(data))
   return fail('invalid','Invalid day-plan cursor');
  const c=data as Cursor;
  if(c.v!==1||c.filter!==filter||typeof c.sort!=='string'||typeof c.id!=='string'||!c.id)
   return fail('invalid','Cursor belongs to another day-plan filter');
  return c;
 }catch{return fail('invalid','Invalid or mismatched day-plan cursor')}
}
function size(value:number|undefined):number{
 const n=value??20;
 if(!Number.isSafeInteger(n)||n<1||n>50)
  return fail('invalid','Page size must be between 1 and 50');
 return n;
}
function object(value:unknown):value is Row{
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function query(q:DayPlanQuery={}){
 if(!object(q)||Object.keys(q).some(k=>!['from','through','status','limit','cursor'].includes(k)))
  return fail('invalid','Invalid day-plan query fields');
 const from=q.from===undefined?null:date(q.from),through=q.through===undefined?null:date(q.through);
 if(from&&through&&from>through)return fail('invalid','Invalid civil date range');
 const selected=q.status??statuses;
 if(!Array.isArray(selected)||selected.some(x=>!statuses.includes(x))||
    new Set(selected).size!==selected.length)
  return fail('invalid','Invalid plan status filter');
 const status=statuses.filter(x=>selected.includes(x)),filter=JSON.stringify([from,through,status]);
 return {limit:size(q.limit),from,through,status,filter,cursor:decode(q.cursor,filter)};
}
function itemQuery(planId:string,q:{limit?:number;cursor?:string|null}={}){
 if(!object(q)||Object.keys(q).some(k=>!['limit','cursor'].includes(k)))
  return fail('invalid','Invalid day-plan item query fields');
 const filter=JSON.stringify([planId]);
 return {limit:size(q.limit),filter,cursor:decode(q.cursor,filter)};
}
function paged<T extends {id:string}>(all:T[],n:number,cursor:Cursor|null,
 sort:(row:T)=>string,filter:string){
 const remaining=all.filter(r=>!cursor||sort(r)>cursor.sort||
  sort(r)===cursor.sort&&r.id>cursor.id);
 const items=remaining.slice(0,n),last=items.at(-1);
 return {items:clone(items),total:all.length,nextCursor:last&&remaining.length>n?
  encode({v:1,sort:sort(last),id:last.id,filter}):null};
}
async function client(){
 return (await import('../live/client')).liveClient();
}
function mapError(e:{code?:string;message?:string}):Error{
 const m=e.message??'Day-plan command failed',c=e.code??'';
 if(c==='PGRST202'||c==='42883'||/function.*not.*found/i.test(m))
  return new Error('day_plans_command N46.2 not deployed; no write applied');
 if(c==='23505'||/duplicate|stale|version|conflict|already exists|already closed/i.test(m))
  return new DayPlanError('conflict',m);
 if(/not found|not visible|missing for owner/i.test(m))
  return new DayPlanError('not_found',m);
 if(['23503','23514','22P02','22007','22008'].includes(c)||
    /invalid|required|unsupported|unknown|only .* plan|cannot/i.test(m))
  return new DayPlanError('invalid',m);
 return new Error(m);
}
function check(reply:{error:{code?:string;message?:string}|null}):void{
 if(reply.error)throw mapError(reply.error);
}
function randomId():string{
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 if(!globalThis.crypto?.getRandomValues)return fail('invalid','Secure operation IDs unavailable');
 const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function patchColumns(input:Record<string,unknown>):Row{
 const result:Row={};
 for(const [field,col] of [
  ['planDate','plan_date'],['timeZone','time_zone'],['intention','intention'],
  ['capacityMinutes','capacity_minutes'],['availability','availability'],
  ['tomorrowFirstTaskId','tomorrow_first_task_id'],['ritual','ritual'],
 ] as const){
  if(Object.hasOwn(input,field))result[col]=input[field];
 }
 return result;
}
function validatePatch(input:DayPlanPatch):Row{
 if(!object(input)||!Object.keys(input).length||
    Object.keys(input).some(k=>!['timeZone','intention','capacityMinutes','availability',
      'tomorrowFirstTaskId','ritual'].includes(k)))
  return fail('invalid','Unknown or empty day-plan patch');
 // The command and SQL perform the same field and source checks.
 const check=normalizeDayPlan({planDate:'2026-11-07',
  timeZone:input.timeZone??'UTC',intention:input.intention??'',
  capacityMinutes:input.capacityMinutes??0,
  availability:input.availability??{sources:[]},
  tomorrowFirstTaskId:input.tomorrowFirstTaskId??null,ritual:input.ritual??{}});
 const raw:Row={};
 for(const key of Object.keys(input))raw[key]=check[key as keyof typeof check];
 return patchColumns(raw);
}
function itemsForPreview(input:NewDayPlanItem[]):Row[]{
 if(!Array.isArray(input)||input.length>500)
  return fail('invalid','Plan preview has more than 500 items');
 return normalizePlanItems(input).map(i=>({
  task_id:i.taskId,calendar_block_id:i.blockId??null,
  disposition:i.disposition,reason:i.reason??null,position:i.position,
 }));
}
async function scan(table:'day_plans'|'day_plan_items',planId?:string):Promise<Row[]>{
 const api=await client(),rows:Row[]=[];
 for(let start=0;start<=20000;start+=50){
  let builder=api.from(table).select('*');
  if(planId)builder=builder.eq('plan_id',planId);
  const reply=await builder.range(start,start+49);
  check(reply);
  if(!Array.isArray(reply.data)||reply.data.length>50)
   throw new Error('Malformed RLS day-plan page');
  rows.push(...reply.data as Row[]);
  if(reply.data.length<50)return rows;
 }
 throw new Error('Owner day-plan scan exceeded safety bound');
}
export function createLiveDayPlanApi():DayPlanApi{
 const pending=new Map<string,Envelope>();
 async function readPlan(key:string):Promise<DayPlanRecord|null>{
  const api=await client();
  const reply=await api.from('day_plans').select('*').eq('id',id(key)).maybeSingle();
  check(reply);
  return reply.data===null?null:planRow(reply.data as Row);
 }
 async function command(operation:Operation,patch:Row,target?:string,expected?:number){
  const base:Omit<Envelope,'operationId'>={schemaVersion:1,resource:'day_plans',
   operation,patch,...(target?{target:{id:id(target)},expectedVersion:version(expected)}:{})};
  const sig=JSON.stringify(base);
  const envelope:Envelope=pending.get(sig)??{...base,operationId:randomId()};
  pending.set(sig,envelope);
  try{
   const api=await client();
   const reply=await api.rpc('day_plans_command',{p:envelope}) as Reply;
   check(reply);
   const result=reply.data as Receipt|null;
   if(result?.status==='conflict')
    return fail('conflict','Day plan or operationId conflict (current version '+
     (result.conflict?.currentVersion??'unknown')+'): '+(result.conflict?.reason??'stale'));
   if(result?.status!=='ok'||!Array.isArray(result.changed)||result.changed.length<1||
     result.changed[0].resource!=='day_plans'||!Number.isSafeInteger(result.actionNo)||
     (result.actionNo as number)<1)
    throw new Error('Invalid or unaudited day-plan command receipt');
   const changed=result.changed[0],record=planRow(result.plan as Row);
   if(changed.id!==record.id||changed.version!==record.version||
     (target&&changed.id!==target))
    throw new Error('Day-plan command changed the wrong owner record');
   // Verify through the owner RLS, but retain the same id on uncertain readback failure.
   const visible=await readPlan(changed.id);
   if(!visible||visible.version!==record.version||visible.status!==record.status)
    throw new Error('Day-plan command outcome not visible through owner RLS');
   pending.delete(sig);
   return {record:clone(visible),actionNo:result.actionNo as number};
  }catch(error){
   if(error instanceof DayPlanError)pending.delete(sig);
   throw error;
  }
 }
 return {
  mode:'live',
  async listPlans(q:DayPlanQuery={}):Promise<DayPlanPage>{
   const opts=query(q);
   const all=(await scan('day_plans')).map(planRow).filter(p=>
    (!opts.from||p.planDate>=opts.from)&&(!opts.through||p.planDate<=opts.through)&&
    opts.status.includes(p.status))
    .sort((a,b)=>a.planDate.localeCompare(b.planDate)||a.id.localeCompare(b.id));
   return paged(all,opts.limit,opts.cursor,r=>r.planDate,opts.filter);
  },
  getPlan:readPlan,
  async listItems(planId:string,q={}):Promise<DayPlanItemPage>{
   const key=id(planId),opts=itemQuery(key,q);
   if(!await readPlan(key))return fail('not_found','Day plan not visible to owner');
   const all=(await scan('day_plan_items',key)).map(itemRow)
    .sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
   return paged(all,opts.limit,opts.cursor,r=>String(r.position).padStart(12,'0'),opts.filter);
  },
  createPlan(input:NewDayPlan){
   const normalized=normalizeDayPlan(input);
   return command('create',patchColumns(normalized));
  },
  updatePlan(key,expected,patch){
   return command('update',validatePatch(patch),id(key),version(expected));
  },
  previewPlan(key,expected,items,availability){
   const sources=normalizeAvailability(availability),staged=itemsForPreview(items);
   const seen=new Set(sources.sources.map(s=>s.resource+':'+s.id));
   if(staged.some(i=>!seen.has('tasks:'+i.task_id)||
     i.calendar_block_id&&!seen.has('calendar_blocks:'+i.calendar_block_id)))
    return Promise.reject(new DayPlanError('invalid','Preview item is absent from source snapshot'));
   return command('preview',{availability:sources,items:staged},id(key),version(expected));
  },
  commitPlan:(key,expected)=>command('commit',{},id(key),version(expected)),
  closePlan:(key,expected,ritual)=>{
   if(ritual!==undefined)jsonObject(ritual);
   return command('close',ritual===undefined?{}:{ritual:jsonObject(ritual)},id(key),version(expected));
  },
  reopenPlan:(key,expected)=>command('reopen',{},id(key),version(expected)),
 };
}
