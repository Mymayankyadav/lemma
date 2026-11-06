import {LemmaError} from '../api';
import type {NewStudyGoal,StudyGoalApi,StudyGoalPatch,StudyGoalRecord} from './contract';
import {cursorOf,invalid,isAfter,overlap,queryOptions,validate,validatedRange} from './shared';
import type {StudyReceipt} from '../study/contract';
const KEY='lemma.v6.demo.study-goals.v1';
type Snapshot={schema:1;records:StudyGoalRecord[]};
const copy=<T>(record:T):T=>structuredClone(record);
const receipt=<T>(record:T):StudyReceipt<T>=>({record:copy(record),actionNo:null});
const fail=(code:'conflict'|'not_found',message:string):never=>{throw new LemmaError(code,message)};
function seeded():Snapshot {
 const at='2026-11-06T08:00:00.000Z';
 return {schema:1,records:[
  {id:'demo-goal-week',period:'week',startDate:'2026-11-02',endDate:'2026-11-08',
   timeZone:'Asia/Kolkata',targetMinutes:420,subjectId:null,projectId:null,
   archivedAt:null,source:'app',version:1,createdAt:at,updatedAt:at},
  {id:'demo-goal-month',period:'month',startDate:'2026-11-01',endDate:'2026-11-30',
   timeZone:'Asia/Kolkata',targetMinutes:1800,subjectId:'subject-analysis',
   projectId:null,archivedAt:null,source:'app',version:1,createdAt:at,updatedAt:at},
  {id:'demo-goal-archived',period:'custom',startDate:'2026-10-01',endDate:'2026-10-14',
   timeZone:'UTC',targetMinutes:240,subjectId:null,projectId:null,
   archivedAt:'2026-10-16T08:00:00.000Z',source:'app',
   version:2,createdAt:at,updatedAt:at},
 ]};
}
function load():Snapshot|null{
 try {
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return null;
  const data:unknown=JSON.parse(raw);
  if(!data||typeof data!=='object')return null;
  const s=data as Snapshot;
  if(s.schema!==1||!Array.isArray(s.records)||new Set(s.records.map(r=>r.id)).size!==s.records.length)return null;
  for(const row of s.records){
   if(typeof row.id!=='string'||!row.id||!Number.isSafeInteger(row.version)||row.version<1||
      typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
      typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt))||
      (row.archivedAt!==null&&(typeof row.archivedAt!=='string'||!Number.isFinite(Date.parse(row.archivedAt)))))
     return null;
   validate(row);validatedRange(row);
  }
  return s;
 }catch{return null}
}
function store(s:Snapshot):void{try{sessionStorage.setItem(KEY,JSON.stringify(s))}catch{/* optional storage */}}
let serial=0;
function uuid():string{return globalThis.crypto?.randomUUID?.()??'demo-goal-'+Date.now()+'-'+(++serial)}
export function createDemoStudyGoalApi():StudyGoalApi{
 let state=load()??seeded();store(state);
 const rows=()=>{state=load()??state;return state.records};
 const persist=(records:StudyGoalRecord[])=>{state={schema:1,records};store(state)};
 const find=(id:string)=>rows().find(r=>r.id===id)??null;
 const version=(record:StudyGoalRecord,expected:number)=>{
  if(!Number.isSafeInteger(expected)||expected!==record.version)
   fail('conflict','Goal changed elsewhere; reload current version');
 };
 const checkOverlap=(candidate:StudyGoalRecord)=>{
  if(rows().some(r=>overlap(candidate,r)))
   invalid('Overlapping goals for the same scope and period are not allowed');
 };
 async function update(id:string,expectedVersion:number,patch:StudyGoalPatch,action:'update'|'archive'|'restore'){
  const prior=find(id);
  if(!prior)return fail('not_found','Goal not found');
  version(prior,expectedVersion);validate(patch);
  if(action==='archive'&&prior.archivedAt!==null)invalid('Goal is already archived');
  if(action==='restore'&&prior.archivedAt===null)invalid('Goal is not archived');
  const now=new Date().toISOString();
  const record:StudyGoalRecord={
   ...prior,...patch,version:prior.version+1,updatedAt:now,
   archivedAt:action==='archive'?now:action==='restore'?null:prior.archivedAt,
  };
  validatedRange(record);checkOverlap(record);
  persist(rows().map(r=>r.id===id?record:r));
  return receipt(record);
 }
 return {
  mode:'demo',
  async listStudyGoals(params={}){
   const {limit,archived,cursor}=queryOptions(params);
   const all=rows().filter(r=>archived==='all'||(r.archivedAt===null)===(archived==='active'))
    .sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id));
   const start=cursor?all.findIndex(r=>isAfter(r,cursor)):0;
   const page=start<0?[]:all.slice(start,start+limit);
   const next=start<0?all.length:start+page.length;
   return {items:copy(page),total:all.length,
    nextCursor:next<all.length&&page.length?cursorOf(page[page.length-1],archived):null};
  },
  async getStudyGoal(id){return copy(find(id))},
  async createStudyGoal(input:NewStudyGoal){
   validate(input);validatedRange(input);
   if(!input.period||!input.timeZone||input.targetMinutes===undefined)
    invalid('Goal period, time zone, target and dates are required');
   const now=new Date().toISOString();
   const record:StudyGoalRecord={
    ...input,id:uuid(),subjectId:input.subjectId??null,projectId:input.projectId??null,
    archivedAt:null,source:'app',version:1,createdAt:now,updatedAt:now,
   };
   checkOverlap(record);
   persist([...rows(),record]);
   return receipt(record);
  },
  updateStudyGoal:(id,v,patch)=>update(id,v,patch,'update'),
  archiveStudyGoal:(id,v)=>update(id,v,{},'archive'),
  restoreStudyGoal:(id,v)=>update(id,v,{},'restore'),
  async deleteStudyGoal(id,expectedVersion){
   const prior=find(id);
   if(!prior)return fail('not_found','Goal not found');
   version(prior,expectedVersion);
   persist(rows().filter(r=>r.id!==id));
   return receipt({id});
  },
 };
}
