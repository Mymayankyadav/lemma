// N58.2.3 owner-RLS parked-thought adapter. No direct browser DML.
import type {NewTask,TaskDue,TaskRecord} from '../tasks/contract';
import {ThoughtError,type NewThought,type ThoughtApi,type ParkedThought,
 type ThoughtPatch,type ThoughtQuery,type ThoughtStatus} from './contract';
import {validateNewThought,validateThoughtPatch} from './model';

type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Change={resource?:string;id:string;version:number};
type Receipt={status:'ok'|'conflict';changed?:Change[];actionNo?:number|null;
 conflict?:{currentVersion?:number}};
type Op='create'|'edit'|'dismiss'|'reopen'|'delete'|'convert_to_task';
type Envelope={schemaVersion:1;resource:'parked_thoughts';operation:Op;
 operationId:string;patch:Row;target?:{id:string};expectedVersion?:number};
type Cursor={v:1;statuses:string;createdAt:string;id:string};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const STATUSES:ThoughtStatus[]=['open','dismissed','converted'];
const clone=<T>(x:T):T=>structuredClone(x);
const fail=(code:'invalid'|'conflict'|'not_found',msg:string):never=>{throw new ThoughtError(code,msg)};
const server=(msg:string):never=>{throw Error('Live parked thoughts: '+msg)};
async function client(){return (await import('../live/client')).liveClient()}
function id(s:unknown):string{
 if(typeof s!=='string'||!UUID.test(s))return fail('invalid','Expected UUID');
 return s.toLowerCase();
}
function ver(v:unknown):number{
 if(typeof v!=='number'||!Number.isInteger(v)||v<1||v>2147483647)
  return fail('invalid','Expected positive int4 version');
 return v;
}
function time(t:unknown):string{
 if(typeof t!=='string'||!Number.isFinite(Date.parse(t))||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(t))
  return server('Invalid owner timestamp');
 return new Date(t).toISOString();
}
function thought(row:Row):ParkedThought{
 const status=row.status as ThoughtStatus;
 if(!STATUSES.includes(status))return server('Invalid thought status');
 const result:ParkedThought={
  id:id(row.id),studyEntryId:row.study_entry_id==null?null:id(row.study_entry_id),
  text:String(row.text),status,destinationKind:row.destination_kind==null?null:'task',
  destinationId:row.destination_id==null?null:id(row.destination_id),
  resolvedAt:row.resolved_at==null?null:time(row.resolved_at),
  version:ver(row.version),createdAt:time(row.created_at),updatedAt:time(row.updated_at),
 };
 if(!result.text.trim()||result.text.length>4000||
  (status==='open'&&(result.resolvedAt!==null||result.destinationId!==null))||
  (status==='dismissed'&&(result.resolvedAt===null||result.destinationId!==null))||
  (status==='converted'&&(result.resolvedAt===null||result.destinationId===null)))
  return server('Invalid thought row');
 return result;
}
function task(row:Row):TaskRecord{
 const due:TaskDue=row.due_kind==='date'?{kind:'date',date:String(row.due_date)}
  :row.due_kind==='instant'?{kind:'instant',at:time(row.due_at)}:{kind:'none'};
 return {id:id(row.id),title:String(row.title),body:String(row.body??''),
  estimateMinutes:row.estimate_minutes==null?null:Number(row.estimate_minutes),
  priority:row.priority as TaskRecord['priority'],due,
  status:row.status as TaskRecord['status'],
  completedAt:row.completed_at==null?null:time(row.completed_at),
  position:Number(row.position),version:ver(row.version),
  createdAt:time(row.created_at),updatedAt:time(row.updated_at),
  subjectId:row.subject_id==null?null:id(row.subject_id),
  projectId:row.project_id==null?null:id(row.project_id),
  checkpointId:row.checkpoint_id==null?null:id(row.checkpoint_id)};
}
function sqlError(e:SqlError):Error{
 const msg=e.message||'Owner command failed';
 if(['42883','PGRST202'].includes(e.code??'')||/undefined function|function .*not found/i.test(msg))
  return Error('Live parked thoughts: N44.2 command is not deployed');
 if(e.code==='23505'||/conflict|version|stale|reused/i.test(msg))
  return new ThoughtError('conflict',msg);
 if(/not found|not owned/i.test(msg))return new ThoughtError('not_found',msg);
 if(['22P02','23503','23514'].includes(e.code??'')||/invalid|required|unknown|must be/i.test(msg))
  return new ThoughtError('invalid',msg);
 return Error('Live parked thoughts: '+msg);
}
function secureId():string{
 const c=globalThis.crypto;
 if(typeof c?.randomUUID==='function')return c.randomUUID();
 if(!c?.getRandomValues)return server('Secure UUID unavailable');
 const bytes=c.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const s=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
 return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
function normalizedQuery(q:ThoughtQuery={}):{statuses:ThoughtStatus[];limit:number;cursor:Cursor|null}{
 if(!q||typeof q!=='object'||Array.isArray(q)||
  Object.keys(q).some(k=>!['status','limit','cursor'].includes(k)))
  return fail('invalid','Unknown thought query');
 const statuses=q.status??['open'];
 if(!Array.isArray(statuses)||new Set(statuses).size!==statuses.length||
  statuses.some(s=>!STATUSES.includes(s)))return fail('invalid','Invalid statuses');
 const ordered=STATUSES.filter(s=>statuses.includes(s));
 const limit=q.limit??20;
 if(!Number.isInteger(limit)||limit<1||limit>50)return fail('invalid','Limit is 1–50');
 let cursor:Cursor|null=null;
 if(q.cursor!=null){
  try{
   if(typeof q.cursor!=='string'||q.cursor.length>4096||!/^[A-Za-z0-9_-]+$/.test(q.cursor))
    return fail('invalid','Invalid cursor');
   const object:unknown=JSON.parse(atob(q.cursor.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-q.cursor.length%4)%4)));
   if(!object||typeof object!=='object')return fail('invalid','Malformed cursor');
   cursor=object as Cursor;
   if(cursor.v!==1||cursor.statuses!==ordered.join(',')||!UUID.test(cursor.id)||
    !Number.isFinite(Date.parse(cursor.createdAt)))
    return fail('invalid','Cursor filter mismatch');
  }catch{return fail('invalid','Invalid cursor')}
 }
 return {statuses:ordered,limit,cursor};
}
function order(a:Pick<ParkedThought,'createdAt'|'id'>,
 b:Pick<ParkedThought,'createdAt'|'id'>):number{
 return a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
}
function cursorFor(v:ParkedThought,statuses:ThoughtStatus[]):string{
 return btoa(JSON.stringify({v:1,statuses:statuses.join(','),
  createdAt:v.createdAt,id:v.id})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function taskColumns(input:NewTask):Row{
 if(!input||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).some(k=>!['title','body','estimateMinutes','priority',
   'due','position','subjectId','projectId','checkpointId'].includes(k)))
  return fail('invalid','Invalid task input');
 if(typeof input.title!=='string'||!input.title.trim())return fail('invalid','Task title required');
 if(input.estimateMinutes!==undefined&&input.estimateMinutes!==null&&
  (!Number.isSafeInteger(input.estimateMinutes)||input.estimateMinutes<0||
  input.estimateMinutes>2147483647))return fail('invalid','Invalid task estimate');
 if(input.position!==undefined&&(!Number.isSafeInteger(input.position)||
  input.position< -2147483648||input.position>2147483647))
  return fail('invalid','Invalid task position');
 if(input.body!==undefined&&typeof input.body!=='string')
  return fail('invalid','Invalid task body');
 if(input.priority!==undefined&&!['low','normal','high'].includes(input.priority))
  return fail('invalid','Invalid task priority');
 const due=input.due??{kind:'none'};
 if(due.kind==='date'&&!/^\d{4}-\d\d-\d\d$/.test(due.date))
  return fail('invalid','Invalid task due date');
 if(due.kind==='instant'&&(!Number.isFinite(Date.parse(due.at))||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(due.at)))
  return fail('invalid','Invalid task due instant');
 if(!['none','date','instant'].includes(due.kind))return fail('invalid','Invalid task due');
 for(const link of [input.subjectId,input.projectId,input.checkpointId])
  if(link!==null&&link!==undefined)id(link);
 return {title:input.title.trim(),due_kind:due.kind,
  ...(input.body!==undefined?{body:input.body}:{}),
  ...(input.priority!==undefined?{priority:input.priority}:{}),
  ...(input.position!==undefined?{position:input.position}:{}),
  ...(input.estimateMinutes!==undefined?{estimate_minutes:input.estimateMinutes}:{}),
  ...(due.kind==='date'?{due_date:due.date}:{}),
  ...(due.kind==='instant'?{due_at:due.at}:{}),
  ...('subjectId'in input?{subject_id:input.subjectId}:{}),
  ...('projectId'in input?{project_id:input.projectId}:{}),
  ...('checkpointId'in input?{checkpoint_id:input.checkpointId}:{}),
 };
}
export function createLiveThoughtApi():ThoughtApi{
 const retry=new Map<string,Envelope>();
 async function getThought(key:string):Promise<ParkedThought|null>{
  const c=await client(),result=await c.from('parked_thoughts')
   .select('*').eq('id',id(key)).maybeSingle();
  if(result.error)throw sqlError(result.error);
  if(result.data===null)return null;
  if(!result.data||Array.isArray(result.data))return server('Malformed thought row');
  return clone(thought(result.data as Row));
 }
 async function readTask(key:string):Promise<TaskRecord|null>{
  const c=await client(),result=await c.from('tasks')
   .select('*').eq('id',id(key)).maybeSingle();
  if(result.error)throw sqlError(result.error);
  return result.data===null?null:task(result.data as Row);
 }
 async function write<T>(op:Op,fields:{target?:{id:string};expectedVersion?:number;patch:Row},
  resolve:(r:Receipt)=>Promise<T>):Promise<{record:T;actionNo:number|null}>{
  const base={schemaVersion:1 as const,resource:'parked_thoughts' as const,operation:op,...fields};
  const key=JSON.stringify(base),envelope=retry.get(key)??{...base,operationId:secureId()};
  retry.set(key,envelope);
  try{
   const c=await client(),response=await c.rpc('parked_thoughts_command',{p:envelope});
   if(response.error)throw sqlError(response.error);
   const receipt=response.data as Receipt|null;
   if(receipt?.status==='conflict')
    return fail('conflict','Owner thought version conflict (current '+
     String(receipt.conflict?.currentVersion??'unknown')+')');
   if(receipt?.status!=='ok'||!Array.isArray(receipt.changed)||
    receipt.changed.length<1||receipt.changed.some(ch=>!UUID.test(ch.id)||
     !Number.isInteger(ch.version)||ch.version<1)||
    !Number.isSafeInteger(receipt.actionNo)||receipt.actionNo!<1)
    return server('Malformed or unaudited command receipt');
   const record=await resolve(receipt);
   retry.delete(key);
   return {record:clone(record),actionNo:receipt.actionNo!};
  }catch(error){
   if(error instanceof ThoughtError||
    (error instanceof Error&&error.message.includes('not deployed')))retry.delete(key);
   throw error;
  }
 }
 const api:ThoughtApi={mode:'live',
  async listThoughts(q:ThoughtQuery={}){
   const opts=normalizedQuery(q);
   if(!opts.statuses.length)return {items:[],total:0,nextCursor:null};
   const c=await client(),all:ParkedThought[]=[];
   for(let offset=0;offset<=20000;offset+=50){
    const result=await c.from('parked_thoughts').select('*')
     .in('status',opts.statuses).order('created_at',{ascending:true})
     .order('id',{ascending:true}).range(offset,offset+49);
    if(result.error)throw sqlError(result.error);
    if(!Array.isArray(result.data)||result.data.length>50)
     return server('Malformed bounded owner page');
    all.push(...(result.data as Row[]).map(thought));
    if(result.data.length<50)break;
    if(offset===20000)return server('Owner scan safety bound exceeded');
   }
   all.sort(order);
   const after=all.filter(t=>!opts.cursor||order(t,opts.cursor)>0);
   const items=after.slice(0,opts.limit),last=items.at(-1);
   return {items:clone(items),total:all.length,nextCursor:last&&after.length>opts.limit?
    cursorFor(last,opts.statuses):null};
  },
  getThought,
  async createThought(input:NewThought){
   const n=validateNewThought(input);
   return write('create',{patch:{text:n.text,study_entry_id:n.studyEntryId??null}},
    async r=>{
     const changed=r.changed![0],item=await getThought(changed.id);
     if(r.changed!.length!==1||!item||item.version!==changed.version)
      return server('Created thought missing after receipt');
     return item;
    });
  },
  async editThought(key:string,expected:number,patch:ThoughtPatch){
   const n=validateThoughtPatch(patch);
   if(!Object.keys(n).length)return fail('invalid','Empty thought patch');
   const target=id(key);ver(expected);
   const columns:Row={...('text'in n?{text:n.text}:{}),
    ...('studyEntryId'in n?{study_entry_id:n.studyEntryId}:{})};
   return write('edit',{target:{id:target},expectedVersion:expected,patch:columns},
    async r=>{
     const row=await getThought(target),changed=r.changed![0];
     if(!row||row.version!==changed.version||changed.id!==target)
      return server('Edited thought readback mismatch');
     return row;
    });
  },
  async dismissThought(key:string,expected:number){
   const target=id(key);ver(expected);
   return write('dismiss',{target:{id:target},expectedVersion:expected,patch:{}},
    async r=>{
     const row=await getThought(target);
     if(!row||row.status!=='dismissed'||row.version!==r.changed![0].version)
      return server('Dismiss readback mismatch');
     return row;
    });
  },
  async reopenThought(key:string,expected:number){
   const target=id(key);ver(expected);
   return write('reopen',{target:{id:target},expectedVersion:expected,patch:{}},
    async r=>{
     const row=await getThought(target);
     if(!row||row.status!=='open'||row.version!==r.changed![0].version)
      return server('Reopen readback mismatch');
     return row;
    });
  },
  async deleteThought(key:string,expected:number){
   const target=id(key);ver(expected);
   return write('delete',{target:{id:target},expectedVersion:expected,patch:{}},
    async r=>{
     if(r.changed![0].id!==target||await getThought(target))
      return server('Deleted thought still visible');
     return {id:target};
    });
  },
  async convertToTask(key:string,expected:number,input:NewTask){
   const target=id(key);ver(expected);
   return write('convert_to_task',{target:{id:target},expectedVersion:expected,
    patch:taskColumns(input)},async r=>{
     const changes=r.changed!;
     const a=changes.find(x=>x.resource==='parked_thoughts');
     const b=changes.find(x=>x.resource==='tasks');
     if(changes.length!==2||!a||!b)return server('Nonatomic conversion receipt');
     const linked=await getThought(target),real=await readTask(b.id);
     if(!linked||!real||linked.version!==a.version||real.version!==b.version||
      linked.status!=='converted'||linked.destinationId!==real.id)
      return server('Thought and task were not both readable after commit');
     return {thought:linked,task:real};
    });
  },
 };
 return api;
}
