// N56 live deadlines: owner-scoped RLS reads and D8 deadline_command receipts.
import {LemmaError} from '../api';
import type {DeadlineApi,DeadlineDue,DeadlineKind,DeadlinePatch,DeadlineQuery,DeadlineRecord,DeadlineStatus,NewDeadline,EstimateSource,DeadlineSource,DeadlineOrigin} from './contract';
import type {StudyReceipt} from '../study/contract';
type Row=Record<string,unknown>;
type ErrorData={code?:string;message?:string};
type Changed={id:string;version:number};
type CommandReceipt={status:'ok'|'conflict';changed:Changed[];actionNo?:number|null;conflict?:{currentVersion?:number}};
type Cursor={v:1;f:string;at:string;id:string};
const statuses:DeadlineStatus[]=['open','done','cancelled'];
const kinds:DeadlineKind[]=['exam','seminar','assignment','milestone','other'];
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(code:'invalid'|'conflict'|'not_found'|'server',message:string):never=>{throw new LemmaError(code,message)};
async function client(){return (await import('../live/client')).liveClient();}
function uuid():string {
 const c=globalThis.crypto;
 if(c?.randomUUID)return c.randomUUID();
 if(!c?.getRandomValues)return fail('server','Secure operation ID unavailable');
 const b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function mapError(e:ErrorData):LemmaError {
 const message=e.message??'Deadline operation failed';
 if(e.code==='23505'||/conflict|version|duplicate|already exists/i.test(message))
  return new LemmaError('conflict',message);
 if(/not found|no rows/i.test(message))return new LemmaError('not_found',message);
 if(['23503','23514','22P02'].includes(e.code??'')||/invalid|required|constraint|unsupported|must be/i.test(message))
  return new LemmaError('invalid',message);
 return new LemmaError('server',message);
}
function unwrap<T>(v:{data:T|null;error:ErrorData|null}):T {
 if(v.error)throw mapError(v.error);
 return v.data as T;
}
function mapRow(row:Row):DeadlineRecord {
 const due:DeadlineDue=row.due_at!=null?
  {kind:'instant',at:String(row.due_at)}:{kind:'date',date:String(row.due_date)};
 return {
  id:String(row.id),title:String(row.title),kind:row.kind as DeadlineKind,due,
  status:row.status as DeadlineStatus,origin:(row.origin??'deadline') as DeadlineOrigin,
  source:(row.source??'app') as DeadlineSource,
  subjectId:row.subject_id==null?null:String(row.subject_id),
  projectId:row.project_id==null?null:String(row.project_id),
  checkpointId:row.checkpoint_id==null?null:String(row.checkpoint_id),
  remainingMinutes:row.remaining_minutes==null?null:Number(row.remaining_minutes),
  estimateSource:row.estimate_source==null?null:row.estimate_source as EstimateSource,
  version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
 };
}
function validDate(date:string):boolean {
 if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date))return false;
 const [y,m,d]=date.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));
 return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d;
}
function dueColumns(due:DeadlineDue):Row {
 if(due?.kind==='date'&&validDate(due.date))return {due_date:due.date,due_at:null};
 if(due?.kind==='instant'&&typeof due.at==='string'&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(due.at)&&
  Number.isFinite(Date.parse(due.at)))return {due_date:null,due_at:due.at};
 return fail('invalid','Exactly one valid due date or timezone-aware instant required');
}
function columns(patch:DeadlinePatch):Row {
 const out:Row={};
 if(patch.title!==undefined){
  if(typeof patch.title!=='string'||!patch.title.trim()||patch.title.trim().length>200)
   fail('invalid','Deadline title required (1–200 chars)');
  out.title=patch.title.trim();
 }
 if(patch.kind!==undefined){
  if(!kinds.includes(patch.kind))fail('invalid','Invalid deadline kind');
  out.kind=patch.kind;
 }
 if(patch.due!==undefined)Object.assign(out,dueColumns(patch.due));
 for(const [key,column] of [['subjectId','subject_id'],['projectId','project_id'],['checkpointId','checkpoint_id']] as const){
  const value=patch[key];
  if(value!==undefined){
   if(value!==null&&(typeof value!=='string'||!value.trim()))fail('invalid','Invalid deadline link');
   out[column]=value;
  }
 }
 if(patch.remainingMinutes!==undefined){
  if(patch.remainingMinutes!==null&&(!Number.isSafeInteger(patch.remainingMinutes)||
   patch.remainingMinutes<0||patch.remainingMinutes>2147483647))fail('invalid','Invalid remaining minutes');
  out.remaining_minutes=patch.remainingMinutes;
 }
 if(patch.estimateSource!==undefined){
  if(patch.estimateSource!==null&&!['owner','derived'].includes(patch.estimateSource))
   fail('invalid','Invalid estimate source');
  out.estimate_source=patch.estimateSource;
 }
 return out;
}
function expectedVersion(v:number):void {
 if(!Number.isSafeInteger(v)||v<1)fail('invalid','Expected version must be positive');
}
function normalize(q:DeadlineQuery):{limit:number;filter:DeadlineStatus[];cursor:Cursor|null}{
 const limit=q.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('invalid','Page size must be 1–50');
 const selected=q.status??statuses;
 if(!Array.isArray(selected)||selected.some(s=>!statuses.includes(s)))fail('invalid','Invalid statuses');
 const filter=statuses.filter(s=>selected.includes(s));
 let cursor:Cursor|null=null;
 if(q.cursor!=null){
  try {
   if(typeof q.cursor!=='string'||!/^[A-Za-z0-9_-]{4,1000}$/.test(q.cursor))throw Error();
   const c=JSON.parse(atob(q.cursor.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-q.cursor.length%4)%4))) as Cursor;
   if(c.v!==1||c.f!==filter.join(',')||typeof c.at!=='string'||!Number.isFinite(Date.parse(c.at))||
     typeof c.id!=='string'||!idPattern.test(c.id))throw Error();
   cursor=c;
  }catch{return fail('invalid','Invalid or mismatched deadline cursor');}
 }
 return {limit,filter,cursor};
}


type Operation='create'|'update'|'complete'|'reopen'|'cancel'|'restore'|'delete';
export function createLiveDeadlineApi():DeadlineApi {
 const retryIds=new Map<string,string>();
 async function get(key:string):Promise<DeadlineRecord|null>{
  const api=await client();
  const row=unwrap<Row|null>(await api.from('deadlines').select('*').eq('id',key).maybeSingle());
  return row?mapRow(row):null;
 }
 async function write<T>(operation:Operation,args:Row,resolve:(change:Changed)=>Promise<T>):Promise<StudyReceipt<T>>{
  const base={schemaVersion:1,resource:'deadlines',operation,...args};
  const key=JSON.stringify(base);
  const operationId=retryIds.get(key)??uuid();
  let applied=false;
  try{
   const api=await client();
   const result=unwrap<CommandReceipt>(await api.rpc('deadlines_command',{p:{operationId,...base}}));
   if(result?.status==='conflict')
    fail('conflict','Deadline changed elsewhere (current version '+(result.conflict?.currentVersion??'unknown')+')');
   if(result?.status!=='ok'||!Array.isArray(result.changed)||result.changed.length!==1||
      typeof result.changed[0].id!=='string'||!Number.isSafeInteger(result.changed[0].version))
    fail('server','Invalid deadlines_command receipt');
   applied=true;
   const record=await resolve(result.changed[0]);
   retryIds.delete(key);
   return {record,actionNo:Number.isSafeInteger(result.actionNo)?result.actionNo!:null};
  }catch(error){
   if(applied||!(error instanceof LemmaError)||error.code==='server'||error.code==='offline')
    retryIds.set(key,operationId);
   else retryIds.delete(key);
   throw error;
  }
 }
 async function versioned(operation:Operation,key:string,version:number,patch:DeadlinePatch={}){
  expectedVersion(version);
  return write(operation,{target:{id:key},expectedVersion:version,patch:columns(patch)},
   async changed=>(await get(changed.id))??fail('not_found','Updated deadline not visible'));
 }
 return {
  mode:'live',
  async listDeadlines(query={}){
   const {limit,filter,cursor}=normalize(query);
   if(!filter.length)return {items:[],total:0,nextCursor:null};
   const api=await client();
   const counted=await api.from('deadlines').select('id',{count:'exact',head:true}).in('status',filter);
   if(counted.error)throw mapError(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count===null||counted.count<0)
    fail('server','Deadline total unavailable');
   let read=api.from('deadlines').select('*').in('status',filter);
   if(cursor)read=read.or('created_at.gt.'+cursor.at+
     ',and(created_at.eq.'+cursor.at+',id.gt.'+cursor.id+')');
   const rows=unwrap<Row[]>(await read.order('created_at',{ascending:true})
    .order('id',{ascending:true}).limit(limit+1));
   const items=rows.slice(0,limit).map(mapRow);
   const last=items.at(-1);
   const nextCursor=last&&rows.length>limit?btoa(JSON.stringify({
    v:1,f:filter.join(','),at:last.createdAt,id:last.id,
   })).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null;
   return {items,total:counted.count!,nextCursor};
  },
  getDeadline:get,
  async createDeadline(input:NewDeadline){
   if(!input.title?.trim()||!input.kind||!input.due)
    return fail('invalid','Deadline title, kind and due required');
   const patch=columns(input);
   return write('create',{patch},async changed=>
    (await get(changed.id))??fail('not_found','Created deadline not visible'));
  },
  updateDeadline:(key,version,patch)=>versioned('update',key,version,patch),
  completeDeadline:(key,version)=>versioned('complete',key,version),
  reopenDeadline:(key,version)=>versioned('reopen',key,version),
  cancelDeadline:(key,version)=>versioned('cancel',key,version),
  restoreDeadline:(key,version)=>versioned('restore',key,version),
  async deleteDeadline(key,version){
   expectedVersion(version);
   return write('delete',{target:{id:key},expectedVersion:version,patch:{}},
    async changed=>({id:changed.id}));
  },
 };
}
