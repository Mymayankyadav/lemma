import {LemmaError} from '../api';
import type {NewStudyGoal,StudyGoalApi,StudyGoalPatch,StudyGoalQuery,StudyGoalRecord} from './contract';
import {cursorOf,invalid,queryOptions,validate,validatedRange} from './shared';
import type {StudyReceipt} from '../study/contract';
type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Changed={id:string;version:number};
type Response={status:'ok'|'conflict';changed:Changed[];actionNo?:number|null;conflict?:{currentVersion?:number}};
async function client(){return (await import('../live/client')).liveClient()}
const fail=(code:'server'|'not_found'|'conflict',message:string):never=>{throw new LemmaError(code,message)};
function mapError(error:SqlError):LemmaError{
 const message=error.message??'Study goals operation failed';
 if(error.code==='23505'||/conflict|version|duplicate|overlap/i.test(message))
  return new LemmaError('conflict',message);
 if(/not found|no rows/i.test(message))return new LemmaError('not_found',message);
 if(['23503','23514','22P02'].includes(error.code??'')||/invalid|required|constraint|unsupported|must be/i.test(message))
  return new LemmaError('invalid',message);
 return new LemmaError('server',message);
}
function unwrap<T>(value:{data:T|null;error:SqlError|null}):T{
 if(value.error)throw mapError(value.error);
 return value.data as T;
}
function uuid():string {
 const c=globalThis.crypto;
 if(c?.randomUUID)return c.randomUUID();
 if(!c?.getRandomValues)return fail('server','Secure operation ID unavailable');
 const b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function fromRow(row:Row):StudyGoalRecord {
 return {
  id:String(row.id),period:row.period as StudyGoalRecord['period'],
  startDate:String(row.start_date),endDate:String(row.end_date),
  timeZone:String(row.time_zone),targetMinutes:Number(row.target_minutes),
  subjectId:row.subject_id==null?null:String(row.subject_id),
  projectId:row.project_id==null?null:String(row.project_id),
  archivedAt:row.archived_at==null?null:String(row.archived_at),
  source:row.source as StudyGoalRecord['source'],
  version:Number(row.version),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
 };
}
function columns(input:StudyGoalPatch):Row{
 validate(input);
 const out:Row={};
 for(const [key,column] of [
  ['period','period'],['startDate','start_date'],['endDate','end_date'],
  ['timeZone','time_zone'],['targetMinutes','target_minutes'],
  ['subjectId','subject_id'],['projectId','project_id'],
 ] as const)if(input[key]!==undefined)out[column]=input[key];
 return out;
}
function version(v:number):void {
 if(!Number.isSafeInteger(v)||v<1)invalid('Expected goal version must be positive');
}
type Operation='create'|'update'|'archive'|'restore'|'delete';
export function createLiveStudyGoalApi():StudyGoalApi{
 const retryIds=new Map<string,string>();
 async function get(id:string):Promise<StudyGoalRecord|null>{
  const api=await client();
  const row=unwrap<Row|null>(await api.from('study_goals').select('*').eq('id',id).maybeSingle());
  return row?fromRow(row):null;
 }
 async function write<T>(operation:Operation,args:Row,resolve:(value:Changed)=>Promise<T>):Promise<StudyReceipt<T>>{
  const base={schemaVersion:1,resource:'study_goals',operation,...args};
  const signature=JSON.stringify(base),operationId=retryIds.get(signature)??uuid();
  let applied=false;
  try {
   const api=await client();
   const result=unwrap<Response>(await api.rpc('study_goals_command',{p:{operationId,...base}}));
   if(result?.status==='conflict')
    fail('conflict','Goal changed elsewhere (current version '+(result.conflict?.currentVersion??'unknown')+')');
   if(result?.status!=='ok'||!Array.isArray(result.changed)||result.changed.length!==1||
    typeof result.changed[0].id!=='string'||!Number.isSafeInteger(result.changed[0].version))
    fail('server','Invalid study_goals_command receipt');
   applied=true;
   const record=await resolve(result.changed[0]);
   retryIds.delete(signature);
   return {record,actionNo:Number.isSafeInteger(result.actionNo)?result.actionNo!:null};
  }catch(error){
   if(applied||!(error instanceof LemmaError)||error.code==='server'||error.code==='offline')
    retryIds.set(signature,operationId);
   else retryIds.delete(signature);
   throw error;
  }
 }
 async function change(operation:Operation,id:string,expectedVersion:number,patch:StudyGoalPatch={}){
  version(expectedVersion);
  return write(operation,{target:{id},expectedVersion,patch:columns(patch)},
   async changed=>(await get(changed.id))??fail('not_found','Updated goal not visible'));
 }
 return {
  mode:'live',
  async listStudyGoals(query:StudyGoalQuery={}){
   const {limit,archived,cursor}=queryOptions(query);
   const api=await client();
   // Counts are exact for the chosen archive filter; never use a fabricated total.
   let countQuery=api.from('study_goals').select('id',{count:'exact',head:true});
   if(archived==='active')countQuery=countQuery.is('archived_at',null);
   if(archived==='archived')countQuery=countQuery.not('archived_at','is',null);
   const counted=await countQuery;
   if(counted.error)throw mapError(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count===null||counted.count<0)
    fail('server','Study goal total unavailable');
   let read=api.from('study_goals').select('*');
   if(archived==='active')read=read.is('archived_at',null);
   if(archived==='archived')read=read.not('archived_at','is',null);
   if(cursor)read=read.or('start_date.gt.'+cursor.s+
    ',and(start_date.eq.'+cursor.s+',id.gt.'+cursor.i+')');
   const rows=unwrap<Row[]>(await read.order('start_date',{ascending:true})
    .order('id',{ascending:true}).limit(limit+1));
   const items=rows.slice(0,limit).map(fromRow),last=items.at(-1);
   return {items,total:counted.count!,nextCursor:rows.length>limit&&last?cursorOf(last,archived):null};
  },
  getStudyGoal:get,
  async createStudyGoal(input:NewStudyGoal){
   validate(input);validatedRange(input);
   if(!input.period||!input.timeZone||input.targetMinutes===undefined)
    invalid('Goal period, time zone and target required');
   return write('create',{patch:columns(input)},async changed=>
    (await get(changed.id))??fail('not_found','Created goal not visible'));
  },
  updateStudyGoal:(id,v,patch)=>change('update',id,v,patch),
  archiveStudyGoal:(id,v)=>change('archive',id,v),
  restoreStudyGoal:(id,v)=>change('restore',id,v),
  async deleteStudyGoal(id,expectedVersion){
   version(expectedVersion);
   return write('delete',{target:{id},expectedVersion,patch:{}},async changed=>({id:changed.id}));
  },
 };
}
