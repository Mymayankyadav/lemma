// N64.2: authenticated, owner-RLS study-event reads and audited RPC lifecycle.
// No browser-supplied owner/source/voided metadata or unaudited table writes.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {NewStudyEvent,StudyEventApi,StudyEventKind,StudyEventPage,
 StudyEventPatch,StudyEventQuery,StudyEventRecord} from './contract';
import {applyStudyEventPatch,studyEventId,studyEventInstant,studyEventVersion,
 validateNewStudyEvent,validateStudyEventPatch,validateStudyEventQuery} from './model';

type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Changed={id:string;version:number;resource?:string;table?:string};
type CommandReceipt={status:'ok'|'conflict';changed?:Changed[];
 actionNo?:number|null;conflict?:{currentVersion?:number;reason?:string}};
type Operation='record'|'edit'|'void'|'restore';
type Envelope={operationId:string;schemaVersion:1;resource:'study_events';
 operation:Operation;patch:Row;target?:{id:string};expectedVersion?:number};
type Cursor={v:1;f:string;at:string;id:string};
const KINDS:StudyEventKind[]=['notice','drift','urge'];
const clone=<T>(value:T):T=>structuredClone(value);
const fail=(code:'invalid'|'conflict'|'not_found'|'server',message:string):never=>{
 throw new LemmaError(code,message);
};
async function client(){return (await import('../live/client')).liveClient()}
function newId():string{
 const crypto=globalThis.crypto;
 if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
 if(!crypto?.getRandomValues)return fail('server','Secure operation ID unavailable');
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
  hex.slice(16,20),hex.slice(20)].join('-');
}
function sqlError(e:SqlError):Error{
 const msg=e.message??'Study event command failed',code=e.code??'';
 if(code==='PGRST202'||code==='42883'||/could not find.*function|undefined function/i.test(msg))
  return new Error('Study events command N50.2 is not deployed; no write applied');
 if(code==='23505'||/conflict|version|operation.?id|changed.?payload|already exists/i.test(msg))
  return new LemmaError('conflict',msg);
 if(/not found|no rows|missing owner/i.test(msg))return new LemmaError('not_found',msg);
 if(['22P02','23503','23514','22007','22008'].includes(code)||
  /unknown|invalid|required|unsupported|must be|constraint|forbidden/i.test(msg))
  return new LemmaError('invalid',msg);
 return new LemmaError('server',msg);
}
function check(result:{error:SqlError|null}):void{
 if(result.error)throw sqlError(result.error);
}
function columns(input:NewStudyEvent|StudyEventPatch):Row{
 const out:Row={};
 for(const [field,column] of [
  ['entryId','entry_id'],['kind','kind'],['occurredAt','occurred_at'],
  ['durationMinutes','duration_minutes'],['note','note'],
  ['relatedKind','related_kind'],['relatedId','related_id'],
 ] as const){
  const value=input[field];
  if(value!==undefined)out[column]=value;
 }
 return out;
}
function mapRow(value:Row):StudyEventRecord{
 const id=studyEventId(value.id),version=studyEventVersion(value.version);
 const occurredAt=studyEventInstant(value.occurred_at);
 const normalized=validateNewStudyEvent({
  entryId:studyEventId(value.entry_id),kind:value.kind as StudyEventKind,
  occurredAt,durationMinutes:value.duration_minutes as number|null,
  note:value.note as string|null,
  relatedKind:value.related_kind==null?null:value.related_kind as StudyEventRecord['relatedKind'],
  relatedId:value.related_id==null?null:value.related_id as string,
 });
 if(!['app','mcp','worker'].includes(String(value.source)))
  return fail('server','Invalid owner-visible event source');
 return {
  id,entryId:normalized.entryId,kind:normalized.kind,
  occurredAt,durationMinutes:normalized.durationMinutes??null,note:normalized.note??null,
  relatedKind:normalized.relatedKind??null,relatedId:normalized.relatedId??null,
  voidedAt:value.voided_at===null?null:studyEventInstant(value.voided_at),
  version,source:value.source as StudyEventRecord['source'],
  createdAt:studyEventInstant(value.created_at),
  updatedAt:studyEventInstant(value.updated_at),
 };
}
function filterKey(query:StudyEventQuery):string{
 return JSON.stringify([query.entryId??null,
  KINDS.filter(k=>query.kind?.includes(k)).join(','),query.includeVoided===true]);
}
function encode(row:StudyEventRecord,f:string):string{
 return btoa(JSON.stringify({v:1,f,at:row.occurredAt,id:row.id}))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(raw:string|null|undefined,f:string):Cursor|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{8,1024}$/.test(raw))
   return fail('invalid','Invalid study event cursor');
  const data:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4)));
  if(!data||typeof data!=='object'||Array.isArray(data))
   return fail('invalid','Invalid study event cursor');
  const c=data as Cursor;
  if(c.v!==1||c.f!==f||studyEventInstant(c.at)!==c.at||
   studyEventId(c.id)!==c.id)
   return fail('invalid','Cursor belongs to a different study event filter');
  return c;
 }catch{return fail('invalid','Invalid or mismatched study event cursor')}
}
function ordered(a:Pick<StudyEventRecord,'occurredAt'|'id'>,
 b:Pick<StudyEventRecord,'occurredAt'|'id'>):number{
 return a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id);
}
async function scan(query:StudyEventQuery):Promise<Row[]>{
 const api=await client(),rows:Row[]=[];
 for(let start=0;start<=20000;start+=50){
  let builder=api.from('study_events').select('*')
   .order('occurred_at',{ascending:true}).order('id',{ascending:true});
  if(query.entryId)builder=builder.eq('entry_id',query.entryId);
  if(query.kind)builder=builder.in('kind',query.kind);
  if(!query.includeVoided)builder=builder.is('voided_at',null);
  const response=await builder.range(start,start+49);
  check(response);
  if(!Array.isArray(response.data)||response.data.length>50)
   return fail('server','Malformed owner-scoped study event page');
  rows.push(...response.data as Row[]);
  if(response.data.length<50)return rows;
 }
 return fail('server','Owner study event scan exceeds its bounded limit');
}
export function createLiveStudyEventApi():StudyEventApi{
 // Ambiguous network and post-command readback failures reuse the exact
 // original JSON operation envelope. Confirmed results clear the retry slot.
 const pending=new Map<string,Envelope>();
 async function readEvent(key:string):Promise<StudyEventRecord|null>{
  const api=await client();
  const result=await api.from('study_events').select('*')
   .eq('id',studyEventId(key)).maybeSingle();
  check(result);
  if(result.data===null)return null;
  if(!result.data||Array.isArray(result.data)||
     typeof result.data!=='object')
   return fail('server','Invalid event record returned through owner RLS');
  return mapRow(result.data as Row);
 }
 async function write<T>(operation:Operation,patch:Row,
  resolve:(change:Changed)=>Promise<T>,target?:string,expectedVersion?:number):
  Promise<StudyReceipt<T>>{
  const base:Omit<Envelope,'operationId'>={
   schemaVersion:1,resource:'study_events',operation,patch,
   ...(target?{target:{id:studyEventId(target)},
    expectedVersion:studyEventVersion(expectedVersion)}:{}),
  };
  const signature=JSON.stringify(base);
  const envelope:Envelope=pending.get(signature)??{...base,operationId:newId()};
  pending.set(signature,envelope);
  try{
   const api=await client();
   const result=await api.rpc('study_events_command',{p:envelope});
   check(result);
   const receipt=result.data as CommandReceipt|null;
   if(receipt?.status==='conflict')
    return fail('conflict','Study event operation conflict (current version '+
     (receipt.conflict?.currentVersion??'unknown')+')');
   if(receipt?.status!=='ok'||!Array.isArray(receipt.changed)||
    receipt.changed.length!==1||!Number.isSafeInteger(receipt.actionNo)||
    receipt.actionNo!<1)
    return fail('server','Invalid or unaudited study event command receipt');
   const change=receipt.changed[0];
   if((change.resource!==undefined&&change.resource!=='study_events')||
    (change.table!==undefined&&change.table!=='study_events')||
    typeof change.id!=='string'||
    !Number.isSafeInteger(change.version)||change.version<1||change.version>2147483647)
    return fail('server','Study event command receipt changed wrong resource');
   const normalized={id:studyEventId(change.id),version:change.version};
   const record=await resolve(normalized);
   pending.delete(signature);
   return {record:clone(record),actionNo:receipt.actionNo!};
  }catch(error){
   if(error instanceof LemmaError&&
    ['conflict','invalid','not_found'].includes(error.code)||
    error instanceof Error&&error.message.includes('N50.2 is not deployed'))
    pending.delete(signature);
   throw error;
  }
 }
 const checkedRead=async(change:Changed,
  action:Operation,target?:string):Promise<StudyEventRecord>=>{
  if(target&&change.id!==target)
   return fail('server','Command changed the wrong event');
  const record=await readEvent(change.id);
  if(!record||record.version!==change.version||
     record.source!=='app')
   return fail('server','Command outcome not visible through owner RLS');
  if(action==='record'&&record.voidedAt!==null||
     action==='void'&&record.voidedAt===null||
     action==='restore'&&record.voidedAt!==null)
   return fail('server','Command event state does not match its receipt');
  return record;
 };
 return {
  mode:'live',
  async listEvents(query:StudyEventQuery={}):Promise<StudyEventPage>{
   const q=validateStudyEventQuery(query),f=filterKey(q),cursor=decode(q.cursor,f);
   const rows=(await scan(q)).map(mapRow)
    .filter(r=>(!q.entryId||r.entryId===q.entryId)&&
     (!q.kind||q.kind.includes(r.kind))&&
     (q.includeVoided||r.voidedAt===null)).sort(ordered);
   const after=rows.filter(r=>!cursor||ordered(r,{occurredAt:cursor.at,id:cursor.id})>0);
   const items=after.slice(0,q.limit),last=items.at(-1);
   return {items:clone(items),total:rows.length,
    nextCursor:last&&after.length>q.limit?encode(last,f):null};
  },
  getEvent:readEvent,
  async recordEvent(input:NewStudyEvent){
   const valid=validateNewStudyEvent(input);
   return write('record',columns(valid),
    async change=>checkedRead(change,'record'));
  },
  async editEvent(key:string,expected:number,patch:StudyEventPatch){
   const id=studyEventId(key);
   studyEventVersion(expected);
   const changes=validateStudyEventPatch(patch);
   const previous=await readEvent(id);
   if(!previous)return fail('not_found','Study event not visible to owner');
   if(previous.voidedAt!==null)
    return fail('conflict','Cannot edit a voided study event');
   // Validate only the editable row projection; never pass server-managed
   // id/version/source/void state into the strict N64.1 write validator.
   const {entryId,kind,durationMinutes,note,relatedKind,relatedId}=previous;
   applyStudyEventPatch({
    entryId,kind,durationMinutes,note,relatedKind,relatedId,
   },changes);
   return write('edit',columns(changes),
    async change=>checkedRead(change,'edit',id),id,expected);
  },
  async voidEvent(key:string,expected:number){
   const id=studyEventId(key);
   studyEventVersion(expected);
   return write('void',{},async change=>checkedRead(change,'void',id),id,expected);
  },
  async restoreEvent(key:string,expected:number){
   const id=studyEventId(key);
   studyEventVersion(expected);
   return write('restore',{},async change=>checkedRead(change,'restore',id),id,expected);
  },
 };
}
