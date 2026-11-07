// N59.1: owner-style study goal fixtures and lifecycle, isolated to one demo tab.
import {LemmaError} from '../api';
import type {GoalApi,GoalPage,GoalPatch,GoalPeriod,GoalQuery,GoalRecord,GoalScope,NewGoal} from './contract';
import type {StudyReceipt} from '../study/contract';
const KEY='lemma.v6.demo.study-goals.v1';
const PERIODS:GoalPeriod[]=['week','month','custom'];
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:'invalid'|'not_found'|'conflict',msg:string):never=>{throw new LemmaError(code,msg)};
type Snapshot={schema:1;goals:GoalRecord[]};
type Cursor={v:1;filter:string;key:[string,string,string]};
let serial=0;
function newId(){
 if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
 return 'demo-goal-'+Date.now()+'-'+(++serial);
}
function date(v:string):string{
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v))return fail('invalid','Goal dates must use YYYY-MM-DD');
 const parsed=new Date(v+'T00:00:00.000Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==v)
  return fail('invalid','Invalid goal civil date');
 return v;
}
function zone(v:string):string{
 if(typeof v!=='string'||!v.trim()||v.length>100)return fail('invalid','Time zone required');
 try{new Intl.DateTimeFormat('en-US',{timeZone:v}).format(new Date())}
 catch{return fail('invalid','Invalid IANA time zone')}
 return v;
}
function scope(v:GoalScope):Required<GoalScope>{
 const ids={subjectId:v.subjectId??null,projectId:v.projectId??null};
 if(Object.values(ids).some(id=>id!==null&&(typeof id!=='string'||!id.trim())))
  return fail('invalid','Invalid goal scope ID');
 return ids;
}
function target(v:number):number{
 if(!Number.isSafeInteger(v)||v<1||v>100000)return fail('invalid','Target must be 1–100000 whole minutes');
 return v;
}
function period(v:GoalPeriod):GoalPeriod{
 if(!PERIODS.includes(v))return fail('invalid','Invalid goal period');
 return v;
}
function validated(input:NewGoal):Omit<GoalRecord,'id'|'archivedAt'|'version'|'createdAt'|'updatedAt'>{
 const startDate=date(input.startDate),endDate=date(input.endDate);
 if(startDate>endDate)return fail('invalid','Goal end date cannot precede start date');
 return {period:period(input.period),startDate,endDate,timeZone:zone(input.timeZone),
  targetMinutes:target(input.targetMinutes),...scope(input)};
}
function initial():Snapshot{
 const t='2026-11-06T08:00:00.000Z';
 const row=(id:string,per:GoalPeriod,start:string,end:string,minutes:number,
  subjectId:string|null,projectId:string|null,archivedAt:string|null=null):GoalRecord=>({
   id,period:per,startDate:start,endDate:end,timeZone:'Asia/Kolkata',
   targetMinutes:minutes,subjectId,projectId,archivedAt,version:1,createdAt:t,updatedAt:t,
  });
 return {schema:1,goals:[
  row('demo-goal-1','week','2026-11-02','2026-11-08',240,'subject-analysis','project-analysis'),
  row('demo-goal-2','week','2026-11-09','2026-11-15',300,'subject-analysis','project-analysis'),
  row('demo-goal-3','month','2026-11-01','2026-11-30',900,'subject-topology',null),
  row('demo-goal-4','custom','2026-10-01','2026-10-12',180,null,null,t),
  row('demo-goal-5','week','2026-11-02','2026-11-08',120,'subject-linear',null),
 ]};
}
function validStored(r:GoalRecord):boolean{
 try{
  if(!r||typeof r.id!=='string'||!r.id||r.id.length>160||
   !Number.isSafeInteger(r.version)||r.version<1||
   typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||
   typeof r.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt))||
   (r.archivedAt!==null&&(typeof r.archivedAt!=='string'||!Number.isFinite(Date.parse(r.archivedAt)))))
   return false;
  validated(r);return true;
 }catch{return false}
}
function read():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return null;
  const data:unknown=JSON.parse(raw);
  if(!data||typeof data!=='object')return null;
  const value=data as Snapshot;
  if(value.schema!==1||!Array.isArray(value.goals)||
   new Set(value.goals.map(g=>g.id)).size!==value.goals.length||
   !value.goals.every(validStored))return null;
  return value;
 }catch{return null}
}
function write(snapshot:Snapshot){try{sessionStorage.setItem(KEY,JSON.stringify(snapshot))}catch{/* in-memory fallback */}}
function overlaps(a:GoalRecord,b:GoalRecord):boolean{
 return !a.archivedAt&&!b.archivedAt&&a.period===b.period&&
  a.subjectId===b.subjectId&&a.projectId===b.projectId&&
  a.startDate<=b.endDate&&b.startDate<=a.endDate;
}
function forbidOverlap(row:GoalRecord,all:GoalRecord[]){
 if(all.some(g=>g.id!==row.id&&overlaps(g,row)))
  fail('conflict','Another active goal for this scope and period overlaps these dates');
}
function cmp(a:[string,string,string],b:[string,string,string]):number{
 return a[0].localeCompare(b[0])||a[1].localeCompare(b[1])||a[2].localeCompare(b[2]);
}
function ordering(g:GoalRecord):Cursor['key']{return [g.startDate,g.endDate,g.id]}
function encode(c:Cursor):string{return btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode(value:string,filter:string):Cursor{
 try{
  if(typeof value!=='string'||value.length<4||value.length>1024||!/^[A-Za-z0-9_-]+$/.test(value))
   return fail('invalid','Invalid goal cursor');
  const c=JSON.parse(atob(value.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-value.length%4)%4))) as Cursor;
  if(c.v!==1||c.filter!==filter||!Array.isArray(c.key)||c.key.length!==3||
   !c.key.every(v=>typeof v==='string')||!date(c.key[0])||!date(c.key[1])||!c.key[2])
   return fail('invalid','Invalid goal cursor');
  return c;
 }catch{return fail('invalid','Invalid goal cursor')}
}
function filter(q:GoalQuery){
 const limit=q.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)return fail('invalid','Goal page limit must be 1–50');
 if(q.includeArchived!==undefined&&typeof q.includeArchived!=='boolean')
  return fail('invalid','Invalid archive filter');
 for(const name of ['subjectId','projectId'] as const){
  const id=q[name];
  if(id!==undefined&&id!==null&&(typeof id!=='string'||!id.trim()))
   return fail('invalid','Invalid goal scope filter');
 }
 const includeArchived=q.includeArchived===true;
 const sig=JSON.stringify([includeArchived,q.subjectId===undefined?'*':q.subjectId,
  q.projectId===undefined?'*':q.projectId]);
 return {limit,includeArchived,signature:sig,anchor:q.cursor==null?null:decode(q.cursor,sig)};
}
function receipt<T>(record:T):StudyReceipt<T>{return {record:clone(record),actionNo:null}}
function checkVersion(row:GoalRecord,expected:number){
 if(!Number.isSafeInteger(expected)||row.version!==expected)
  fail('conflict','Goal changed elsewhere: current version '+row.version);
}
export function createDemoGoalApi():GoalApi{
 let snapshot=read()??initial();
 write(snapshot);
 const current=()=>{snapshot=read()??snapshot;return snapshot.goals};
 const save=(goals:GoalRecord[])=>{snapshot={schema:1,goals};write(snapshot)};
 const getOwned=(id:string,expected:number)=>{
  const r=current().find(g=>g.id===id);if(!r)return fail('not_found','Goal not found');
  checkVersion(r,expected);return r;
 };
 const change=(id:string,expected:number,patch:Partial<GoalRecord>)=>{
  const base=getOwned(id,expected);
  const next:GoalRecord={...base,...patch,version:base.version+1,updatedAt:new Date().toISOString()};
  forbidOverlap(next,current());save(current().map(g=>g.id===id?next:g));return receipt(next);
 };
 return {
  mode:'demo',
  async listGoals(q={}):Promise<GoalPage>{
   const opts=filter(q);
   const all=current().filter(g=>(opts.includeArchived||!g.archivedAt)&&
    (q.subjectId===undefined||g.subjectId===q.subjectId)&&
    (q.projectId===undefined||g.projectId===q.projectId))
    .sort((a,b)=>cmp(ordering(a),ordering(b)));
   const start=opts.anchor?all.findIndex(g=>cmp(ordering(g),opts.anchor!.key)>0):0;
   const items=start<0?[]:all.slice(start,start+opts.limit);
   const end=start<0?all.length:start+items.length;
   return {items:clone(items),total:all.length,
    nextCursor:end<all.length&&items.length?
     encode({v:1,filter:opts.signature,key:ordering(items[items.length-1])}):null};
  },
  async getGoal(id){return clone(current().find(g=>g.id===id)??null)},
  async createGoal(input){
   const values=validated(input),now=new Date().toISOString();
   const next:GoalRecord={id:newId(),...values,version:1,archivedAt:null,createdAt:now,updatedAt:now};
   forbidOverlap(next,current());save([...current(),next]);return receipt(next);
  },
  async updateGoal(id,expectedVersion,patch:GoalPatch){
   const base=getOwned(id,expectedVersion);
   const values=validated({
    period:patch.period===undefined?base.period:patch.period,startDate:patch.startDate===undefined?base.startDate:patch.startDate,
    endDate:patch.endDate===undefined?base.endDate:patch.endDate,timeZone:patch.timeZone===undefined?base.timeZone:patch.timeZone,
    targetMinutes:patch.targetMinutes===undefined?base.targetMinutes:patch.targetMinutes,
    subjectId:patch.subjectId===undefined?base.subjectId:patch.subjectId,
    projectId:patch.projectId===undefined?base.projectId:patch.projectId,
   });
   return change(id,expectedVersion,values);
  },
  async archiveGoal(id,expectedVersion){
   const base=getOwned(id,expectedVersion);
   if(base.archivedAt)return fail('invalid','Goal already archived');
   return change(id,expectedVersion,{archivedAt:new Date().toISOString()});
  },
  async restoreGoal(id,expectedVersion){
   const base=getOwned(id,expectedVersion);
   if(!base.archivedAt)return fail('invalid','Goal is not archived');
   return change(id,expectedVersion,{archivedAt:null});
  },
  async deleteGoal(id,expectedVersion){
   getOwned(id,expectedVersion);
   save(current().filter(g=>g.id!==id));return receipt({id});
  },
 };
}
