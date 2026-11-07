// N57.2: authenticated, RLS-scoped practice topics/events adapter.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {NewPracticeEvent,NewPracticeTopic,PracticeCadence,PracticeChange,
 PracticeEventQuery,PracticeEventRecord,PracticePage,PracticeRating,
 PracticeTopicApi,PracticeTopicPatch,PracticeTopicQuery,PracticeTopicRecord} from './contract';

type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Change={id:string;version:number;table?:string;resource?:string};
type CommandReceipt={status:'ok'|'conflict';changed:Change[];actionNo?:number|null;
 conflict?:{currentVersion?:number}};
type Cursor={v:1;f:string;k:string|null;i:string};
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const instantRe=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const fail=(code:'invalid'|'conflict'|'not_found'|'server',message:string):never=>{
 throw new LemmaError(code,message);
};
async function client(){return (await import('../live/client')).liveClient()}
function uuid():string{
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 if(!globalThis.crypto?.getRandomValues)return fail('server','Secure operationId unavailable');
 const b=globalThis.crypto.getRandomValues(new Uint8Array(16));
 b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function identifier(value:string):string{
 if(typeof value!=='string'||!uuidRe.test(value))return fail('invalid','Expected a UUID');
 return value;
}
function version(n:number):void{
 if(!Number.isSafeInteger(n)||n<1)return fail('invalid','Expected a positive version');
}
function keys(value:object,allowed:readonly string[]):void{
 for(const key of Object.keys(value))
  if(!allowed.includes(key))fail('invalid','Unknown practice field: '+key);
}
function civil(value:string):string{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value))return fail('invalid','Invalid civil date');
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)
  return fail('invalid','Invalid civil date');
 return value;
}
function instant(value:string):string{
 if(typeof value!=='string'||!instantRe.test(value)||!Number.isFinite(Date.parse(value))||
  !civil(value.slice(0,10)))return fail('invalid','Invalid timezone-aware practice instant');
 return value;
}
function cadence(value:PracticeCadence):PracticeCadence{
 if(!value||typeof value!=='object')return fail('invalid','Invalid cadence');
 const days=(n:number)=>Number.isSafeInteger(n)&&n>=1&&n<=3650;
 if(value.kind==='fixed_days'){
  keys(value,['kind','days']);
  if(!days(value.days))return fail('invalid','Invalid fixed cadence');
  return {kind:'fixed_days',days:value.days};
 }
 if(value.kind==='after_rating'){
  keys(value,['kind','daysByRating']);
  if(!Array.isArray(value.daysByRating)||value.daysByRating.length!==4||
   !value.daysByRating.every(days))return fail('invalid','Invalid rating cadence');
  return {kind:'after_rating',daysByRating:[...value.daysByRating] as [number,number,number,number]};
 }
 return fail('invalid','Unknown cadence');
}
function topicPatch(input:NewPracticeTopic|PracticeTopicPatch,creating:boolean):Row{
 if(!input||typeof input!=='object'||Array.isArray(input))
  return fail('invalid','Invalid topic patch');
 keys(input,['title','subjectId','conceptId','checkpointId','nextDueDate','cadence']);
 if(!creating&&!Object.keys(input).length)return fail('invalid','Empty topic patch');
 const out:Row={};
 if(input.title!==undefined){
  if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>200)
   return fail('invalid','Invalid topic title');
  out.title=input.title.trim();
 }else if(creating)return fail('invalid','Topic title required');
 for(const [key,col] of [
  ['subjectId','subject_id'],['conceptId','concept_id'],['checkpointId','checkpoint_id']
 ] as const)if(input[key]!==undefined)
  out[col]=input[key]===null?null:identifier(input[key] as string);
 if(input.nextDueDate!==undefined)out.next_due_date=input.nextDueDate===null?
  null:civil(input.nextDueDate);
 else if(creating)out.next_due_date=null;
 if(input.cadence!==undefined)out.cadence=cadence(input.cadence);
 else if(creating)out.cadence={kind:'fixed_days',days:7};
 return out;
}
function eventPatch(input:NewPracticeEvent):Row{
 if(!input||typeof input!=='object'||Array.isArray(input))
  return fail('invalid','Practice event required');
 keys(input,['rating','occurredAt','response','minutes']);
 if(![1,2,3,4].includes(input.rating))return fail('invalid','Rating must be 1..4');
 const out:Row={rating:input.rating};
 if(input.occurredAt!==undefined)out.occurred_at=instant(input.occurredAt);
 if(input.response!==undefined){
  if(input.response!==null&&(typeof input.response!=='string'||input.response.length>4000))
   return fail('invalid','Response too long');
  out.response=input.response;
 }
 if(input.minutes!==undefined){
  if(input.minutes!==null&&(!Number.isSafeInteger(input.minutes)||input.minutes<0||
   input.minutes>1440))return fail('invalid','Invalid practice minutes');
  out.minutes=input.minutes;
 }
 return out;
}
function mapError(error:SqlError):LemmaError{
 const msg=error.message||'Practice command failed';
 if(error.code==='23505'||/conflict|version|duplicate|already exists/i.test(msg))
  return new LemmaError('conflict',msg);
 if(/not found|no rows/i.test(msg))return new LemmaError('not_found',msg);
 if(['23503','23514','22P02'].includes(error.code||'')||
  /invalid|unknown|required|constraint|unsupported|must be/i.test(msg))
  return new LemmaError('invalid',msg);
 return new LemmaError('server',msg);
}
function unwrap<T>(r:{data:T|null;error:SqlError|null}):T{
 if(r.error)throw mapError(r.error);
 return r.data as T;
}
function mapTopic(r:Row):PracticeTopicRecord{
 return {id:String(r.id),title:String(r.title),
  subjectId:r.subject_id==null?null:String(r.subject_id),
  conceptId:r.concept_id==null?null:String(r.concept_id),
  checkpointId:r.checkpoint_id==null?null:String(r.checkpoint_id),
  nextDueDate:r.next_due_date==null?null:String(r.next_due_date),
  cadence:cadence(r.cadence as PracticeCadence),
  lastPracticedAt:r.last_practiced_at==null?null:String(r.last_practiced_at),
  archivedAt:r.archived_at==null?null:String(r.archived_at),
  version:Number(r.version),createdAt:String(r.created_at),updatedAt:String(r.updated_at)};
}
function mapEvent(r:Row):PracticeEventRecord{
 return {id:String(r.id),topicId:String(r.topic_id),occurredAt:String(r.occurred_at),
  rating:Number(r.rating) as PracticeRating,
  response:r.response==null?null:String(r.response),
  minutes:r.minutes==null?null:Number(r.minutes),
  voidedAt:r.voided_at==null?null:String(r.voided_at),
  version:Number(r.version),createdAt:String(r.created_at),updatedAt:String(r.updated_at)};
}
function limit(n:number|undefined):number{
 const result=n??20;
 if(!Number.isSafeInteger(result)||result<1||result>50)
  return fail('invalid','Practice page size must be 1..50');
 return result;
}
function makeCursor(f:string,k:string|null,i:string):string{
 return btoa(JSON.stringify({v:1,f,k,i})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function readCursor(token:string|null|undefined,f:string,event:boolean):Cursor|null{
 if(token==null)return null;
 try{
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{8,1024}$/.test(token))
   return fail('invalid','Invalid practice cursor');
  const b64=token.replace(/-/g,'+').replace(/_/g,'/');
  const obj:unknown=JSON.parse(atob(b64+'='.repeat((4-b64.length%4)%4)));
  if(!obj||typeof obj!=='object')return fail('invalid','Invalid practice cursor');
  const c=obj as Cursor;
  if(c.v!==1||c.f!==f||!uuidRe.test(c.i)||
    (event?(typeof c.k!=='string'||!instantRe.test(c.k)||!Number.isFinite(Date.parse(c.k))):
      (c.k!==null&&(typeof c.k!=='string'||!/^\d{4}-\d\d-\d\d$/.test(c.k)))))
   return fail('invalid','Mismatched practice cursor');
  return c;
 }catch{return fail('invalid','Invalid practice cursor')}
}
function afterTopic(c:Cursor):string{
 return c.k===null?'and(next_due_date.is.null,id.gt.'+c.i+')':
  'next_due_date.gt.'+c.k+',and(next_due_date.eq.'+c.k+',id.gt.'+c.i+'),next_due_date.is.null';
}
function afterEvent(c:Cursor):string{
 return 'occurred_at.gt.'+c.k+',and(occurred_at.eq.'+c.k+',id.gt.'+c.i+')';
}
export function createLivePracticeTopicApi():PracticeTopicApi{
 // Unknown outcomes keep exactly the same operationId AND unchanged patch.
 const retry=new Map<string,{operationId:string;envelope:Row}>();
 async function getTopic(id:string):Promise<PracticeTopicRecord|null>{
  const api=await client();
  const row=unwrap<Row|null>(await api.from('practice_topics').select('*')
   .eq('id',identifier(id)).maybeSingle());
  return row?mapTopic(row):null;
 }
 async function getEvent(id:string):Promise<PracticeEventRecord|null>{
  const api=await client();
  const row=unwrap<Row|null>(await api.from('practice_events').select('*')
   .eq('id',identifier(id)).maybeSingle());
  return row?mapEvent(row):null;
 }
 async function write<T>(operation:string,args:Row,resolve:(changed:Change[])=>Promise<T>):
  Promise<StudyReceipt<T>>{
  const base:Row={schemaVersion:1,resource:'practice_topics',operation,...args};
  const key=JSON.stringify(base);
  const held=retry.get(key);
  const envelope=held?.envelope??{operationId:uuid(),...base};
  let committed=false;
  try{
   const api=await client();
   const result=unwrap<CommandReceipt>(await api.rpc('practice_topics_command',{p:envelope}));
   if(result?.status==='conflict')
    return fail('conflict','Practice version conflict ('+
      (result.conflict?.currentVersion??'unknown')+')');
   if(result?.status!=='ok'||!Array.isArray(result.changed)||!result.changed.length||
     result.changed.some(row=>typeof row.id!=='string'||!uuidRe.test(row.id)||
       !Number.isSafeInteger(row.version)||row.version<1))
    return fail('server','Invalid practice command receipt');
   committed=true;
   const record=await resolve(result.changed);
   retry.delete(key);
   return {record,actionNo:Number.isSafeInteger(result.actionNo)?result.actionNo!:null};
  }catch(e){
   if(committed||!(e instanceof LemmaError)||e.code==='server'||e.code==='offline')
    retry.set(key,{operationId:String(envelope.operationId),envelope});
   else retry.delete(key);
   throw e;
  }
 }
 const changedId=(changed:Change[],preferred?:string)=>preferred??changed[0].id;
 async function changedPair(changed:Change[],eventId?:string,topicId?:string):
  Promise<PracticeChange>{
  // A single operation must return both changed IDs, not a guessed latest event.
  if(changed.length<2)return fail('server','Practice receipt lacks both changed rows');
  const pick=(table:string,id?:string):string=>{
   if(id)return id;
   const tagged=changed.find(x=>x.table===table||x.resource===table);
   if(tagged)return tagged.id;
   if(table==='practice_events')return changed[changed.length-1].id;
   return changed[0].id;
  };
  const tid=pick('practice_topics',topicId),eid=pick('practice_events',eventId);
  // Sequential reads avoid racing two lazy live-client imports, and retain
  // the exact owner-RLS context across both receipt projections.
  const topic=await getTopic(tid);
  const event=await getEvent(eid);
  if(!topic||!event||event.topicId!==topic.id)
   return fail('server','Practice command changed rows are not readable under owner RLS');
  return {topic,event};
 }
 return {
  mode:'live',
  async listTopics(query:PracticeTopicQuery={}):Promise<PracticePage<PracticeTopicRecord>>{
   keys(query,['archived','subjectId','limit','cursor']);
   const archived=query.archived??'active';
   if(!['active','archived','all'].includes(archived))
    return fail('invalid','Invalid archived filter');
   const subject=query.subjectId===undefined?'*':
    query.subjectId===null?null:identifier(query.subjectId);
   const f=JSON.stringify(['topics',archived,subject]);
   const cursor=readCursor(query.cursor,f,false),size=limit(query.limit);
   const api=await client();
   // Keep the concrete PostgREST builder types instead of retyping generic
   // filter methods: predicates must be identical for count and page.
   let countQ=api.from('practice_topics').select('id',{head:true,count:'exact'});
   if(archived==='active')countQ=countQ.is('archived_at',null);
   if(archived==='archived')countQ=countQ.not('archived_at','is',null);
   if(subject===null)countQ=countQ.is('subject_id',null);
   else if(subject!=='*')countQ=countQ.eq('subject_id',subject);
   const counted=await countQ;
   if(counted.error)throw mapError(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count===null||counted.count<0)
    return fail('server','Practice topic total unavailable');
   let q=api.from('practice_topics').select('*');
   if(archived==='active')q=q.is('archived_at',null);
   if(archived==='archived')q=q.not('archived_at','is',null);
   if(subject===null)q=q.is('subject_id',null);
   else if(subject!=='*')q=q.eq('subject_id',subject);
   if(cursor)q=q.or(afterTopic(cursor));
   const rows=unwrap<Row[]>(await q.order('next_due_date',{ascending:true,nullsFirst:false})
    .order('id',{ascending:true}).limit(size+1));
   const items=rows.slice(0,size).map(mapTopic);
   return {items,total:counted.count,
    nextCursor:rows.length>size&&items.length?
     makeCursor(f,items[items.length-1].nextDueDate,items[items.length-1].id):null};
  },
  getTopic,
  async createTopic(input:NewPracticeTopic){
   const patch=topicPatch(input,true);
   return write('create',{patch},async changed=>
    (await getTopic(changedId(changed)))??fail('server','Created topic invisible'));
  },
  async updateTopic(id:string,expectedVersion:number,patch:PracticeTopicPatch){
   identifier(id);version(expectedVersion);
   return write('update',{target:{id},expectedVersion,patch:topicPatch(patch,false)},
    async changed=>(await getTopic(changedId(changed,id)))??fail('server','Updated topic invisible'));
  },
  async archiveTopic(id:string,expectedVersion:number){
   identifier(id);version(expectedVersion);
   return write('archive',{target:{id},expectedVersion,patch:{}},
    async()=> (await getTopic(id))??fail('server','Archived topic invisible'));
  },
  async restoreTopic(id:string,expectedVersion:number){
   identifier(id);version(expectedVersion);
   return write('restore',{target:{id},expectedVersion,patch:{}},
    async()=> (await getTopic(id))??fail('server','Restored topic invisible'));
  },
  async deleteTopic(id:string,expectedVersion:number){
   identifier(id);version(expectedVersion);
   return write('delete',{target:{id},expectedVersion,patch:{}},async()=>({id}));
  },
  async listEvents(query:PracticeEventQuery={}):Promise<PracticePage<PracticeEventRecord>>{
   keys(query,['topicId','includeVoided','limit','cursor']);
   if(query.includeVoided!==undefined&&typeof query.includeVoided!=='boolean')
    return fail('invalid','Invalid voided filter');
   const topic=query.topicId===undefined?'*':identifier(query.topicId);
   const f=JSON.stringify(['events',topic,query.includeVoided===true]);
   const cursor=readCursor(query.cursor,f,true),size=limit(query.limit);
   const api=await client();
   let countQ=api.from('practice_events').select('id',{head:true,count:'exact'});
   if(query.includeVoided!==true)countQ=countQ.is('voided_at',null);
   if(topic!=='*')countQ=countQ.eq('topic_id',topic);
   const counted=await countQ;
   if(counted.error)throw mapError(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count===null||counted.count<0)
    return fail('server','Practice event total unavailable');
   let q=api.from('practice_events').select('*');
   if(query.includeVoided!==true)q=q.is('voided_at',null);
   if(topic!=='*')q=q.eq('topic_id',topic);
   if(cursor)q=q.or(afterEvent(cursor));
   const rows=unwrap<Row[]>(await q.order('occurred_at',{ascending:true})
    .order('id',{ascending:true}).limit(size+1));
   const items=rows.slice(0,size).map(mapEvent);
   return {items,total:counted.count,
    nextCursor:rows.length>size&&items.length?
     makeCursor(f,items[items.length-1].occurredAt,items[items.length-1].id):null};
  },
  async recordPractice(topicId:string,expectedVersion:number,input:NewPracticeEvent){
   identifier(topicId);version(expectedVersion);
   const patch=eventPatch(input);
   return write('record',{target:{id:topicId},expectedVersion,patch},
    async changed=>changedPair(changed,undefined,topicId));
  },
  async voidPracticeEvent(eventId:string,expectedVersion:number){
   identifier(eventId);version(expectedVersion);
   return write('void_event',{target:{id:eventId},expectedVersion,patch:{}},
    async changed=>changedPair(changed,eventId));
  },
 };
}
