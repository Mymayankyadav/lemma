// N56.2: owner-RLS deadline reads and receipt-backed, idempotent lifecycle writes.
// All browser mutations go through deadlines_command; projected targets are read-only.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {
 DeadlineApi,DeadlineDue,DeadlineKind,DeadlinePatch,DeadlineQuery,DeadlineRecord,
 DeadlineStatus,NewDeadline,
} from './contract';

type Row=Record<string,unknown>;
type DbError={code?:string;message?:string};
type Operation='create'|'update'|'complete'|'reopen'|'cancel'|'restore'|'delete';
type Changed={id:string;version:number};
type CommandReceipt={
 status:'ok'|'conflict';changed?:Changed[];actionNo?:number|null;
 conflict?:{currentVersion?:number;reason?:string};
};
type Envelope={
 operationId:string;schemaVersion:1;resource:'deadlines';operation:Operation;
 target?:{id:string};expectedVersion?:number;patch?:Row;
};
type Cursor={v:1;f:string;k:[string,string]};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS:DeadlineKind[]=['exam','seminar','assignment','milestone','other'];
const STATUSES:DeadlineStatus[]=['open','done','cancelled'];
const BATCH=50,MAX_ROWS=20000;
const fail=(code:'invalid'|'not_found'|'conflict'|'server',message:string):never=>{
 throw new LemmaError(code,message);
};
async function client(){return (await import('../live/client')).liveClient()}
function uuid():string{
 const random=globalThis.crypto;
 if(typeof random?.randomUUID==='function')return random.randomUUID();
 if(!random?.getRandomValues)return fail('server','Secure random operation IDs unavailable');
 const bytes=new Uint8Array(16);
 random.getRandomValues(bytes);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20);
}
function ownerId(value:unknown):string{
 if(typeof value!=='string'||!UUID.test(value))
  return fail('invalid','Expected a deadline UUID, not a projected target');
 return value.toLowerCase();
}
function int4(value:unknown):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>2147483647)
  return fail('server','Malformed deadline version');
 return value;
}
function instant(value:unknown):string{
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value))
  return fail('invalid','Timezone-aware ISO instant required');
 return new Date(value).toISOString();
}
function civil(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))
  return fail('invalid','YYYY-MM-DD civil deadline required');
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==m||date.getUTCDate()!==d)
  return fail('invalid','Invalid calendar date');
 return value;
}
function dueColumns(due:DeadlineDue):Row{
 if(!due||typeof due!=='object'||Array.isArray(due))
  return fail('invalid','Deadline due kind required');
 if(due.kind==='date'&&Object.keys(due).every(k=>k==='kind'||k==='date'))
  return {due_kind:'date',due_date:civil(due.date),due_at:null};
 if(due.kind==='instant'&&Object.keys(due).every(k=>k==='kind'||k==='at'))
  return {due_kind:'instant',due_date:null,due_at:instant(due.at)};
 return fail('invalid','Invalid deadline due date or instant');
}
function allowed(value:unknown,keys:readonly string[]):Row{
 if(!value||typeof value!=='object'||Array.isArray(value))
  return fail('invalid','Deadline input must be an object');
 const object=value as Row;
 for(const key of Object.keys(object))
  if(!keys.includes(key))fail('invalid','Unknown deadline field: '+key);
 return object;
}
const FIELDS=['title','kind','due','remainingMinutes','estimateSource',
 'subjectId','projectId','checkpointId'] as const;
function patchColumns(input:Row,create:boolean):Row{
 const patch:Row={};
 if(create||input.title!==undefined){
  if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>160)
   fail('invalid','Deadline title must be 1–160 characters');
  patch.title=(input.title as string).trim();
 }
 if(create||input.kind!==undefined){
  if(!KINDS.includes(input.kind as DeadlineKind))fail('invalid','Invalid deadline kind');
  patch.kind=input.kind;
 }
 if(create||input.due!==undefined)Object.assign(patch,dueColumns(input.due as DeadlineDue));
 for(const [from,to] of [
  ['subjectId','subject_id'],['projectId','project_id'],
  ['checkpointId','checkpoint_id'],
 ] as const)if(input[from]!==undefined){
  const value=input[from];
  if(value!==null&&(typeof value!=='string'||!UUID.test(value)))
   fail('invalid','Invalid deadline owner-scoped link');
  patch[to]=value;
 }
 const minutes=input.remainingMinutes,source=input.estimateSource;
 if(minutes!==undefined){
  if(minutes!==null&&(!Number.isSafeInteger(minutes)||typeof minutes!=='number'||
     minutes<0||minutes>100000))fail('invalid','Invalid remaining minutes');
  patch.remaining_minutes=minutes;
  if(source===undefined)patch.estimate_source=minutes===null?null:'owner';
 }
 if(source!==undefined){
  if(source!==null&&source!=='owner'&&source!=='derived')
   fail('invalid','Invalid estimate source');
  patch.estimate_source=source;
 }
 if(create){
  if(patch.remaining_minutes===undefined)patch.remaining_minutes=null;
  if(patch.estimate_source===undefined)patch.estimate_source=null;
 }
 if(patch.remaining_minutes!==undefined&&patch.estimate_source!==undefined&&
    (patch.remaining_minutes===null)!==(patch.estimate_source===null))
  fail('invalid','Remaining minutes and source must be paired');
 if(!create&&!Object.keys(patch).length)fail('invalid','Empty deadline update');
 return patch;
}
function errorFor(error:DbError):LemmaError{
 const msg=error.message||'Deadline database operation failed';
 if(error.code==='PGRST202'||error.code==='42883'||/function .+ not found/i.test(msg))
  return new LemmaError('server',msg);
 if(error.code==='23505'||/version|stale|conflict|duplicate/i.test(msg))
  return new LemmaError('conflict',msg);
 if(/not found for owner|not found/i.test(msg))return new LemmaError('not_found',msg);
 if(['23503','23514','22P02','22007','22008'].includes(error.code||'')||
   /invalid|unknown|unsupported|required|constraint|permission/i.test(msg))
  return new LemmaError('invalid',msg);
 return new LemmaError('server',msg);
}
function check(response:{error:DbError|null}):void{
 if(response.error)throw errorFor(response.error);
}
function timestamp(value:unknown):string{
 try{return instant(value)}catch{return fail('server','Malformed owner-visible deadline timestamp')}
}
function mapRow(feed:Row,metadata:Row):DeadlineRecord{
 const kind=feed.kind as DeadlineKind,status=feed.status as DeadlineStatus;
 if(!KINDS.includes(kind)||!STATUSES.includes(status))
  return fail('server','Malformed deadline kind or status');
 const sourceId=ownerId(feed.source_id);
 if(typeof feed.title!=='string'||!feed.title.trim())
  return fail('server','Malformed owner-visible deadline title');
 const origin=feed.origin;
 if(origin!=='deadline'&&origin!=='project'&&origin!=='checkpoint')
  return fail('server','Malformed deadline origin');
 const due:DeadlineDue=feed.due_kind==='date'
  ?{kind:'date',date:civil(feed.due_date)}
  :feed.due_kind==='instant'
   ?{kind:'instant',at:instant(feed.due_at)}
   :fail('server','Malformed deadline due kind');
 const projected=origin!=='deadline';
 if(Boolean(feed.projected)!==projected)
  return fail('server','Inconsistent deadline projection');
 const minutes=feed.remaining_minutes;
 const estimate=feed.estimate_source;
 if(minutes!==null&&(typeof minutes!=='number'||!Number.isSafeInteger(minutes)||
    minutes<0||minutes>100000))return fail('server','Malformed estimate');
 if((minutes===null)!==(estimate===null)||
    (estimate!==null&&estimate!=='owner'&&estimate!=='derived'))
  return fail('server','Malformed estimate source');
 return {
  id:origin==='project'?'project-target:'+sourceId:
    origin==='checkpoint'?'checkpoint-due:'+sourceId:sourceId,
  title:feed.title as string,kind,due,status,origin:origin==='deadline'?'owner':
    origin==='project'?'project_target':'checkpoint_due',
  subjectId:feed.subject_id as string|null,projectId:feed.project_id as string|null,
  checkpointId:feed.checkpoint_id as string|null,
  remainingMinutes:minutes as number|null,
  estimateSource:estimate as 'owner'|'derived'|null,
  version:int4(feed.version),createdAt:timestamp(metadata.created_at),
  updatedAt:timestamp(metadata.updated_at),
 };
}
function key(row:DeadlineRecord):Cursor['k']{
 return [row.due.kind==='date'?row.due.date+'T00:00:00':
    new Date(row.due.at).toISOString(),row.id];
}
function compare(a:Cursor['k'],b:Cursor['k']):number{
 return a[0].localeCompare(b[0])||a[1].localeCompare(b[1]);
}
function encode(value:Cursor):string{
 return btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_')
   .replace(/=+$/,'');
}
function decode(raw:string,filter:string):Cursor{
 try{
  if(raw.length>4096||raw.length<4||!/^[A-Za-z0-9_-]+$/.test(raw))
   return fail('invalid','Invalid deadline cursor');
  const data:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-raw.length%4)%4)));
  const cursor=data as Cursor;
  if(!cursor||cursor.v!==1||cursor.f!==filter||!Array.isArray(cursor.k)||
     cursor.k.length!==2||typeof cursor.k[0]!=='string'||
     typeof cursor.k[1]!=='string'||!Number.isFinite(Date.parse(cursor.k[0])))
   return fail('invalid','Cursor belongs to a different deadline filter');
  return cursor;
 }catch{return fail('invalid','Invalid deadline cursor')}
}
function options(query:DeadlineQuery={}){
 const raw=allowed(query,['statuses','includeProjections','limit','cursor']);
 const limit=raw.limit??20;
 if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>50)
  return fail('invalid','Deadline page size must be 1–50');
 const statuses=raw.statuses??['open'];
 if(!Array.isArray(statuses)||!statuses.every(x=>STATUSES.includes(x)))
  return fail('invalid','Invalid deadline statuses');
 if(raw.includeProjections!==undefined&&typeof raw.includeProjections!=='boolean')
  return fail('invalid','Invalid projection flag');
 const selected=STATUSES.filter(s=>statuses.includes(s));
 const include=raw.includeProjections!==false,f=selected.join(',')+':'+include;
 if(raw.cursor!==undefined&&raw.cursor!==null&&typeof raw.cursor!=='string')
  return fail('invalid','Invalid deadline cursor');
 return {limit,selected,include,f,
  anchor:raw.cursor==null?null:decode(raw.cursor as string,f)};
}

export function createLiveDeadlineApi():DeadlineApi{
 // A transport error can occur AFTER the server committed. Keep the exact
 // envelope across automatic and explicit retries, including post-write readback.
 const pending=new Map<string,Envelope>();
 async function metadata(table:'deadlines'|'projects'|'checkpoints',ids:string[],
  api:Awaited<ReturnType<typeof client>>){
  const records=new Map<string,Row>();
  for(let i=0;i<ids.length;i+=BATCH){
   const response=await api.from(table).select('id,created_at,updated_at')
    .in('id',ids.slice(i,i+BATCH));
   check(response);
   if(!Array.isArray(response.data))fail('server','Invalid owner metadata page');
   for(const raw of response.data as Row[])records.set(String(raw.id),raw);
  }
  return records;
 }
 async function scanFeed():Promise<DeadlineRecord[]>{
  const api=await client(),raw:Row[]=[];
  for(let offset=0;offset<=MAX_ROWS;offset+=BATCH){
   const response=await api.rpc('deadline_feed',{p_limit:BATCH,p_offset:offset});
   check(response);
   if(!Array.isArray(response.data)||response.data.length>BATCH)
    fail('server','Invalid bounded owner deadline feed');
   raw.push(...(response.data as Row[]));
   if(raw.length>MAX_ROWS)fail('server','Deadline list exceeds bounded scan');
   if(response.data.length<BATCH)break;
  }
  const byOrigin={
   deadlines:raw.filter(x=>x.origin==='deadline').map(x=>ownerId(x.source_id)),
   projects:raw.filter(x=>x.origin==='project').map(x=>ownerId(x.source_id)),
   checkpoints:raw.filter(x=>x.origin==='checkpoint').map(x=>ownerId(x.source_id)),
  };
  const [deadlines,projects,checkpoints]=await Promise.all([
   metadata('deadlines',byOrigin.deadlines,api),
   metadata('projects',byOrigin.projects,api),
   metadata('checkpoints',byOrigin.checkpoints,api),
  ]);
  const tables={deadline:deadlines,project:projects,checkpoint:checkpoints};
  return raw.map(row=>{
   const record=tables[row.origin as keyof typeof tables]?.get(String(row.source_id));
   if(!record)return fail('server','Missing owner-visible deadline metadata');
   return mapRow(row,record);
  });
 }
 async function getOwned(keyId:string):Promise<DeadlineRecord|null>{
  const api=await client();
  const response=await api.from('deadlines').select('*')
   .eq('id',ownerId(keyId)).maybeSingle();
  check(response);
  if(response.data===null)return null;
  if(!response.data||Array.isArray(response.data))
   return fail('server','Malformed deadline readback');
  const row=response.data as Row;
  return mapRow({...row,origin:'deadline',source_id:row.id,projected:false},row);
 }
 async function run(operation:Operation,extra:Omit<Envelope,
  'operationId'|'schemaVersion'|'resource'|'operation'>):Promise<StudyReceipt<DeadlineRecord|{id:string}>>{
  const identity=JSON.stringify({operation,...extra});
  let envelope=pending.get(identity);
  if(!envelope){
   envelope={operationId:uuid(),schemaVersion:1,resource:'deadlines',
    operation,...structuredClone(extra)};
   pending.set(identity,envelope);
  }
  const api=await client();
  let reply:CommandReceipt|undefined;
  for(let attempt=0;attempt<2;attempt++){
   let response:{data:unknown;error:DbError|null};
   try{
    response=await api.rpc('deadlines_command',{p:envelope});
   }catch(e){
    if(attempt===0)continue;
    return fail('server','Deadline request outcome unknown; retry the same action');
   }
   if(response.error){
    const known=Boolean(response.error.code)||
     /invalid|conflict|version|not found|permission|required|function/i.test(
      response.error.message||'');
    if(!known&&attempt===0)continue;
    if(known)pending.delete(identity);
    if(!known)return fail('server','Deadline request outcome unknown; retry the same action');
    throw errorFor(response.error);
   }
   if(!response.data||typeof response.data!=='object'||Array.isArray(response.data)){
    if(attempt===0)continue;
    return fail('server','Deadline receipt missing; retry the same action');
   }
   reply=response.data as CommandReceipt;
   break;
  }
  if(!reply)return fail('server','Deadline command did not return a receipt');
  if(reply.status==='conflict'){
   pending.delete(identity);
   const reason=reply.conflict?.reason||
    'Deadline version changed (current '+String(reply.conflict?.currentVersion??'unknown')+')';
   return fail('conflict',reason);
  }
  if(reply.status!=='ok'||!Array.isArray(reply.changed)||reply.changed.length!==1||
     !Number.isSafeInteger(reply.actionNo)||Number(reply.actionNo)<1)
   return fail('server','Malformed deadline action receipt; retry the same action');
  const changed=reply.changed[0];
  if(!UUID.test(changed.id)||!Number.isInteger(changed.version)||changed.version<1)
   return fail('server','Malformed deadline change identity');
  const actionNo=Number(reply.actionNo);
  if(operation==='delete'){
   pending.delete(identity);
   return {record:{id:changed.id},actionNo};
  }
  // A lost readback is still an uncertain outcome: leave the operationId
  // pending, then replay its immutable receipt on the next identical action.
  const record=await getOwned(changed.id);
  if(!record||record.version!==changed.version)
   return fail('server','Deadline write committed but owner readback is unavailable');
  pending.delete(identity);
  return {record,actionNo};
 }
 async function versioned(operation:Operation,keyId:string,version:number,patch:Row={}){
  const id=ownerId(keyId);
  if(!Number.isSafeInteger(version)||version<1||version>2147483647)
   return fail('invalid','Positive expectedVersion required');
  return run(operation,{target:{id},expectedVersion:version,patch});
 }
 return {
  mode:'live',
  async listDeadlines(query={}){
   const {limit,selected,include,f,anchor}=options(query);
   if(!selected.length)return {items:[],total:0,nextCursor:null};
   const rows=(await scanFeed()).filter(x=>
    selected.includes(x.status)&&(include||x.origin==='owner'))
    .sort((a,b)=>compare(key(a),key(b)));
   const after=anchor?rows.filter(x=>compare(key(x),anchor.k)>0):rows;
   const items=after.slice(0,limit),last=items.at(-1);
   return {items:structuredClone(items),total:rows.length,
    nextCursor:last&&after.length>limit?encode({v:1,f,k:key(last)}):null};
  },
  async getDeadline(keyId){
   if(keyId.startsWith('project-target:')||keyId.startsWith('checkpoint-due:')){
    const origin=keyId.startsWith('project-target:')?'project_target':'checkpoint_due';
    ownerId(keyId.slice(keyId.indexOf(':')+1));
    const rows=await scanFeed();
    return structuredClone(rows.find(x=>x.id===keyId&&x.origin===origin)??null);
   }
   return structuredClone(await getOwned(keyId));
  },
  async createDeadline(input){
   const data=allowed(input,FIELDS),patch=patchColumns(data,true);
   const result=await run('create',{patch});
   return result as StudyReceipt<DeadlineRecord>;
  },
  async updateDeadline(keyId,expectedVersion,input){
   const data=allowed(input,FIELDS),patch=patchColumns(data,false);
   const result=await versioned('update',keyId,expectedVersion,patch);
   return result as StudyReceipt<DeadlineRecord>;
  },
  async completeDeadline(keyId,version){
   return await versioned('complete',keyId,version) as StudyReceipt<DeadlineRecord>;
  },
  async reopenDeadline(keyId,version){
   return await versioned('reopen',keyId,version) as StudyReceipt<DeadlineRecord>;
  },
  async cancelDeadline(keyId,version){
   return await versioned('cancel',keyId,version) as StudyReceipt<DeadlineRecord>;
  },
  async restoreDeadline(keyId,version){
   return await versioned('restore',keyId,version) as StudyReceipt<DeadlineRecord>;
  },
  async deleteDeadline(keyId,version){
   return await versioned('delete',keyId,version) as StudyReceipt<{id:string}>;
  },
 };
}
