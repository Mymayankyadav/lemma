// N60.2: isolated, tab-local day plans. Preview and commit never fabricate a task.
import type {DayPlanApi,DayPlanItem,DayPlanItemPage,DayPlanPage,DayPlanPatch,
 DayPlanQuery,DayPlanRecord,DayPlanStatus,NewDayPlan,NewDayPlanItem,
 PlanAvailability} from './contract';
import {DayPlanError} from './contract';
import {civilPlanDate,comparePlanSources,normalizeAvailability,normalizeDayPlan,
 normalizePlanItems,validatePlanClosure} from './model';
import {getTaskApi} from '../tasks';
import {getStudyApi} from '../study';

const KEY='lemma.v6.demo.day-plans.v1';
const clone=<T>(x:T):T=>structuredClone(x);
type Snapshot={schema:1;plans:DayPlanRecord[];items:DayPlanItem[]};
type Cursor={v:1;filter:string;sort:string;id:string};
const statuses:DayPlanStatus[]=['draft','previewed','committed','closed'];
const fail=(code:'invalid'|'conflict'|'not_found',msg:string):never=>{throw new DayPlanError(code,msg)};
let serial=0;
function id():string{
 return globalThis.crypto?.randomUUID?.()??'demo-day-'+Date.now()+'-'+(++serial);
}
function dateOrNull(value:string|undefined):string|null{
 return value===undefined?null:civilPlanDate(value);
}
function requiredVersion(value:number):number{
 if(!Number.isSafeInteger(value)||value<1||value>2147483647)
  return fail('invalid','Expected a positive day-plan version');
 return value;
}
function limit(value:number|undefined):number{
 const n=value??20;
 if(!Number.isSafeInteger(n)||n<1||n>50)return fail('invalid','Page limit must be 1–50');
 return n;
}
function object(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function read():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);
  if(raw===null)return null;
  const data:unknown=JSON.parse(raw);
  if(!object(data)||data.schema!==1||!Array.isArray(data.plans)||!Array.isArray(data.items))return null;
  const plans=data.plans as DayPlanRecord[],items=data.items as DayPlanItem[];
  if(new Set(plans.map(p=>p.id)).size!==plans.length||
     new Set(plans.map(p=>p.planDate)).size!==plans.length||
     new Set(items.map(i=>i.id)).size!==items.length)return null;
  for(const p of plans){
   if(!p||typeof p.id!=='string'||!p.id||!statuses.includes(p.status)||
     requiredVersion(p.version)!==p.version||
     !Number.isFinite(Date.parse(p.createdAt))||!Number.isFinite(Date.parse(p.updatedAt)))return null;
   const valid=normalizeDayPlan({planDate:p.planDate,timeZone:p.timeZone,intention:p.intention,
    capacityMinutes:p.capacityMinutes,availability:p.availability,
    tomorrowFirstTaskId:p.tomorrowFirstTaskId,ritual:p.ritual});
   if(!valid||validatePlanClosure(p.status,p.closedAt)!==undefined)return null;
  }
  const grouped=new Map<string,number[]>();
  for(const i of items){
   if(!plans.some(p=>p.id===i.planId)||!i.id||!Number.isSafeInteger(i.version)||i.version<1)
    return null;
   normalizePlanItems([{taskId:i.taskId,blockId:i.blockId,disposition:i.disposition,
    reason:i.reason,position:i.position}]);
   const positions=grouped.get(i.planId)??[];
   if(positions.includes(i.position))return null;
   positions.push(i.position);grouped.set(i.planId,positions);
  }
  return clone({schema:1,plans,items});
 }catch{return null;}
}
function persist(snapshot:Snapshot):void{
 try{sessionStorage.setItem(KEY,JSON.stringify(snapshot))}
 catch{/* Private tabs can deny storage; this adapter retains its snapshot. */}
}
function encode(value:Cursor):string{
 return btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(raw:string|null|undefined,filter:string):Cursor|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||raw.length>1024||!/^[A-Za-z0-9_-]{8,1024}$/.test(raw))
   return fail('invalid','Invalid day-plan cursor');
  const v:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-raw.length%4)%4)));
  if(!object(v)||v.v!==1||v.filter!==filter||typeof v.id!=='string'||!v.id||
    typeof v.sort!=='string')return fail('invalid','Wrong day-plan cursor');
  return v as Cursor;
 }catch{return fail('invalid','Invalid or mismatched day-plan cursor')}
}
function page<T extends {id:string}>(rows:T[],n:number,cursor:Cursor|null,
 sort:(row:T)=>string,filter:string):{items:T[];total:number;nextCursor:string|null}{
 const after=rows.filter(row=>!cursor||sort(row)>cursor.sort||
   sort(row)===cursor.sort&&row.id>cursor.id);
 const items=after.slice(0,n),last=items.at(-1);
 return {items:clone(items),total:rows.length,
  nextCursor:last&&after.length>n?encode({v:1,filter,sort:sort(last),id:last.id}):null};
}
function listQuery(q:DayPlanQuery):{limit:number;from:string|null;through:string|null;
 status:DayPlanStatus[];filter:string;cursor:Cursor|null}{
 if(!object(q)||Object.keys(q).some(k=>!['limit','from','through','status','cursor'].includes(k)))
  return fail('invalid','Unknown day-plan query field');
 const n=limit(q.limit),from=dateOrNull(q.from),through=dateOrNull(q.through);
 if(from&&through&&from>through)return fail('invalid','Invalid date bounds');
 const input=q.status??statuses;
 if(!Array.isArray(input)||input.some(s=>!statuses.includes(s))||
    new Set(input).size!==input.length)return fail('invalid','Invalid plan status filter');
 const status=statuses.filter(s=>input.includes(s));
 const filter=JSON.stringify([from,through,status]);
 return {limit:n,from,through,status,filter,cursor:decode(q.cursor,filter)};
}
function itemQuery(q:{limit?:number;cursor?:string|null},id:string){
 if(!object(q)||Object.keys(q).some(k=>!['limit','cursor'].includes(k)))
  return fail('invalid','Unknown day-plan item query field');
 const filter=JSON.stringify([id]);
 return {limit:limit(q.limit),filter,cursor:decode(q.cursor,filter)};
}
function patchValid(base:DayPlanRecord,patch:DayPlanPatch):ReturnType<typeof normalizeDayPlan>{
 if(!object(patch)||!Object.keys(patch).length||
  Object.keys(patch).some(k=>!['timeZone','intention','capacityMinutes','availability',
    'tomorrowFirstTaskId','ritual'].includes(k)))
  return fail('invalid','Invalid or empty day-plan patch');
 return normalizeDayPlan({
  planDate:base.planDate,timeZone:patch.timeZone??base.timeZone,
  intention:patch.intention===undefined?base.intention:patch.intention,
  capacityMinutes:patch.capacityMinutes===undefined?base.capacityMinutes:patch.capacityMinutes,
  availability:patch.availability===undefined?{sources:[]}:patch.availability,
  tomorrowFirstTaskId:patch.tomorrowFirstTaskId===undefined?base.tomorrowFirstTaskId:patch.tomorrowFirstTaskId,
  ritual:patch.ritual===undefined?base.ritual:patch.ritual,
 });
}
async function verifySources(sources:PlanAvailability):Promise<void>{
 const expected=normalizeAvailability(sources);
 const tasks=getTaskApi(),study=getStudyApi();
 const blocks=expected.sources.some(s=>s.resource==='calendar_blocks')?
  await study.listCalendarBlocks({start:'2000-01-01T00:00:00Z',end:'2100-01-01T00:00:00Z'}):[];
 const actual:PlanAvailability={sources:[]};
 for(const source of expected.sources){
  const record=source.resource==='tasks'?await tasks.getTask(source.id):
   blocks.find(b=>b.id===source.id);
  if(record)actual.sources.push({...source,version:record.version});
 }
 if(!comparePlanSources(expected,actual).ok)
  return fail('conflict','Preview source version is stale or no longer owner-visible');
}
function validateSnapshotItems(items:NewDayPlanItem[],availability:PlanAvailability):NewDayPlanItem[]{
 const result=normalizePlanItems(items);
 if(result.length>500)return fail('invalid','Day plan cannot preview more than 500 items');
 const found=new Set(availability.sources.map(s=>s.resource+':'+s.id));
 for(const row of result){
  if(!found.has('tasks:'+row.taskId)||(row.blockId&&!found.has('calendar_blocks:'+row.blockId)))
   return fail('invalid','Plan item is missing from the captured source versions');
 }
 return result;
}
function receipt<T>(record:T){return {record:clone(record),actionNo:null};}
export function createDemoDayPlanApi():DayPlanApi{
 let snapshot:Snapshot=read()??{schema:1,plans:[],items:[]};
 persist(snapshot);
 const current=()=>{snapshot=read()??snapshot;return snapshot;};
 const save=(data:Snapshot)=>{snapshot=clone(data);persist(snapshot)};
 const find=(id:string):DayPlanRecord=>{
  if(typeof id!=='string'||!id.trim())return fail('invalid','Day-plan ID required');
  return current().plans.find(p=>p.id===id)??fail('not_found','Day plan not found');
 };
 const expectVersion=(id:string,version:number)=>{
  requiredVersion(version);
  const found=find(id);
  if(found.version!==version)return fail('conflict','Day plan changed elsewhere (version '+found.version+')');
  return found;
 };
 const replace=(row:DayPlanRecord,newItems?:DayPlanItem[])=>{
  const data=current();
  save({schema:1,plans:data.plans.map(p=>p.id===row.id?row:p),
   items:newItems===undefined?data.items:
    [...data.items.filter(i=>i.planId!==row.id),...newItems]});
 };
 const changed=(row:DayPlanRecord,patch:Partial<DayPlanRecord>)=>({
  ...row,...patch,version:row.version+1,updatedAt:new Date().toISOString()});
 return {
  mode:'demo',
  async listPlans(query:DayPlanQuery={}):Promise<DayPlanPage>{
   const q=listQuery(query);
   const rows=current().plans.filter(p=>(!q.from||p.planDate>=q.from)&&
    (!q.through||p.planDate<=q.through)&&q.status.includes(p.status))
    .sort((a,b)=>a.planDate.localeCompare(b.planDate)||a.id.localeCompare(b.id));
   return page(rows,q.limit,q.cursor,r=>r.planDate,q.filter);
  },
  async getPlan(key){return clone(current().plans.find(p=>p.id===key)??null)},
  async listItems(planId,query={}):Promise<DayPlanItemPage>{
   find(planId);
   const q=itemQuery(query,planId);
   const rows=current().items.filter(i=>i.planId===planId)
    .sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
   return page(rows,q.limit,q.cursor,i=>String(i.position).padStart(12,'0'),q.filter);
  },
  async createPlan(input:NewDayPlan){
   const value=normalizeDayPlan(input);
   await verifySources(value.availability);
   if(current().plans.some(p=>p.planDate===value.planDate))
    return fail('conflict','A day plan already exists on this owner date');
   const at=new Date().toISOString();
   const row:DayPlanRecord={id:id(),...value,status:'draft',closedAt:null,
    version:1,createdAt:at,updatedAt:at};
   const data=current();
   if(data.plans.some(p=>p.planDate===row.planDate))
    return fail('conflict','A day plan already exists on this owner date');
   save({...data,plans:[...data.plans,row]});
   return receipt(row);
  },
  async updatePlan(key,expectedVersion,patch){
   const base=expectVersion(key,expectedVersion);
   if(!['draft','previewed'].includes(base.status))
    return fail('conflict','Only a draft or preview can be updated');
   const valid=patchValid(base,patch);
   await verifySources(valid.availability);
   const currentRow=expectVersion(key,expectedVersion);
   const row=changed(currentRow,{...valid,status:'draft',closedAt:null});
   replace(row,[]);return receipt(row);
  },
  async previewPlan(key,expectedVersion,items,availability){
   const base=expectVersion(key,expectedVersion);
   if(!['draft','previewed'].includes(base.status))
    return fail('conflict','Only a draft can be previewed');
   const valid=normalizeAvailability(availability);
   const work=validateSnapshotItems(items,valid);
   await verifySources(valid);
   const latest=expectVersion(key,expectedVersion);
   const row=changed(latest,{availability:valid,status:'previewed',closedAt:null});
   const staged=work.map(i=>({id:id(),planId:key,taskId:i.taskId,
    blockId:i.blockId??null,disposition:i.disposition,reason:i.reason??null,
    position:i.position,version:1}));
   replace(row,staged);return receipt(row);
  },
  async commitPlan(key,expectedVersion){
   const row=expectVersion(key,expectedVersion);
   if(row.status!=='previewed')return fail('conflict','Only previewed plans can commit');
   await verifySources(row.availability);
   const latest=expectVersion(key,expectedVersion);
   const committed=changed(latest,{status:'committed'});
   replace(committed);return receipt(committed);
  },
  async closePlan(key,expectedVersion,ritual){
   const row=expectVersion(key,expectedVersion);
   if(row.status!=='committed')return fail('conflict','Only a committed day can close');
   const validated=normalizeDayPlan({
    planDate:row.planDate,timeZone:row.timeZone,capacityMinutes:row.capacityMinutes,
    intention:row.intention,availability:row.availability,
    tomorrowFirstTaskId:row.tomorrowFirstTaskId,ritual:ritual??row.ritual});
   const closed=changed(row,{status:'closed',closedAt:new Date().toISOString(),ritual:validated.ritual});
   validatePlanClosure(closed.status,closed.closedAt);
   replace(closed);return receipt(closed);
  },
  async reopenPlan(key,expectedVersion){
   const row=expectVersion(key,expectedVersion);
   if(row.status!=='closed')return fail('conflict','Only closed days can reopen');
   const reopened=changed(row,{status:'committed',closedAt:null});
   validatePlanClosure(reopened.status,reopened.closedAt);
   replace(reopened);return receipt(reopened);
  },
 };
}
