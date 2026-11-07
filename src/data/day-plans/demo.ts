// N60.2: tab-local, reload-safe day plans. No browser owner identifier is accepted.
import {DayPlanError,type DayPlanApi,type DayPlanItem,type DayPlanPatch,
 type DayPlanQuery,type DayPlanRecord,type NewDayPlan,type NewDayPlanItem,
 type PlanAvailability,type DayPlanStatus} from './contract';
import {civilPlanDate,comparePlanSources,normalizeAvailability,
 normalizeDayPlan,normalizePlanItems,validatePlanClosure} from './model';
import {createDemoTaskApi} from '../tasks/demo';
import {createDemoStudyApi} from '../study/demo';

const KEY='lemma.v6.demo.day-plans.v1';
const statuses:DayPlanStatus[]=['draft','previewed','committed','closed'];
type Snapshot={schema:1;plans:DayPlanRecord[];items:DayPlanItem[]};
type PlanCursor={v:1;filter:string;date:string;id:string};
type ItemCursor={v:1;planId:string;position:number;id:string};
type SourceReader=(expected:PlanAvailability)=>Promise<PlanAvailability>;
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:'invalid'|'conflict'|'not_found',msg:string):never=>{
 throw new DayPlanError(code,msg);
};
let sequence=0;
function newId():string{
 return globalThis.crypto?.randomUUID?.()??'demo-plan-'+Date.now()+'-'+(++sequence);
}
function load():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return null;
  const data:unknown=JSON.parse(raw);
  if(!data||typeof data!=='object')return null;
  const snapshot=data as Snapshot;
  if(snapshot.schema!==1||!Array.isArray(snapshot.plans)||!Array.isArray(snapshot.items)||
   !snapshot.plans.every(p=>p&&typeof p.id==='string'&&
    typeof p.planDate==='string'&&Number.isSafeInteger(p.version)&&p.version>0)||
   !snapshot.items.every(i=>i&&typeof i.id==='string'&&
    typeof i.planId==='string'&&Number.isSafeInteger(i.position))||
   new Set(snapshot.plans.map(p=>p.id)).size!==snapshot.plans.length||
   new Set(snapshot.plans.map(p=>p.planDate)).size!==snapshot.plans.length)
   return null;
  return snapshot;
 }catch{return null}
}
function persist(snapshot:Snapshot):void{
 try{sessionStorage.setItem(KEY,JSON.stringify(snapshot))}
 catch{/* If storage is disabled, the in-memory adapter still works. */}
}
function requiredId(id:string):string{
 if(typeof id!=='string'||!id.trim()||id.length>256)
  return fail('invalid','Plan ID required');
 return id;
}
function expectedVersion(row:DayPlanRecord,expected:number):void{
 if(!Number.isSafeInteger(expected)||expected<1)
  fail('invalid','Expected version must be positive');
 if(row.version!==expected)fail('conflict','Day plan version changed');
}
function pageLimit(limit:number|undefined):number{
 const n=limit??20;
 if(!Number.isSafeInteger(n)||n<1||n>50)return fail('invalid','Page limit must be 1–50');
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
 catch{return fail('invalid','Malformed day-plan cursor')}
}
function zonedDate(zone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(new Date());
 const get=(name:string)=>parts.find(p=>p.type===name)?.value??'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
async function defaultSourceReader(expected:PlanAvailability):Promise<PlanAvailability>{
 const taskApi=createDemoTaskApi(),study=createDemoStudyApi();
 const blocks=await study.listCalendarBlocks({
  start:'1970-01-01T00:00:00.000Z',end:'2100-01-01T00:00:00.000Z',
 });
 const actual:PlanAvailability={sources:[]};
 for(const source of expected.sources){
  const row=source.resource==='tasks'?await taskApi.getTask(source.id):
   blocks.find(b=>b.id===source.id);
  if(row)actual.sources.push({...source,version:row.version});
 }
 return actual;
}
function normalizePatch(row:DayPlanRecord,patch:DayPlanPatch):DayPlanRecord{
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||
  Object.keys(patch).some(k=>!['timeZone','intention','capacityMinutes',
   'availability','tomorrowFirstTaskId','ritual'].includes(k)))
  return fail('invalid','Unknown plan patch');
 const validated=normalizeDayPlan({
  planDate:row.planDate,timeZone:patch.timeZone??row.timeZone,
  intention:patch.intention??row.intention,
  capacityMinutes:patch.capacityMinutes??row.capacityMinutes,
  availability:patch.availability??row.availability,
  tomorrowFirstTaskId:patch.tomorrowFirstTaskId===undefined?
   row.tomorrowFirstTaskId:patch.tomorrowFirstTaskId,
  ritual:patch.ritual??row.ritual,
 });
 return {...row,timeZone:validated.timeZone,intention:validated.intention,
  capacityMinutes:validated.capacityMinutes,availability:validated.availability,
  tomorrowFirstTaskId:validated.tomorrowFirstTaskId,ritual:validated.ritual};
}
export function createDemoDayPlanApi(readSources:SourceReader=defaultSourceReader):DayPlanApi{
 let memory=load()??{schema:1 as const,plans:[],items:[]};
 const current=():Snapshot=>{memory=load()??memory;return memory};
 const save=(plans:DayPlanRecord[],items:DayPlanItem[]):void=>{
  memory={schema:1,plans,items};persist(memory);
 };
 const plan=(id:string):DayPlanRecord=>{
  const found=current().plans.find(x=>x.id===requiredId(id));
  if(!found)return fail('not_found','Day plan not found');
  return found;
 };
 const receipt=(record:DayPlanRecord)=>({record:clone(record),actionNo:null});
 const store=(record:DayPlanRecord,items?:DayPlanItem[]):void=>{
  const state=current();
  save(state.plans.map(p=>p.id===record.id?record:p),items??state.items);
 };
 const bump=(row:DayPlanRecord,fields:Partial<DayPlanRecord>):DayPlanRecord=>
  ({...row,...fields,version:row.version+1,updatedAt:new Date().toISOString()});
 const checkSources=async(expected:PlanAvailability):Promise<void>=>{
  const actual=normalizeAvailability(await readSources(clone(expected)));
  if(!comparePlanSources(expected,actual).ok)
   fail('conflict','Day-plan source version changed since preview');
 };
 const api:DayPlanApi={
  mode:'demo',
  async listPlans(query:DayPlanQuery={}){
   if(!query||typeof query!=='object'||Array.isArray(query)||
    Object.keys(query).some(k=>!['from','through','status','limit','cursor'].includes(k)))
    return fail('invalid','Unknown plan query');
   const from=query.from===undefined?null:civilPlanDate(query.from);
   const through=query.through===undefined?null:civilPlanDate(query.through);
   if(from&&through&&from>through)fail('invalid','Invalid plan-date range');
   if(query.status!==undefined&&(!Array.isArray(query.status)||
    new Set(query.status).size!==query.status.length||
    query.status.some(s=>!statuses.includes(s))))
    fail('invalid','Invalid plan status filters');
   const included=query.status??statuses;
   const signature=JSON.stringify([from,through,[...included].sort()]);
   const cursor=decode<PlanCursor>(query.cursor);
   if(cursor&&(cursor.v!==1||cursor.filter!==signature||
    typeof cursor.id!=='string'||civilPlanDate(cursor.date)!==cursor.date))
    fail('invalid','Day-plan cursor does not match filters');
   const ordered=current().plans.filter(p=>
    (!from||p.planDate>=from)&&(!through||p.planDate<=through)&&
    included.includes(p.status)).sort((a,b)=>
    a.planDate.localeCompare(b.planDate)||a.id.localeCompare(b.id));
   const after=ordered.filter(p=>!cursor||p.planDate>cursor.date||
    (p.planDate===cursor.date&&p.id>cursor.id));
   const limit=pageLimit(query.limit),items=after.slice(0,limit),last=items.at(-1);
   return {items:clone(items),total:ordered.length,nextCursor:last&&after.length>limit?
    encode({v:1,filter:signature,date:last.planDate,id:last.id}):null};
  },
  async getPlan(id){
   const found=current().plans.find(p=>p.id===requiredId(id));
   return found?clone(found):null;
  },
  async listItems(planId,query={}){
   const key=requiredId(planId);
   if(!query||typeof query!=='object'||Array.isArray(query)||
    Object.keys(query).some(k=>!['limit','cursor'].includes(k)))
    return fail('invalid','Unknown plan-items query');
   const cursor=decode<ItemCursor>(query.cursor);
   if(cursor&&(cursor.v!==1||cursor.planId!==key||
    !Number.isSafeInteger(cursor.position)||typeof cursor.id!=='string'))
    fail('invalid','Plan-item cursor does not match plan');
   const ordered=current().items.filter(x=>x.planId===key).sort((a,b)=>
    a.position-b.position||a.id.localeCompare(b.id));
   const after=ordered.filter(x=>!cursor||x.position>cursor.position||
    (x.position===cursor.position&&x.id>cursor.id));
   const limit=pageLimit(query.limit),items=after.slice(0,limit),last=items.at(-1);
   return {items:clone(items),total:ordered.length,nextCursor:last&&after.length>limit?
    encode({v:1,planId:key,position:last.position,id:last.id}):null};
  },
  async createPlan(input:NewDayPlan){
   const validated=normalizeDayPlan(input),state=current();
   if(state.plans.some(p=>p.planDate===validated.planDate))
    return fail('conflict','A plan already exists on this owner date');
   const at=new Date().toISOString();
   const row:DayPlanRecord={...validated,id:newId(),status:'draft',
    closedAt:null,version:1,createdAt:at,updatedAt:at};
   validatePlanClosure(row.status,row.closedAt);
   save([...state.plans,row],state.items);
   return receipt(row);
  },
  async updatePlan(id,expected,patch:DayPlanPatch){
   const row=plan(id);expectedVersion(row,expected);
   if(!['draft','previewed'].includes(row.status))
    return fail('conflict','Only draft or previewed plans can be updated');
   const next=bump(normalizePatch(row,patch),{});
   store(next);return receipt(next);
  },
  async previewPlan(id,expected,items:NewDayPlanItem[],availability){
   const row=plan(id);expectedVersion(row,expected);
   if(!['draft','previewed'].includes(row.status))
    return fail('conflict','Only draft/previewed plans can preview');
   const validated=normalizePlanItems(items),snapshot=normalizeAvailability(availability);
   if(validated.length>500)return fail('invalid','Plan preview exceeds 500 items');
   await checkSources(snapshot);
   const next=bump(row,{status:'previewed',availability:snapshot});
   const state=current();
   const replaced=state.items.filter(x=>x.planId!==id);
   const entries:DayPlanItem[]=validated.map(x=>({
    id:newId(),planId:id,taskId:x.taskId,blockId:x.blockId??null,
    disposition:x.disposition,reason:x.reason??null,position:x.position,version:1,
   }));
   save(state.plans.map(p=>p.id===id?next:p),[...replaced,...entries]);
   return receipt(next);
  },
  async commitPlan(id,expected){
   const row=plan(id);expectedVersion(row,expected);
   if(row.status!=='previewed')return fail('conflict','Plan must be previewed');
   await checkSources(row.availability);
   const next=bump(row,{status:'committed'});store(next);
   return receipt(next);
  },
  async closePlan(id,expected,ritual){
   const row=plan(id);expectedVersion(row,expected);
   if(row.status!=='committed')return fail('conflict','Only committed plans may close');
   if(row.planDate>zonedDate(row.timeZone))
    return fail('invalid','A future owner date cannot be marked closed');
   const normalized=ritual===undefined?row.ritual:
    normalizePatch(row,{ritual}).ritual;
   const next=bump(row,{status:'closed',closedAt:new Date().toISOString(),ritual:normalized});
   validatePlanClosure(next.status,next.closedAt);
   store(next);return receipt(next);
  },
  async reopenPlan(id,expected){
   const row=plan(id);expectedVersion(row,expected);
   if(row.status!=='closed')return fail('conflict','Only closed plans may reopen');
   const next=bump(row,{status:'committed',closedAt:null});
   validatePlanClosure(next.status,next.closedAt);
   store(next);return receipt(next);
  },
 };
 return api;
}
