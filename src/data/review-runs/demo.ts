// N62.2: isolated reload-safe demo review runs. Review grading remains external.
import {ReviewRunError} from './contract';
import type {NewReviewRun,ReviewRunApi,ReviewRunAdvance,ReviewRunItemRecord,
  ReviewRunItemQuery,ReviewRunPage,ReviewRunQuery,ReviewRunRecord} from './contract';
import {assertReviewAdvance,assertReviewUuid,assertReviewVersion,
  canAdvanceReviewRun,canTransitionReviewRun,encodeReviewRunCursor,
  validateReviewRunDraft,validateReviewRunItem,validateReviewRunQuery,
  validateReviewRunRecord} from './model';

type Snapshot={schema:1;runs:ReviewRunRecord[];items:ReviewRunItemRecord[]};
type ItemCursor={v:1;runId:string;position:number;id:string};
const KEY='lemma.v6.demo.review-runs.v1';
const clone=<T>(v:T):T=>structuredClone(v);
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new ReviewRunError(code,message);
};
function newId():string {
 const crypto=globalThis.crypto;
 if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
 if(!crypto?.getRandomValues)return fail('invalid','Secure review-run IDs unavailable');
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
  hex.slice(16,20),hex.slice(20)].join('-');
}
function seed():Snapshot{
 const at=new Date().toISOString();
 const base:ReviewRunRecord={
  id:uuid(1),filters:{kind:'due'},selectedDeckIds:['project:analysis'],
  cardBudget:20,minuteBudget:20,schedulerVersion:'fsrs-5',settingsVersion:1,
  status:'running',position:0,revealed:false,
  startedAt:at,pausedAt:null,endedAt:null,
  version:1,source:'app',createdAt:at,updatedAt:at,
 };
 const other:ReviewRunRecord={...base,id:uuid(2),status:'paused',pausedAt:at};
 const item=(n:number,runId:string,position:number,
  state:'pending'|'graded'|'stale'):ReviewRunItemRecord=>({
   id:uuid(n),runId,position,cardId:uuid(n+100),expectedCardVersion:1,
   state,reviewId:state==='graded'?'1234567890123456':null,
   staleReason:state==='stale'?'Card version changed':null,
   version:1,source:'app',createdAt:at,updatedAt:at,
 });
 return {schema:1,runs:[base,other],items:[
  item(10,base.id,0,'pending'),item(11,base.id,1,'graded'),
  item(12,base.id,2,'stale'),item(13,other.id,0,'pending'),
 ]};
}
function load():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return null;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const data=value as Snapshot;
  if(data.schema!==1||!Array.isArray(data.runs)||!Array.isArray(data.items))
   return null;
  data.runs.forEach(validateReviewRunRecord);
  data.items.forEach(validateReviewRunItem);
  if(new Set(data.runs.map(r=>r.id)).size!==data.runs.length||
     new Set(data.items.map(i=>i.id)).size!==data.items.length)return null;
  const ids=new Set(data.runs.map(r=>r.id));
  if(data.items.some(i=>!ids.has(i.runId)))return null;
  return data;
 }catch{return null}
}
function persist(state:Snapshot):void{
 try{sessionStorage.setItem(KEY,JSON.stringify(state))}
 catch{/* Private browsing may retain only the in-memory snapshot. */}
}
function encodeItemCursor(row:ReviewRunItemRecord):string{
 return btoa(JSON.stringify({v:1,runId:row.runId,position:row.position,id:row.id}))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function itemQuery(runId:string,q:ReviewRunItemQuery={}):{
 limit:number;cursor:ItemCursor|null
}{
 if(!q||typeof q!=='object'||Array.isArray(q)||
   Object.keys(q).some(k=>!['limit','cursor'].includes(k)))
   return fail('invalid','Unexpected review-item query fields');
 const limit=q.limit??20;
 if(!Number.isInteger(limit)||limit<1||limit>50)
   return fail('invalid','Review items require 1–50 page size');
 if(q.cursor==null)return {limit,cursor:null};
 try{
  if(typeof q.cursor!=='string'||q.cursor.length>1024||
    !/^[A-Za-z0-9_-]+$/.test(q.cursor))
    return fail('invalid','Invalid review item cursor');
  const raw=JSON.parse(atob(q.cursor.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-q.cursor.length%4)%4))) as ItemCursor;
  if(!raw||raw.v!==1||raw.runId!==runId||
    !Number.isInteger(raw.position)||raw.position<0||
    raw.position>2147483647||assertReviewUuid(raw.id)!==raw.id)
    return fail('invalid','Review item cursor belongs to another run');
  return {limit,cursor:raw};
 }catch{return fail('invalid','Invalid review item cursor')}
}
function sortedRuns(a:ReviewRunRecord,b:ReviewRunRecord):number{
 return a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
}
function sortedItems(a:ReviewRunItemRecord,b:ReviewRunItemRecord):number{
 return a.position-b.position||a.id.localeCompare(b.id);
}
function nowAfter(previous:string):string{
 return new Date(Math.max(Date.now(),Date.parse(previous))).toISOString();
}
export function createDemoReviewRunApi():ReviewRunApi{
 let snapshot=load()??seed();
 persist(snapshot);
 const current=():Snapshot=>{snapshot=load()??snapshot;return snapshot};
 const save=(next:Snapshot)=>{snapshot=clone(next);persist(snapshot)};
 const lookup=(key:string):ReviewRunRecord=>{
  const id=assertReviewUuid(key);
  return current().runs.find(r=>r.id===id)??
   fail('not_found','Review run not found');
 };
 const check=(run:ReviewRunRecord,expected:number)=>{
  assertReviewVersion(expected);
  if(run.version!==expected)fail('conflict','Review run version changed elsewhere');
 };
 const transition=(id:string,expected:number,
  next:'paused'|'running'|'completed'|'abandoned'):ReviewRunRecord=>{
  const run=lookup(id);check(run,expected);
  if(!canTransitionReviewRun(run.status,next))
   return fail('conflict','Illegal review-run transition');
  const now=nowAfter(run.updatedAt);
  const result:ReviewRunRecord=validateReviewRunRecord({
   ...run,status:next,version:run.version+1,updatedAt:now,
   pausedAt:next==='paused'?now:null,
   endedAt:next==='completed'||next==='abandoned'?now:null,
  });
  save({...current(),runs:current().runs.map(r=>r.id===id?result:r)});
  return clone(result);
 };
 return {
  mode:'demo',
  async listRuns(query:ReviewRunQuery={}):Promise<ReviewRunPage<ReviewRunRecord>>{
   const q=validateReviewRunQuery(query);
   const matching=current().runs.filter(r=>q.status.includes(r.status))
    .sort(sortedRuns);
   const after=matching.filter(r=>!q.cursor||
     sortedRuns(r,{createdAt:q.cursor.createdAt,id:q.cursor.id} as ReviewRunRecord)>0);
   const items=after.slice(0,q.limit),last=items.at(-1);
   return {items:clone(items),total:matching.length,
    nextCursor:last&&after.length>q.limit?encodeReviewRunCursor(last,q.status):null};
  },
  async getRun(key){const id=assertReviewUuid(key);
   return clone(current().runs.find(r=>r.id===id)??null)},
  async listRunItems(runId:string,query:ReviewRunItemQuery={}){
   const id=assertReviewUuid(runId),q=itemQuery(id,query);
   if(!current().runs.some(r=>r.id===id))
     return fail('not_found','Review run not found');
   const rows=current().items.filter(i=>i.runId===id).sort(sortedItems);
   const after=rows.filter(i=>!q.cursor||sortedItems(i,{
     position:q.cursor.position,id:q.cursor.id} as ReviewRunItemRecord)>0);
   const items=after.slice(0,q.limit),last=items.at(-1);
   return {items:clone(items),total:rows.length,
    nextCursor:last&&after.length>q.limit?encodeItemCursor(last):null};
  },
  async startRun(input:NewReviewRun){
   const draft=validateReviewRunDraft(input),at=new Date().toISOString();
   // No browser-side card selection or invented grade receipts: when starting
   // a new demo run without an assigned queue, show it as exhausted.
   const record:ReviewRunRecord=validateReviewRunRecord({
    id:newId(),...clone(draft),status:'exhausted',position:0,revealed:false,
    startedAt:at,pausedAt:null,endedAt:at,version:1,source:'app',
    createdAt:at,updatedAt:at,
   });
   save({...current(),runs:[...current().runs,record]});
   return {record:clone(record),actionNo:null};
  },
  async pauseRun(key,expected){
   const record=transition(key,expected,'paused');
   return {record,actionNo:null};
  },
  async resumeRun(key,expected){
   const record=transition(key,expected,'running');
   return {record,actionNo:null};
  },
  async abandonRun(key,expected){
   const record=transition(key,expected,'abandoned');
   return {record,actionNo:null};
  },
  async completeRun(key,expected){
   const record=transition(key,expected,'completed');
   return {record,actionNo:null};
  },
  async advanceRun(key:string,expected:number,raw:ReviewRunAdvance){
   const run=lookup(key);check(run,expected);
   const request=assertReviewAdvance(raw),row=current().items.find(i=>i.id===request.itemId);
   if(!row||!canAdvanceReviewRun(run,row))
     return fail('conflict','Review item was changed, graded or belongs to another run');
   const now=nowAfter(run.updatedAt);
   const changedItem:ReviewRunItemRecord=validateReviewRunItem({
    ...row,version:row.version+1,updatedAt:now,
    state:request.kind==='graded'?'graded':'stale',
    reviewId:request.kind==='graded'?request.reviewId:null,
    staleReason:request.kind==='stale'?request.reason:null,
   });
   const exhausted=current().items.filter(i=>i.runId===run.id)
    .every(i=>i.id===row.id||i.state!=='pending');
   const changedRun:ReviewRunRecord=validateReviewRunRecord({
    ...run,version:run.version+1,updatedAt:now,position:run.position+1,
    revealed:false,status:exhausted?'exhausted':'running',
    endedAt:exhausted?now:null,pausedAt:null,
   });
   save({...current(),runs:current().runs.map(r=>r.id===run.id?changedRun:r),
    items:current().items.map(i=>i.id===row.id?changedItem:i)});
   return {record:{run:clone(changedRun),item:clone(changedItem)},actionNo:null};
  },
 };
}
