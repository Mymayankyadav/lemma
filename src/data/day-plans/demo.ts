// N60: owner-local dated plans. Fixtures never share storage with tasks or study.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {DayPlanApi,DayPlanRecord,DayPlanItem,DayPlanQuery,NewDayPlanItem,NewDayPlan,DayPlanPatch,DayClosure,
  DaySourceKind} from './contract';
import {availability,closure,date,decodeCursor,emptyRitual,encodeCursor,id,items,newPlan,order,patch,query,
  validatePersisted,version,invalid} from './validate';

const KEY='lemma.v6.demo.day-plans.v1';
type Snapshot={schema:1;plans:DayPlanRecord[]};
const clone=<T>(v:T):T=>structuredClone(v);
let fallbackId=0;
function newId():string{
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 if(globalThis.crypto?.getRandomValues){
  const b=globalThis.crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20)].join('-');
 }
 return 'demo-day-'+Date.now()+'-'+(++fallbackId);
}
function after(old?:string):string{return new Date(Math.max(Date.now(),old?Date.parse(old)+1:0)).toISOString()}
function seed():Snapshot{
 const created='2026-11-06T08:00:00.000Z';
 const plan=(id:string,planDate:string,status:DayPlanRecord['status'],intention:string):DayPlanRecord=>({
  id,planDate,timeZone:'Asia/Kolkata',intention,capacityMinutes:120,
  availability:{windows:[{start:planDate+'T08:00:00+05:30',end:planDate+'T10:00:00+05:30'}],
   sources:status==='closed'?[]:[
    {kind:'task',id:'demo-task-1',version:1},
    {kind:'calendar_block',id:'demo-block-1',version:1}]},
  status,closedAt:status==='closed'?created:null,tomorrowFirstTaskId:null,ritual:emptyRitual(),
  items:status==='closed'?[{
   id:'demo-day-item-previous',planId:id,taskId:'demo-task-2',calendarBlockId:null,
   disposition:'carried_over',reason:'Available time ended',position:0
  }]:[{
   id:'demo-day-item-'+id,planId:id,taskId:'demo-task-1',calendarBlockId:'demo-block-1',
   disposition:'placed',reason:null,position:0
  }],
  source:'app',version:1,createdAt:created,updatedAt:created,
 });
 return {schema:1,plans:[
  plan('demo-day-yesterday','2026-11-05','closed','Write a short reflection'),
  plan('demo-day-today','2026-11-06','previewed','Prove one lemma'),
  plan('demo-day-tomorrow','2026-11-07','draft','Read ahead'),
 ]};
}
function load():Snapshot|null{
 try{
  const s:unknown=JSON.parse(sessionStorage.getItem(KEY)??'null');
  if(!s||typeof s!=='object')return null;
  const x=s as Snapshot;
  if(x.schema!==1||!Array.isArray(x.plans)||x.plans.length>400||
    !x.plans.every(validatePersisted)||
    new Set(x.plans.map(p=>p.id)).size!==x.plans.length||
    new Set(x.plans.map(p=>p.planDate)).size!==x.plans.length)return null;
  return x;
 }catch{return null}
}
function save(snapshot:Snapshot):void{
 try{sessionStorage.setItem(KEY,JSON.stringify(snapshot))}
 catch{/* Tab-private mode: keep this instance's in-memory snapshot. */}
}
const receipt=<T>(record:T):StudyReceipt<T>=>({record:clone(record),actionNo:null});
type VersionProvider=(kind:DaySourceKind,id:string)=>number|null;
export function createDemoDayPlanApi(options:{getSourceVersion?:VersionProvider}={}):DayPlanApi{
 let snapshot=load()??seed();save(snapshot);
 const fixtureVersions=new Map<string,number>([['task:demo-task-1',1],['calendar_block:demo-block-1',1]]);
 const getSourceVersion=(kind:DaySourceKind,sourceId:string)=>
  options.getSourceVersion?options.getSourceVersion(kind,sourceId):
  (fixtureVersions.get(kind+':'+sourceId)??null);
 const current=()=>{snapshot=load()??snapshot;return snapshot.plans};
 const store=(plans:DayPlanRecord[])=>{snapshot={schema:1,plans};save(snapshot)};
 function write(idValue:string,expected:number,change:(before:DayPlanRecord)=>DayPlanRecord){
  id(idValue);version(expected);
  const all=current(),before=all.find(p=>p.id===idValue);
  if(!before)throw new LemmaError('not_found','Day plan not found');
  if(before.version!==expected)throw new LemmaError('conflict','Day plan changed elsewhere');
  const updated=change(before);
  store(all.map(p=>p.id===idValue?updated:p));
  return receipt(updated);
 }
 function bump(row:DayPlanRecord,changes:Partial<DayPlanRecord>):DayPlanRecord{
  return {...row,...changes,version:row.version+1,updatedAt:after(row.updatedAt)};
 }
 function newItems(planId:string,raw:NewDayPlanItem[]):DayPlanItem[]{
  return items(raw).map(item=>({id:newId(),planId,...item}));
 }
 return {
  mode:'demo',
  async listDayPlans(q:DayPlanQuery={}){
   const opts=query(q),cursor=decodeCursor(q.cursor,opts);
   const all=current().filter(p=>(opts.status==='all'||p.status===opts.status)&&
    (!opts.fromDate||p.planDate>=opts.fromDate)&&(!opts.toDate||p.planDate<=opts.toDate))
    .sort(order);
   const remaining=cursor?all.filter(p=>order(p,{planDate:cursor.date,id:cursor.id})>0):all;
   const page=remaining.slice(0,opts.limit);
   return {items:clone(page),total:all.length,nextCursor:remaining.length>opts.limit&&page.length?
    encodeCursor(page[page.length-1],opts):null};
  },
  async getDayPlan(idValue:string){id(idValue);return clone(current().find(p=>p.id===idValue)??null)},
  async createDayPlan(input:NewDayPlan){
   const n=newPlan(input);
   if(current().some(p=>p.planDate===n.planDate))
    throw new LemmaError('conflict','This civil date already has a day plan');
   const at=after(),planId=newId();
   const row:DayPlanRecord={id:planId,planDate:n.planDate,timeZone:n.timeZone,
    intention:n.intention,capacityMinutes:n.capacityMinutes,availability:n.availability,
    status:'draft',closedAt:null,tomorrowFirstTaskId:null,ritual:n.ritual??emptyRitual(),
    items:newItems(planId,n.items??[]),source:'app',version:1,createdAt:at,updatedAt:at};
   store([...current(),row]);return receipt(row);
  },
  async updateDayPlan(idValue:string,expected:number,p:DayPlanPatch){
   const changes=patch(p);
   return write(idValue,expected,before=>{
    if(!['draft','previewed'].includes(before.status))
     throw new LemmaError('conflict','Committed/closed day plans cannot be edited');
    const status=changes.status??(changes.availability||changes.items?'draft':before.status);
    const nextItems=changes.items?newItems(before.id,changes.items):before.items;
    return bump(before,{...changes,status,items:nextItems});
   });
  },
  async commitDayPlan(idValue:string,expected:number){
   return write(idValue,expected,before=>{
    if(before.status!=='previewed')
     throw new LemmaError('conflict','Preview the day plan before committing');
    // Every listed placement needs a captured version, and every captured
    // version must still equal the source-of-truth at the instant of commit.
    const captured=new Map(before.availability.sources.map(s=>[s.kind+':'+s.id,s.version]));
    for(const item of before.items){
     if(!captured.has('task:'+item.taskId)||
      (item.calendarBlockId!==null&&!captured.has('calendar_block:'+item.calendarBlockId)))
      throw new LemmaError('conflict','Preview is missing a placed task or block version');
    }
    for(const source of before.availability.sources)
     if(getSourceVersion(source.kind,source.id)!==source.version)
      throw new LemmaError('conflict','Preview source changed; re-preview before committing');
    return bump(before,{status:'committed'});
   });
  },
  async closeDayPlan(idValue:string,expected:number,detail:DayClosure={}){
   const c=closure(detail);
   return write(idValue,expected,before=>{
    if(before.status!=='committed')
     throw new LemmaError('conflict','Only a committed day plan can be closed');
    return bump(before,{...c,status:'closed',closedAt:after(before.updatedAt)});
   });
  },
  async reopenDayPlan(idValue:string,expected:number){
   return write(idValue,expected,before=>{
    if(before.status!=='closed')throw new LemmaError('conflict','Day plan is not closed');
    return bump(before,{status:'committed',closedAt:null});
   });
  },
 };
}
