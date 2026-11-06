// N56 isolated demo deadline adapter with tab reloads and optimistic writes.
import {LemmaError} from '../api';
import type {DeadlineApi,DeadlineDue,DeadlineKind,DeadlinePatch,DeadlineRecord,DeadlineStatus,NewDeadline,DeadlineQuery} from './contract';
import type {StudyReceipt} from '../study/contract';
const KEY='lemma.v6.demo.deadlines.v1';
const kinds:DeadlineKind[]=['exam','seminar','assignment','milestone','other'];
const statuses:DeadlineStatus[]=['open','done','cancelled'];
type Snapshot={schema:1;items:DeadlineRecord[]};
const copy=<T>(value:T):T=>structuredClone(value);
function fail(code:'invalid'|'conflict'|'not_found',message:string):never {throw new LemmaError(code,message);}
function dateOnly(s:string):boolean {
 if(!/^\d{4}-\d\d-\d\d$/.test(s))return false;
 const [y,m,d]=s.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));
 return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d;
}
function checkDue(value:DeadlineDue):DeadlineDue {
 if(value?.kind==='date'&&typeof value.date==='string'&&dateOnly(value.date))return {kind:'date',date:value.date};
 if(value?.kind==='instant'&&typeof value.at==='string'&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value.at)&&
    Number.isFinite(Date.parse(value.at)))return {kind:'instant',at:value.at};
 return fail('invalid','Exactly one valid due date or timezone-aware instant is required');
}
function check(p:DeadlinePatch):void {
 if(p.title!==undefined&&(typeof p.title!=='string'||!p.title.trim()||p.title.trim().length>200))fail('invalid','Invalid deadline title');
 if(p.kind!==undefined&&!kinds.includes(p.kind))fail('invalid','Invalid deadline kind');
 if(p.due!==undefined)checkDue(p.due);
 if(p.remainingMinutes!==undefined&&p.remainingMinutes!==null&&
   (!Number.isSafeInteger(p.remainingMinutes)||p.remainingMinutes<0||p.remainingMinutes>2147483647))
   fail('invalid','Invalid remaining minutes');
 if(p.estimateSource!==undefined&&p.estimateSource!==null&&!['owner','derived'].includes(p.estimateSource))
  fail('invalid','Invalid estimate source');
 for(const k of ['subjectId','projectId','checkpointId'] as const)
  if(p[k]!==undefined&&p[k]!==null&&(typeof p[k]!=='string'||!p[k]?.trim()))
   fail('invalid','Invalid deadline link');
}
function seed():Snapshot {
 const at='2026-11-06T08:00:00.000Z';
 const item=(id:string,title:string,kind:DeadlineKind,due:DeadlineDue,status:DeadlineStatus):DeadlineRecord=>({
  id,title,kind,due,status,remainingMinutes:60,estimateSource:'owner',origin:'deadline',source:'app',
  subjectId:null,projectId:null,checkpointId:null,version:1,createdAt:at,updatedAt:at,
 });
 return {schema:1,items:[
  item('demo-deadline-1','Final analysis exam','exam',{kind:'date',date:'2026-11-18'},'open'),
  item('demo-deadline-2','Seminar','seminar',{kind:'instant',at:'2026-11-20T09:00:00+05:30'},'open'),
  item('demo-deadline-3','Retired milestone','milestone',{kind:'date',date:'2026-12-04'},'cancelled'),
 ]};
}
function projected():DeadlineRecord[]{
 return [{id:'demo-projected-target',title:'Topology path target',kind:'milestone',
  due:{kind:'date',date:'2026-12-15'},status:'open',remainingMinutes:null,estimateSource:null,
  origin:'project_target',source:'app',subjectId:null,projectId:'project-topology',checkpointId:null,
  version:1,createdAt:'2026-11-06T08:00:00.000Z',updatedAt:'2026-11-06T08:00:00.000Z'}];
}
function load():Snapshot|null {
 try{
  const data:unknown=JSON.parse(sessionStorage.getItem(KEY)??'null');
  if(!data||typeof data!=='object')return null;
  const v=data as Snapshot;
  if(v.schema!==1||!Array.isArray(v.items)||new Set(v.items.map(x=>x.id)).size!==v.items.length)return null;
  for(const x of v.items){
   if(x.origin!=='deadline'||!statuses.includes(x.status)||!Number.isSafeInteger(x.version)||x.version<1||
    typeof x.id!=='string'||!x.id||typeof x.createdAt!=='string'||!Number.isFinite(Date.parse(x.createdAt))||
    typeof x.updatedAt!=='string'||!Number.isFinite(Date.parse(x.updatedAt)))return null;
   check(x);
  }
  return v;
 }catch{return null;}
}
function persist(s:Snapshot):void {try{sessionStorage.setItem(KEY,JSON.stringify(s))}catch{/* storage restricted */}}
function query(q:DeadlineQuery):{limit:number;filter:DeadlineStatus[];cursor:{v:1;f:string;at:string;id:string}|null}{
 const limit=q.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('invalid','Deadline page limit must be 1–50');
 const status=q.status??statuses;
 if(!Array.isArray(status)||status.some(x=>!statuses.includes(x)))fail('invalid','Invalid statuses');
 const filter=statuses.filter(x=>status.includes(x));
 let cursor:null|{v:1;f:string;at:string;id:string}=null;
 if(q.cursor!=null){
  try {
   if(typeof q.cursor!=='string'||!/^[A-Za-z0-9_-]{4,1000}$/.test(q.cursor))throw Error();
   const c=JSON.parse(atob(q.cursor.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-q.cursor.length%4)%4)));
   if(c.v!==1||c.f!==filter.join(',')||typeof c.id!=='string'||
      typeof c.at!=='string'||!Number.isFinite(Date.parse(c.at)))throw Error();
   cursor=c;
  }catch{return fail('invalid','Invalid or mismatched deadline cursor')}
 }
 return {limit,filter,cursor};
}
function receipt<T>(record:T):StudyReceipt<T>{return {record:copy(record),actionNo:null};}


let serial=0;
function id():string{return globalThis.crypto?.randomUUID?.()??'demo-deadline-'+Date.now()+'-'+(++serial);}
export function createDemoDeadlineApi():DeadlineApi {
 let snapshot=load()??seed();persist(snapshot);
 const current=()=>{snapshot=load()??snapshot;return snapshot.items;};
 const save=(items:DeadlineRecord[])=>{snapshot={schema:1,items};persist(snapshot)};
 const find=(key:string):DeadlineRecord|null=>current().find(x=>x.id===key)??
  projected().find(x=>x.id===key)??null;
 async function change(key:string,version:number,operation:string,patch:DeadlinePatch={}){
  const before=find(key);
  if(!before)return fail('not_found','Deadline not found');
  if(before.origin!=='deadline')return fail('invalid','Projected dates cannot be changed');
  if(!Number.isSafeInteger(version)||version!==before.version)
   return fail('conflict','Deadline changed elsewhere; reload');
  check(patch);
  const transitions:Record<string,[DeadlineStatus,DeadlineStatus]>={
   complete:['open','done'],reopen:['done','open'],cancel:['open','cancelled'],restore:['cancelled','open'],
  };
  let status=before.status;
  const pair=transitions[operation];
  if(pair){if(status!==pair[0])return fail('invalid','Invalid deadline lifecycle transition');status=pair[1];}
  const next:DeadlineRecord={
   ...before,...patch,
   title:patch.title===undefined?before.title:patch.title.trim(),
   due:patch.due===undefined?before.due:checkDue(patch.due),
   status,version:before.version+1,updatedAt:new Date().toISOString(),
   remainingMinutes:patch.remainingMinutes===undefined?before.remainingMinutes:patch.remainingMinutes,
   estimateSource:patch.estimateSource===undefined?before.estimateSource:patch.estimateSource,
  };
  if(next.remainingMinutes===null)next.estimateSource=null;
  else if(next.estimateSource===null)next.estimateSource='owner';
  save(current().map(x=>x.id===key?next:x));
  return receipt(next);
 }
 return {
  mode:'demo',
  async listDeadlines(params={}){
   const {limit,filter,cursor}=query(params);
   const items=[...current(),...projected()].filter(x=>filter.includes(x.status))
    .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
   const start=cursor?items.findIndex(x=>x.createdAt>cursor.at||
    (x.createdAt===cursor.at&&x.id>cursor.id)):0;
   const page=start<0?[]:items.slice(start,start+limit);
   const end=start<0?items.length:start+page.length;
   const last=page.at(-1);
   const nextCursor=end<items.length&&last?btoa(JSON.stringify({
    v:1,f:filter.join(','),at:last.createdAt,id:last.id,
   })).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null;
   return {items:copy(page),total:items.length,nextCursor};
  },
  async getDeadline(key){return copy(find(key));},
  async createDeadline(input:NewDeadline){
   check(input);
   if(!input.title?.trim()||!input.kind||!input.due)
    return fail('invalid','Deadline title, kind and due required');
   const at=new Date().toISOString();
   const record:DeadlineRecord={
    id:id(),title:input.title.trim(),kind:input.kind,due:checkDue(input.due),
    remainingMinutes:input.remainingMinutes??null,
    estimateSource:input.remainingMinutes==null?null:input.estimateSource??'owner',
    subjectId:input.subjectId??null,projectId:input.projectId??null,checkpointId:input.checkpointId??null,
    status:'open',source:'app',origin:'deadline',version:1,createdAt:at,updatedAt:at,
   };
   save([...current(),record]);
   return receipt(record);
  },
  updateDeadline:(key,version,patch)=>change(key,version,'update',patch),
  completeDeadline:(key,version)=>change(key,version,'complete'),
  reopenDeadline:(key,version)=>change(key,version,'reopen'),
  cancelDeadline:(key,version)=>change(key,version,'cancel'),
  restoreDeadline:(key,version)=>change(key,version,'restore'),
  async deleteDeadline(key,version){
   const before=find(key);
   if(!before)return fail('not_found','Deadline not found');
   if(before.origin!=='deadline')return fail('invalid','Projected dates cannot be deleted');
   if(!Number.isSafeInteger(version)||version!==before.version)
    return fail('conflict','Deadline changed elsewhere; reload');
   save(current().filter(x=>x.id!==key));
   return receipt({id:key});
  },
 };
}
