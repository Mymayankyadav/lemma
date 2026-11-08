// N59.2: authenticated owner-RLS study goals and receipt-backed command writes.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {GoalApi,GoalPage,GoalPatch,GoalQuery,GoalRecord,NewGoal} from './contract';

type Row=Record<string,unknown>;
type DbError={code?:string;message?:string};
type Operation='create'|'update'|'archive'|'restore'|'delete';
type Envelope={
 operationId:string;schemaVersion:1;resource:'study_goals';operation:Operation;
 target?:{id:string};expectedVersion?:number;patch:Row;
};
type Receipt={status:'ok'|'conflict';actionNo?:number|null;
 changed?:Array<{id:string;version:number}>;goal?:Row;
 conflict?:{reason?:string;currentVersion?:number}};
type Cursor={v:1;filter:string;key:[string,string,string]};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODS=['week','month','custom'] as const;
const FIELDS={
 period:'period',startDate:'start_date',endDate:'end_date',
 timeZone:'time_zone',targetMinutes:'target_minutes',
 subjectId:'subject_id',projectId:'project_id',
} as const;
const fail=(code:'invalid'|'not_found'|'conflict'|'server',message:string):never=>{
 throw new LemmaError(code,message);
};
async function client(){return (await import('../live/client')).liveClient()}
function uuid():string{
 const random=globalThis.crypto;
 if(typeof random?.randomUUID==='function')return random.randomUUID();
 if(!random?.getRandomValues)return fail('server','Secure operation IDs unavailable');
 const bytes=new Uint8Array(16);random.getRandomValues(bytes);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function id(value:unknown):string{
 if(typeof value!=='string'||!UUID.test(value))
  return fail('invalid','Study goal ID must be a UUID');
 return value.toLowerCase();
}
function date(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value))
  return fail('invalid','Goal date must use YYYY-MM-DD');
 const parsed=new Date(value+'T00:00:00.000Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)
  return fail('invalid','Invalid goal civil date');
 return value;
}
function zone(value:unknown):string{
 if(typeof value!=='string'||!value.trim()||value.length>100)
  return fail('invalid','Goal time zone is required');
 try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date())}
 catch{return fail('invalid','Invalid goal IANA time zone')}
 return value;
}
function scopeId(value:unknown):string|null{
 return value==null?null:id(value);
}
function minutes(value:unknown):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>100000)
  return fail('invalid','Goal target must be 1–100000 whole minutes');
 return value;
}
function period(value:unknown):GoalRecord['period']{
 if(typeof value!=='string'||!PERIODS.includes(value as GoalRecord['period']))
  return fail('invalid','Invalid study goal period');
 return value as GoalRecord['period'];
}
function columns(input:unknown,create:boolean):Row{
 if(!input||typeof input!=='object'||Array.isArray(input))
  return fail('invalid','Goal fields must be an object');
 const values=input as Row,patch:Row={};
 for(const [key,value] of Object.entries(values)){
  if(!(key in FIELDS))fail('invalid','Unknown goal field '+key);
  if(value===undefined)continue;
  const target=FIELDS[key as keyof typeof FIELDS];
  if(key==='period')patch[target]=period(value);
  else if(key==='startDate'||key==='endDate')patch[target]=date(value);
  else if(key==='timeZone')patch[target]=zone(value);
  else if(key==='targetMinutes')patch[target]=minutes(value);
  else patch[target]=scopeId(value);
 }
 if(create){
  for(const key of ['period','start_date','end_date','time_zone','target_minutes'])
   if(!(key in patch))fail('invalid','Missing required study goal field '+key);
 }
 if(!Object.keys(patch).length)fail('invalid','Empty study goal update');
 if(patch.start_date!==undefined&&patch.end_date!==undefined&&
    String(patch.start_date)>String(patch.end_date))
  fail('invalid','Goal end date cannot precede start date');
 return patch;
}
function mapGoal(row:Row):GoalRecord{
 if(!row||typeof row!=='object'||Array.isArray(row))
  return fail('server','Malformed owner goal row');
 const start=date(row.start_date),end=date(row.end_date);
 if(start>end)fail('server','Malformed owner goal dates');
 const version=row.version;
 if(typeof version!=='number'||!Number.isSafeInteger(version)||version<1)
  return fail('server','Malformed goal version');
 const timestamps=['created_at','updated_at'];
 for(const key of timestamps)if(typeof row[key]!=='string'||
    !Number.isFinite(Date.parse(row[key] as string)))
  return fail('server','Malformed goal timestamp');
 if(row.archived_at!==null&&row.archived_at!==undefined&&
    (typeof row.archived_at!=='string'||!Number.isFinite(Date.parse(row.archived_at))))
  return fail('server','Malformed archived timestamp');
 return {
  id:id(row.id),period:period(row.period),startDate:start,endDate:end,
  timeZone:zone(row.time_zone),targetMinutes:minutes(row.target_minutes),
  subjectId:scopeId(row.subject_id),projectId:scopeId(row.project_id),
  archivedAt:row.archived_at==null?null:String(row.archived_at),
  version,createdAt:String(row.created_at),updatedAt:String(row.updated_at),
 };
}
function errorFor(error:DbError):LemmaError{
 const message=error.message||'Study goals database operation failed';
 if(/not found for owner|goal not found|no rows/i.test(message))
  return new LemmaError('not_found',message);
 if(error.code==='23505'||/overlapping active goal|overlap|conflict|stale|version changed/i.test(message))
  return new LemmaError('conflict',message);
 if(['23503','23514','22P02','22007','22008'].includes(error.code||'')||
    /invalid|required|unsupported|unknown|constraint|cannot update|already archived|only archived/i.test(message))
  return new LemmaError('invalid',message);
 return new LemmaError('server',message);
}
function unwrap<T>(response:{data:T|null;error:DbError|null}):T{
 if(response.error)throw errorFor(response.error);
 return response.data as T;
}
function queryOptions(query:GoalQuery={}){
 if(!query||typeof query!=='object'||Array.isArray(query))
  return fail('invalid','Invalid study goal filter');
 const limit=query.limit??20;
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)
  return fail('invalid','Study goal page size must be 1–50');
 if(query.includeArchived!==undefined&&typeof query.includeArchived!=='boolean')
  return fail('invalid','Invalid archived filter');
 for(const key of ['subjectId','projectId'] as const)
  if(query[key]!==undefined&&query[key]!==null)scopeId(query[key]);
 const includeArchived=query.includeArchived===true;
 const filter=JSON.stringify([includeArchived,
  query.subjectId===undefined?'*':query.subjectId,
  query.projectId===undefined?'*':query.projectId]);
 let cursor:Cursor|null=null;
 if(query.cursor!==undefined&&query.cursor!==null){
  const raw=query.cursor;
  if(typeof raw!=='string'||raw.length<4||raw.length>1024||
     !/^[A-Za-z0-9_-]+$/.test(raw))
   return fail('invalid','Invalid study goal cursor');
  try{
   cursor=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-raw.length%4)%4))) as Cursor;
  }catch{return fail('invalid','Invalid study goal cursor')}
  if(!cursor||cursor.v!==1||cursor.filter!==filter||
     !Array.isArray(cursor.key)||cursor.key.length!==3)
   return fail('invalid','Goal cursor belongs to another filter');
  date(cursor.key[0]);date(cursor.key[1]);id(cursor.key[2]);
 }
 return {limit,includeArchived,filter,cursor};
}
function key(goal:GoalRecord):Cursor['key']{
 return [goal.startDate,goal.endDate,goal.id];
}
function encode(cursor:Cursor):string{
 return btoa(JSON.stringify(cursor)).replace(/\+/g,'-').replace(/\//g,'_')
  .replace(/=+$/,'');
}
function after(cursor:Cursor):string{
 const [start,end,goalId]=cursor.key;
 return [
  'start_date.gt.'+start,
  'and(start_date.eq.'+start+',end_date.gt.'+end+')',
  'and(start_date.eq.'+start+',end_date.eq.'+end+',id.gt.'+goalId+')',
 ].join(',');
}
function withFilters<T extends {is:(key:string,value:null)=>T;
 eq:(key:string,value:string)=>T}>(builder:T,query:GoalQuery,includeArchived:boolean):T{
 let result=builder;
 if(!includeArchived)result=result.is('archived_at',null);
 for(const [key,column] of [['subjectId','subject_id'],['projectId','project_id']] as const){
  const value=query[key];
  if(value===null)result=result.is(column,null);
  else if(value!==undefined)result=result.eq(column,id(value));
 }
 return result;
}
function positiveVersion(value:number):number{
 if(!Number.isSafeInteger(value)||value<1||value>2147483647)
  return fail('invalid','Positive expectedVersion required');
 return value;
}
export function createLiveGoalApi():GoalApi{
 // Keep an operation's exact envelope after unknown network/receipt outcomes.
 // Explicit retries of the same action replay the same server operationId.
 const pending=new Map<string,Envelope>();
 async function run(operation:Operation,fields:Omit<Envelope,
  'operationId'|'schemaVersion'|'resource'|'operation'>):
  Promise<StudyReceipt<GoalRecord|{id:string}>>{
  const identity=JSON.stringify([operation,fields]);
  let envelope=pending.get(identity);
  if(!envelope){
   envelope={operationId:uuid(),schemaVersion:1,resource:'study_goals',operation,
    ...structuredClone(fields)};
   pending.set(identity,envelope);
  }
  const db=await client();
  let receipt:Receipt|undefined;
  for(let attempt=0;attempt<2;attempt++){
   let response:{data:unknown;error:DbError|null};
   try{response=await db.rpc('study_goals_command',{p:envelope})}
   catch{
    if(attempt===0)continue;
    return fail('server','Study goal outcome unknown; retry the same action');
   }
   if(response.error){
    const parsed=errorFor(response.error);
    if(parsed.code==='server'&&attempt===0)continue;
    if(parsed.code!=='server')pending.delete(identity);
    throw parsed;
   }
   if(!response.data||typeof response.data!=='object'||Array.isArray(response.data)){
    if(attempt===0)continue;
    return fail('server','Missing study goal receipt; retry the same action');
   }
   receipt=response.data as Receipt;
   break;
  }
  if(!receipt)return fail('server','Missing study goal command response');
  if(receipt.status==='conflict'){
   pending.delete(identity);
   return fail('conflict',receipt.conflict?.reason||
    'Study goal changed (current version '+String(receipt.conflict?.currentVersion??'unknown')+')');
  }
  if(receipt.status!=='ok'||!Number.isSafeInteger(receipt.actionNo)||
     Number(receipt.actionNo)<1||!Array.isArray(receipt.changed)||
     receipt.changed.length!==1)
   return fail('server','Malformed study goal receipt; retry the same action');
  const changed=receipt.changed[0];
  const changedId=id(changed.id);
  if(!Number.isSafeInteger(changed.version)||changed.version<1)
   return fail('server','Malformed goal change version');
  const actionNo=Number(receipt.actionNo);
  if(operation==='delete'){
   pending.delete(identity);
   return {record:{id:changedId},actionNo};
  }
  if(!receipt.goal||typeof receipt.goal!=='object'||Array.isArray(receipt.goal))
   return fail('server','Missing study goal record in receipt');
  const record=mapGoal(receipt.goal);
  if(record.id!==changedId||record.version!==changed.version)
   return fail('server','Goal receipt identity does not match saved record');
  pending.delete(identity);
  return {record,actionNo};
 }
 const versioned=(operation:Operation,goalId:string,expectedVersion:number,patch:Row={})=>
  run(operation,{target:{id:id(goalId)},expectedVersion:positiveVersion(expectedVersion),patch});
 return {
  mode:'live',
  async listGoals(query={}):Promise<GoalPage>{
   const {limit,includeArchived,filter,cursor}=queryOptions(query);
   const db=await client();
   const count=await withFilters(db.from('study_goals')
    .select('id',{count:'exact',head:true}),query,includeArchived);
   if(count.error)throw errorFor(count.error);
   if(count.count===null||!Number.isSafeInteger(count.count)||count.count<0)
    return fail('server','Exact owner goal total unavailable');
   let builder=withFilters(db.from('study_goals').select('*'),query,includeArchived);
   if(cursor)builder=builder.or(after(cursor));
   const result=await builder.order('start_date',{ascending:true})
    .order('end_date',{ascending:true}).order('id',{ascending:true}).limit(limit+1);
   const rows=unwrap<Row[]>(result);
   if(!Array.isArray(rows)||rows.length>limit+1)
    return fail('server','Malformed bounded owner goal page');
   const items=rows.slice(0,limit).map(mapGoal);
   return {items,total:count.count,nextCursor:rows.length>limit&&items.length?
    encode({v:1,filter,key:key(items[items.length-1])}):null};
  },
  async getGoal(goalId){
   const db=await client();
   const row=unwrap<Row|null>(await db.from('study_goals').select('*')
    .eq('id',id(goalId)).maybeSingle());
   return row?mapGoal(row):null;
  },
  async createGoal(input:NewGoal){
   return run('create',{patch:columns(input,true)}) as Promise<StudyReceipt<GoalRecord>>;
  },
  async updateGoal(goalId,expectedVersion,patch:GoalPatch){
   return versioned('update',goalId,expectedVersion,columns(patch,false))
    as Promise<StudyReceipt<GoalRecord>>;
  },
  async archiveGoal(goalId,expectedVersion){
   return versioned('archive',goalId,expectedVersion) as Promise<StudyReceipt<GoalRecord>>;
  },
  async restoreGoal(goalId,expectedVersion){
   return versioned('restore',goalId,expectedVersion) as Promise<StudyReceipt<GoalRecord>>;
  },
  async deleteGoal(goalId,expectedVersion){
   return versioned('delete',goalId,expectedVersion) as Promise<StudyReceipt<{id:string}>>;
  },
 };
}
