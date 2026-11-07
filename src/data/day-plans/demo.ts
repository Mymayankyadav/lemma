// N60.2: per-tab day-plan fixture with reload-safe, versioned lifecycle.
import type {DayPlanApi,DayPlanItem,DayPlanPage,DayPlanRecord,DayPlanQuery,DayPlanStatus,NewDayPlanItem,PlanAvailability,PlanSourceResource} from './contract';
import {DayPlanError} from './contract';
import {civilPlanDate,comparePlanSources,normalizeAvailability,normalizeDayPlan,normalizePlanItems,validatePlanClosure} from './model';
import {getTaskApi} from '../tasks';
import {getStudyApi} from '../study';

const KEY='lemma.v6.demo.day-plans.v1';
type Store={schema:1;plans:DayPlanRecord[];items:DayPlanItem[]};
type Resolver=(resource:PlanSourceResource,id:string,date:string)=>Promise<number|null>;
const copy=<T>(value:T):T=>structuredClone(value);
const error=(code:'invalid'|'conflict'|'not_found',message:string):never=>{throw new DayPlanError(code,message);};
let counter=0;
const uid=()=>globalThis.crypto?.randomUUID?.()??'demo-plan-'+Date.now()+'-'+(++counter);
const now=()=>new Date().toISOString();
const seed=():Store=>({schema:1,plans:[{
 id:'demo-plan-1',planDate:'2026-11-01',timeZone:'Asia/Kolkata',
 intention:'One focused proof',capacityMinutes:90,availability:{sources:[]},
 status:'draft',closedAt:null,tomorrowFirstTaskId:null,ritual:{},
 version:1,createdAt:'2026-11-01T08:00:00.000Z',updatedAt:'2026-11-01T08:00:00.000Z',
}],items:[]});
const safeRead=():Store|null=>{
 try{
  const raw=sessionStorage.getItem(KEY);if(!raw)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object')return null;
  const store=value as Store;
  if(store.schema!==1||!Array.isArray(store.plans)||!Array.isArray(store.items))return null;
  const seen=new Set<string>(),dates=new Set<string>();
  for(const p of store.plans){
   if(typeof p.id!=='string'||!p.id||seen.has(p.id)||dates.has(p.planDate)||
      !Number.isSafeInteger(p.version)||p.version<1)return null;
   seen.add(p.id);dates.add(p.planDate);
   civilPlanDate(p.planDate);normalizeDayPlan({planDate:p.planDate,timeZone:p.timeZone,
    intention:p.intention,capacityMinutes:p.capacityMinutes,availability:p.availability,
    tomorrowFirstTaskId:p.tomorrowFirstTaskId,ritual:p.ritual});
   validatePlanClosure(p.status,p.closedAt);
  }
  if(store.items.some(i=>!seen.has(i.planId)||!Number.isSafeInteger(i.version)||i.version<1))return null;
  return store;
 }catch{return null;}
};
const persist=(data:Store)=>{
 try{sessionStorage.setItem(KEY,JSON.stringify(data));}catch{/* in-memory fixture remains usable */}
};
const encode=(value:unknown):string=>btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(text:string,signature:string,kind:string):string[]=>{
 try{
  if(typeof text!=='string'||text.length>1024||!/^[a-zA-Z0-9_-]{5,}$/.test(text))return error('invalid','Invalid day-plan cursor');
  const value:unknown=JSON.parse(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4)));
  if(!value||typeof value!=='object')return error('invalid','Invalid day-plan cursor');
  const token=value as {v:number;f:string;k:string;key:string[]};
  if(token.v!==1||token.f!==signature||token.k!==kind||!Array.isArray(token.key)||
     token.key.some(v=>typeof v!=='string'))return error('invalid','Day-plan cursor belongs to a different filter');
  return token.key;
 }catch{return error('invalid','Invalid day-plan cursor');}
};
const pageSize=(n:number|undefined):number=>{
 const result=n??20;
 if(!Number.isSafeInteger(result)||result<1||result>50)return error('invalid','Day-plan pages must contain 1–50 rows');
 return result;
};
function ownerDay(zone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=(name:string)=>parts.find(p=>p.type===name)?.value??'';
 return part('year')+'-'+part('month')+'-'+part('day');
}
async function actualVersion(resource:PlanSourceResource,id:string,date:string):Promise<number|null>{
 if(resource==='tasks')return (await getTaskApi().getTask(id))?.version??null;
 // A civil day in any IANA zone can straddle UTC by less than a day.
 const middle=Date.parse(date+'T00:00:00Z');
 const start=new Date(middle-86400000).toISOString();
 const end=new Date(middle+172800000).toISOString();
 const blocks=await getStudyApi().listCalendarBlocks({start,end});
 return blocks.find(b=>b.id===id)?.version??null;
}
const match=(a:DayPlanRecord,b:DayPlanRecord)=>a.planDate.localeCompare(b.planDate)||a.id.localeCompare(b.id);
const planKey=(p:DayPlanRecord)=>[p.planDate,p.id];
const itemKey=(p:DayPlanItem)=>[String(p.position).padStart(12,'0'),p.id];
const after=(a:string[],b:string[])=>a.join('\u0000')>b.join('\u0000');
export function createDemoDayPlanApi(resolve:Resolver=actualVersion):DayPlanApi{
 let snapshot=safeRead()??seed();persist(snapshot);
 const latest=()=>{snapshot=safeRead()??snapshot;return snapshot;};
 const save=(s:Store)=>{snapshot=s;persist(s);};
 const get=(id:string):DayPlanRecord=>{
  const found=latest().plans.find(p=>p.id===id);
  return found??error('not_found','Day plan was not found');
 };
 const expected=(id:string,v:number):DayPlanRecord=>{
  const p=get(id);
  if(!Number.isSafeInteger(v)||v<1||p.version!==v)error('conflict','Day plan changed elsewhere');
  return p;
 };
 const change=(row:DayPlanRecord,patch:Partial<DayPlanRecord>,items?:DayPlanItem[])=>{
  const s=latest(),record:DayPlanRecord={...row,...patch,version:row.version+1,updatedAt:now()};
  validatePlanClosure(record.status,record.closedAt);
  save({schema:1,plans:s.plans.map(p=>p.id===row.id?record:p),
   items:items??s.items});
  return {record:copy(record),actionNo:null};
 };
 const verify=async(availability:PlanAvailability,date:string)=>{
  const captured=normalizeAvailability(availability);
  const versions=await Promise.all(captured.sources.map(async source=>({
   ...source,version:await resolve(source.resource,source.id,date),
  })));
  const current={sources:versions.filter((s):s is typeof s & {version:number}=>s.version!==null)};
  if(!comparePlanSources(captured,current).ok)error('conflict','Plan availability changed since preview');
 };
 return {
  mode:'demo',
  async listPlans(query:DayPlanQuery={}):Promise<DayPlanPage>{
   const limit=pageSize(query.limit);
   const from=query.from===undefined?null:civilPlanDate(query.from);
   const through=query.through===undefined?null:civilPlanDate(query.through);
   if(from&&through&&from>through)error('invalid','Invalid day-plan date range');
   if(query.status!==undefined&&(!Array.isArray(query.status)||
       query.status.some(x=>!(['draft','previewed','committed','closed'] as DayPlanStatus[]).includes(x))))
    error('invalid','Invalid day-plan status filter');
   const states=query.status===undefined?null:[...new Set(query.status)].sort();
   const signature=JSON.stringify([from,through,states]);
   const cursor=query.cursor==null?null:decode(query.cursor,signature,'plan');
   if(cursor&&cursor.length!==2)error('invalid','Invalid day-plan cursor');
   const all=latest().plans.filter(p=>(!from||p.planDate>=from)&&(!through||p.planDate<=through)&&
      (!states||states.includes(p.status))).sort(match);
   const remaining=cursor?all.filter(p=>after(planKey(p),cursor)):all;
   const rows=remaining.slice(0,limit);
   return {items:copy(rows),total:all.length,nextCursor:remaining.length>limit&&rows.length?
      encode({v:1,f:signature,k:'plan',key:planKey(rows[rows.length-1])}):null};
  },
  async getPlan(id){return copy(latest().plans.find(p=>p.id===id)??null);},
  async listItems(planId,query={}){
   get(planId);
   const limit=pageSize(query.limit),signature=planId;
   const cursor=query.cursor==null?null:decode(query.cursor,signature,'item');
   if(cursor&&cursor.length!==2)error('invalid','Invalid day-plan item cursor');
   const all=latest().items.filter(i=>i.planId===planId)
    .sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
   const remaining=cursor?all.filter(i=>after(itemKey(i),cursor)):all;
   const rows=remaining.slice(0,limit);
   return {items:copy(rows),total:all.length,nextCursor:remaining.length>limit&&rows.length?
     encode({v:1,f:signature,k:'item',key:itemKey(rows[rows.length-1])}):null};
  },
  async createPlan(input){
   const normalized=normalizeDayPlan(input),s=latest();
   if(s.plans.some(p=>p.planDate===normalized.planDate))
    error('conflict','A day plan already exists for this civil date');
   const at=now(),row:DayPlanRecord={id:uid(),...normalized,status:'draft',
    closedAt:null,version:1,createdAt:at,updatedAt:at};
   save({...s,plans:[...s.plans,row]});
   return {record:copy(row),actionNo:null};
  },
  async updatePlan(id,version,patch){
   const row=expected(id,version);
   if(row.status!=='draft'&&row.status!=='previewed')
    error('conflict','Only an open draft may be updated');
   const fields={planDate:row.planDate,timeZone:row.timeZone,intention:row.intention,
    capacityMinutes:row.capacityMinutes,availability:row.availability,
    tomorrowFirstTaskId:row.tomorrowFirstTaskId,ritual:row.ritual};
   if(!patch||typeof patch!=='object'||Array.isArray(patch)||
      Object.keys(patch).some(key=>!Object.hasOwn(fields,key)))error('invalid','Unknown day-plan patch');
   const normalized=normalizeDayPlan({...fields,...patch});
   return change(row,{...normalized,status:'draft',closedAt:null},
    latest().items.filter(i=>i.planId!==id));
  },
  async previewPlan(id,version,items:NewDayPlanItem[],availability:PlanAvailability){
   const row=expected(id,version);
   if(row.status!=='draft'&&row.status!=='previewed')
    error('conflict','Only a draft can be previewed');
   const prepared=normalizePlanItems(items),sources=normalizeAvailability(availability);
   if(prepared.length>500||sources.sources.length>1000)error('invalid','Plan preview is too large');
   for(const i of prepared){
    if(!sources.sources.some(s=>s.resource==='tasks'&&s.id===i.taskId)||
      (i.blockId&&!sources.sources.some(s=>s.resource==='calendar_blocks'&&s.id===i.blockId)))
      error('invalid','Plan item absent from captured availability');
   }
   await verify(sources,row.planDate);
   // Version and status can change while the read above is in progress.
   expected(id,version);
   const child:DayPlanItem[]=prepared.map(i=>({id:uid(),planId:id,taskId:i.taskId,
    blockId:i.blockId??null,disposition:i.disposition,reason:i.reason??null,
    position:i.position,version:1}));
   return change(row,{availability:sources,status:'previewed'},
    [...latest().items.filter(i=>i.planId!==id),...child]);
  },
  async commitPlan(id,version){
   const row=expected(id,version);
   if(row.status!=='previewed')error('conflict','Only previewed plans can commit');
   await verify(row.availability,row.planDate);
   expected(id,version);
   return change(row,{status:'committed'});
  },
  async closePlan(id,version,ritual){
   const row=expected(id,version);
   if(row.status!=='committed')error('conflict','Only committed plans can close');
   if(row.planDate>ownerDay(row.timeZone))
    error('invalid','A future date cannot be closed');
   const normalized=normalizeDayPlan({planDate:row.planDate,timeZone:row.timeZone,
    ritual:ritual??row.ritual});
   return change(row,{status:'closed',closedAt:now(),ritual:normalized.ritual});
  },
  async reopenPlan(id,version){
   const row=expected(id,version);
   if(row.status!=='closed')error('conflict','Only closed plans may reopen');
   return change(row,{status:'committed',closedAt:null});
  },
 };
}
