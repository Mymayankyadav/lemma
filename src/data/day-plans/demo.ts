// N60.2: isolated, tab-persistent day plans. These are advisory demo records;
// the live adapter uses the server's audited command for all mutations.
import {DayPlanError,type DayPlanApi,type DayPlanRecord,type DayPlanItem,
 type DayPlanPatch,type DayPlanQuery,type DayPlanStatus,type NewDayPlan,
 type NewDayPlanItem,type PlanAvailability,type PlanSourceVersion} from './contract';
import {civilPlanDate,normalizeAvailability,normalizeDayPlan,normalizePlanItems,
 validatePlanClosure} from './model';
import {createDemoTaskApi} from '../tasks/demo';
import {createDemoStudyApi} from '../study/demo';

const KEY='lemma.v6.demo.day-plans.v1';
type Snapshot={schema:1;plans:DayPlanRecord[];items:DayPlanItem[]};
type Cursor={v:1;filter:string;date?:string;position?:number;id:string};
type SourceVersion=(source:PlanSourceVersion)=>Promise<number|null>;
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new DayPlanError(code,message);
};
const seeded=():Snapshot=>({
 schema:1,plans:[{
  id:'demo-day-plan-1',planDate:'2026-11-01',timeZone:'Asia/Kolkata',
  intention:'Reflect on a completed proof',capacityMinutes:60,
  availability:{sources:[]},status:'draft',closedAt:null,
  tomorrowFirstTaskId:null,ritual:{},version:1,
  createdAt:'2026-11-01T06:00:00.000Z',updatedAt:'2026-11-01T06:00:00.000Z',
 }],items:[],
});
function read():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return null;
  const value:Snapshot=JSON.parse(raw);
  if(value?.schema!==1||!Array.isArray(value.plans)||
   !Array.isArray(value.items)||value.plans.some(x=>!x||!x.id||
    !Number.isSafeInteger(x.version)||x.version<1||
    !x.planDate||!x.timeZone)||value.items.some(x=>!x||!x.id||!x.planId))
   return null;
  if(new Set(value.plans.map(x=>x.planDate)).size!==value.plans.length)
   return null;
  return value;
 }catch{return null;}
}
function persist(s:Snapshot):void{
 try{sessionStorage.setItem(KEY,JSON.stringify(s));}
 catch{/* A blocked storage API does not corrupt this adapter's in-memory state. */}
}
let serial=0;
function newId():string{
 if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
 return 'demo-plan-'+Date.now()+'-'+(++serial);
}
const stamp=()=>new Date().toISOString();
function limit(value:number|undefined):number{
 const n=value??20;
 if(!Number.isSafeInteger(n)||n<1||n>50)fail('invalid','Page size must be 1–50');
 return n;
}
function cursor(raw:string|null|undefined,filter:string):Cursor|null{
 if(raw==null)return null;
 try{
  if(raw.length>2048||!/^[A-Za-z0-9_-]+$/.test(raw))return fail('invalid','Invalid plan cursor');
  const decoded=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4))) as Cursor;
  if(decoded.v!==1||decoded.filter!==filter||typeof decoded.id!=='string'||
   !decoded.id)return fail('invalid','Cursor does not match the plan filter');
  return decoded;
 }catch{return fail('invalid','Invalid plan cursor');}
}
function encode(data:Cursor):string{
 return btoa(JSON.stringify(data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
const planSort=(a:DayPlanRecord,b:DayPlanRecord)=>
 a.planDate.localeCompare(b.planDate)||a.id.localeCompare(b.id);
const itemSort=(a:DayPlanItem,b:DayPlanItem)=>
 a.position-b.position||a.id.localeCompare(b.id);
const copyReceipt=(record:DayPlanRecord)=>({record:clone(record),actionNo:null});
function positive(v:number):void{
 if(!Number.isSafeInteger(v)||v<1||v>2147483647)
  fail('invalid','Expected version must be a positive int4');
}
function normalizedQuery(q:DayPlanQuery={}):{
 from:string|null;through:string|null;statuses:DayPlanStatus[];size:number;after:Cursor|null;filter:string
}{
 if(!q||typeof q!=='object'||Array.isArray(q)||
  Object.keys(q).some(k=>!['from','through','status','limit','cursor'].includes(k)))
  fail('invalid','Invalid day-plan filters');
 const from=q.from===undefined?null:civilPlanDate(q.from);
 const through=q.through===undefined?null:civilPlanDate(q.through);
 if(from&&through&&from>through)fail('invalid','Invalid date window');
 const valid:DayPlanStatus[]=['draft','previewed','committed','closed'];
 if(q.status!==undefined&&(!Array.isArray(q.status)||
  !q.status.every(x=>valid.includes(x))))
  fail('invalid','Invalid day-plan status filter');
 const statuses=q.status===undefined?valid:valid.filter(x=>q.status!.includes(x));
 const filter=JSON.stringify([from,through,statuses]);
 return {from,through,statuses,size:limit(q.limit),
  after:cursor(q.cursor,filter),filter};
}
async function defaultSourceVersion(source:PlanSourceVersion):Promise<number|null>{
 if(source.resource==='tasks')
  return (await createDemoTaskApi().getTask(source.id))?.version??null;
 const blocks=await createDemoStudyApi().listCalendarBlocks({
  start:'1970-01-01T00:00:00.000Z',end:'2100-01-01T00:00:00.000Z',
 });
 return blocks.find(block=>block.id===source.id)?.version??null;
}
/** The optional resolver allows deterministic tests to simulate version drift. */
export function createDemoDayPlanApi(sourceVersion:SourceVersion=defaultSourceVersion):DayPlanApi{
 let state=read()??seeded();
 persist(state);
 const current=():Snapshot=>{state=read()??state;return state;};
 const save=(value:Snapshot):void=>{state=value;persist(value)};
 const find=(id:string):DayPlanRecord=>{
  if(typeof id!=='string'||!id.trim())fail('invalid','Plan ID required');
  const found=current().plans.find(x=>x.id===id);
  if(!found)fail('not_found','Day plan not found');
  return found!;
 };
 const checked=(id:string,expected:number):DayPlanRecord=>{
  positive(expected);
  const plan=find(id);
  if(plan.version!==expected)fail('conflict','Day plan changed since it was read');
  return plan;
 };
 const replace=(row:DayPlanRecord,items?:DayPlanItem[]):void=>{
  const s=current();
  save({schema:1,plans:s.plans.map(x=>x.id===row.id?row:x),
   items:items??s.items});
 };
 const snapshotCurrent=async (availability:PlanAvailability):Promise<void>=>{
  for(const source of normalizeAvailability(availability).sources){
   const actual=await sourceVersion(source);
   if(actual!==source.version)fail('conflict','Stale or missing day-plan source');
  }
 };
 const update=(row:DayPlanRecord,status:DayPlanStatus,
  patch:Partial<DayPlanRecord>={}):DayPlanRecord=>{
  const next={...row,...patch,status,version:row.version+1,updatedAt:stamp()};
  validatePlanClosure(next.status,next.closedAt);
  return next;
 };
 return {
  mode:'demo',
  async listPlans(q:DayPlanQuery={}){
   const {from,through,statuses,size,after,filter}=normalizedQuery(q);
   const ordered=current().plans.filter(x=>
    (!from||x.planDate>=from)&&(!through||x.planDate<=through)&&
    statuses.includes(x.status)).sort(planSort);
   const post=ordered.filter(x=>!after||
    x.planDate>(after.date??'')||
    (x.planDate===after.date&&x.id>after.id));
   const page=post.slice(0,size);
   const last=page.at(-1);
   return {items:clone(page),total:ordered.length,
    nextCursor:last&&post.length>size?
     encode({v:1,filter,date:last.planDate,id:last.id}):null};
  },
  async getPlan(id:string){
   if(typeof id!=='string'||!id.trim())fail('invalid','Plan ID required');
   const p=current().plans.find(x=>x.id===id);
   return p?clone(p):null;
  },
  async listItems(planId:string,q={}){
   const plan=find(planId);
   const input=q as {limit?:number;cursor?:string|null};
   if(!input||typeof input!=='object'||Object.keys(input).some(x=>!['limit','cursor'].includes(x)))
    fail('invalid','Invalid day-plan item query');
   const size=limit(input.limit),filter=plan.id+':'+plan.version;
   const after=cursor(input.cursor,filter);
   const ordered=current().items.filter(x=>x.planId===plan.id).sort(itemSort);
   const post=ordered.filter(x=>!after||
    x.position>(after.position??-1)||
    (x.position===after.position&&x.id>after.id));
   const page=post.slice(0,size),last=page.at(-1);
   return {items:clone(page),total:ordered.length,nextCursor:last&&post.length>size?
    encode({v:1,filter,position:last.position,id:last.id}):null};
  },
  async createPlan(input:NewDayPlan){
   const n=normalizeDayPlan(input);
   await snapshotCurrent(n.availability);
   if(current().plans.some(p=>p.planDate===n.planDate))
    fail('conflict','One day plan already exists for that date');
   const now=stamp();
   const record:DayPlanRecord={
    id:newId(),...n,status:'draft',closedAt:null,
    version:1,createdAt:now,updatedAt:now,
   };
   const s=current();
   save({...s,plans:[...s.plans,record]});
   return copyReceipt(record);
  },
  async updatePlan(id:string,expectedVersion:number,patch:DayPlanPatch){
   const p=checked(id,expectedVersion);
   if(p.status!=='draft'&&p.status!=='previewed')
    fail('invalid','Only draft or previewed plans can change');
   if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)
    fail('invalid','A day-plan patch is required');
   const allowed=['timeZone','intention','capacityMinutes','availability',
    'tomorrowFirstTaskId','ritual'];
   if(Object.keys(patch).some(k=>!allowed.includes(k)))
    fail('invalid','Unknown day-plan patch field');
   const n=normalizeDayPlan({
    planDate:p.planDate,timeZone:patch.timeZone??p.timeZone,
    intention:patch.intention??p.intention,
    capacityMinutes:patch.capacityMinutes??p.capacityMinutes,
    availability:patch.availability??{sources:[]},
    tomorrowFirstTaskId:'tomorrowFirstTaskId'in patch?
     patch.tomorrowFirstTaskId:p.tomorrowFirstTaskId,
    ritual:patch.ritual??p.ritual,
   });
   await snapshotCurrent(n.availability);
   const latest=checked(id,expectedVersion);
   const row=update(latest,'draft',{...n,closedAt:null});
   replace(row,current().items.filter(x=>x.planId!==id));
   return copyReceipt(row);
  },
  async previewPlan(id:string,expectedVersion:number,
   items:NewDayPlanItem[],availability:PlanAvailability){
   const p=checked(id,expectedVersion);
   if(p.status!=='draft'&&p.status!=='previewed')
    fail('invalid','Only draft plans may preview');
   const n=normalizePlanItems(items),a=normalizeAvailability(availability);
   if(n.length>500||a.sources.length>1000)
    fail('invalid','Preview exceeds bounded planning capacity');
   const sourceSet=new Set(a.sources.map(s=>s.resource+':'+s.id));
   for(const item of n){
    if(!sourceSet.has('tasks:'+item.taskId)||
     (item.blockId&&!sourceSet.has('calendar_blocks:'+item.blockId)))
     fail('invalid','Plan item missing from source snapshot');
   }
   await snapshotCurrent(a);
   const latest=checked(id,expectedVersion);
   const row=update(latest,'previewed',{availability:a,closedAt:null});
   const fresh=n.map((x):DayPlanItem=>({
    id:newId(),planId:id,taskId:x.taskId,blockId:x.blockId??null,
    disposition:x.disposition,reason:x.reason??null,
    position:x.position,version:1,
   }));
   const s=current();
   save({...s,plans:s.plans.map(x=>x.id===id?row:x),
    items:[...s.items.filter(x=>x.planId!==id),...fresh]});
   return copyReceipt(row);
  },
  async commitPlan(id:string,expectedVersion:number){
   const p=checked(id,expectedVersion);
   if(p.status!=='previewed')fail('invalid','Plan must be previewed before commit');
   await snapshotCurrent(p.availability);
   const latest=checked(id,expectedVersion);
   const row=update(latest,'committed',{closedAt:null});
   replace(row);return copyReceipt(row);
  },
  async closePlan(id:string,expectedVersion:number,ritual?:Record<string,unknown>){
   const p=checked(id,expectedVersion);
   if(p.status!=='committed')fail('invalid','Only committed plan may close');
   const validated=ritual===undefined?p.ritual:
    normalizeDayPlan({planDate:p.planDate,timeZone:p.timeZone,ritual}).ritual;
   const row=update(p,'closed',{ritual:validated,closedAt:stamp()});
   replace(row);return copyReceipt(row);
  },
  async reopenPlan(id:string,expectedVersion:number){
   const p=checked(id,expectedVersion);
   if(p.status!=='closed')fail('invalid','Only closed plan may reopen');
   const row=update(p,'committed',{closedAt:null});
   replace(row);return copyReceipt(row);
  },
 };
}
