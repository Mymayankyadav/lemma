// N57.1: isolated tab-scoped demo of N43 practice topics and events.
import {LemmaError} from '../api';
import type {PracticeCadence,PracticeChange,PracticeEventQuery,PracticeEventRecord,
 PracticePage,PracticeRating,PracticeTopicApi,PracticeTopicPatch,PracticeTopicQuery,
 PracticeTopicRecord,NewPracticeTopic,NewPracticeEvent} from './contract';

const KEY='lemma.v6.demo.practice-topics.v1';
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new LemmaError(code,message);
};
type History={eventId:string;previousDueDate:string|null;previousLastPracticedAt:string|null};
type Snapshot={schema:1;topics:PracticeTopicRecord[];events:PracticeEventRecord[];history:History[]};
type Cursor={v:1;filter:string;key:[string,string]};
let serial=0;
const receipt=<T>(record:T)=>({record:clone(record),actionNo:null});
function uid():string{
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 return 'demo-practice-'+Date.now()+'-'+(++serial);
}
function nowAfter(previous?:string):string{
 return new Date(Math.max(Date.now(),previous?Date.parse(previous)+1:0)).toISOString();
}
function keys(data:object,allowed:readonly string[]):void{
 for(const key of Object.keys(data)){
  if(!allowed.includes(key))fail('invalid','Unknown practice field: '+key);
 }
}
function identifier(value:string):string{
 if(typeof value!=='string'||!value.trim()||value.length>160)
  return fail('invalid','Invalid practice identifier');
 return value;
}
function links(data:{subjectId?:string|null;conceptId?:string|null;checkpointId?:string|null}){
 const out={subjectId:data.subjectId??null,conceptId:data.conceptId??null,
  checkpointId:data.checkpointId??null};
 for(const value of Object.values(out))if(value!==null)identifier(value);
 return out;
}
function civil(value:string):string{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value))
  return fail('invalid','Expected a YYYY-MM-DD civil date');
 const d=new Date(value+'T00:00:00.000Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)
  return fail('invalid','Invalid practice civil date');
 return value;
}
function instant(value:string):string{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)||
  !Number.isFinite(Date.parse(value)))
  return fail('invalid','Invalid ISO occurrence instant');
 return new Date(value).toISOString();
}
function cadence(value:PracticeCadence):PracticeCadence{
 if(!value||typeof value!=='object')return fail('invalid','Invalid practice cadence');
 const within=(n:number)=>Number.isSafeInteger(n)&&n>=1&&n<=3650;
 if(value.kind==='fixed_days'){
  keys(value,['kind','days']);
  if(!within(value.days))return fail('invalid','Cadence days must be 1–3650');
  return {kind:'fixed_days',days:value.days};
 }
 if(value.kind==='after_rating'){
  keys(value,['kind','daysByRating']);
  if(!Array.isArray(value.daysByRating)||value.daysByRating.length!==4||
    !value.daysByRating.every(within))
   return fail('invalid','Cadence must contain four positive rating-day values');
  return {kind:'after_rating',daysByRating:[
   value.daysByRating[0],value.daysByRating[1],
   value.daysByRating[2],value.daysByRating[3]
  ]};
 }
 return fail('invalid','Unknown practice cadence');
}
function newTopic(input:NewPracticeTopic):Omit<PracticeTopicRecord,
 'id'|'version'|'lastPracticedAt'|'archivedAt'|'createdAt'|'updatedAt'>{
 if(!input||typeof input!=='object')return fail('invalid','Topic is required');
 keys(input,['title','subjectId','conceptId','checkpointId','nextDueDate','cadence']);
 if(typeof input.title!=='string'||input.title.trim().length<1||input.title.trim().length>200)
  return fail('invalid','Topic title must be 1–200 characters');
 return {title:input.title.trim(),...links(input),
  nextDueDate:input.nextDueDate==null?null:civil(input.nextDueDate),
  cadence:cadence(input.cadence??{kind:'fixed_days',days:7})};
}
function eventInput(input:NewPracticeEvent):Pick<PracticeEventRecord,
 'occurredAt'|'rating'|'response'|'minutes'>{
 if(!input||typeof input!=='object')return fail('invalid','Practice event is required');
 keys(input,['rating','occurredAt','response','minutes']);
 if(!([1,2,3,4] as number[]).includes(input.rating))
  return fail('invalid','Practice rating must be 1–4');
 if(input.response!==undefined&&input.response!==null&&
  (typeof input.response!=='string'||input.response.length>4000))
  return fail('invalid','Response must have at most 4000 characters');
 if(input.minutes!==undefined&&input.minutes!==null&&
  (!Number.isSafeInteger(input.minutes)||input.minutes<0||input.minutes>1440))
  return fail('invalid','Minutes must be 0–1440 whole minutes');
 return {occurredAt:input.occurredAt===undefined?new Date().toISOString():instant(input.occurredAt),
  rating:input.rating as PracticeRating,response:input.response??null,minutes:input.minutes??null};
}
function changedDate(instantString:string,days:number):string{
 const d=new Date(instantString.slice(0,10)+'T00:00:00.000Z');
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
function fixture():Snapshot{
 const at='2026-11-06T08:00:00.000Z';
 const create=(id:string,title:string,subjectId:string|null,
  cadenceValue:PracticeCadence,due:string|null,archivedAt:string|null=null):PracticeTopicRecord=>({
  id,title,subjectId,conceptId:null,checkpointId:null,cadence:cadenceValue,
  nextDueDate:due,lastPracticedAt:null,archivedAt,
  version:1,createdAt:at,updatedAt:at,
 });
 return {schema:1,topics:[
  create('demo-practice-1','Proof techniques','subject-analysis',
   {kind:'fixed_days',days:7},'2026-11-10'),
  create('demo-practice-2','Topology concepts','subject-topology',
   {kind:'after_rating',daysByRating:[1,3,7,14]},'2026-11-12'),
  create('demo-practice-3','Archived examples',null,
   {kind:'fixed_days',days:14},null,'2026-11-06T09:00:00.000Z'),
 ],events:[],history:[]};
}
function validTopic(t:PracticeTopicRecord):boolean{
 try{
  if(!t||typeof t!=='object'||typeof t.id!=='string'||!t.id||
    !Number.isSafeInteger(t.version)||t.version<1||
    typeof t.createdAt!=='string'||!Number.isFinite(Date.parse(t.createdAt))||
    typeof t.updatedAt!=='string'||!Number.isFinite(Date.parse(t.updatedAt))||
    (t.lastPracticedAt!==null&&instant(t.lastPracticedAt)!==t.lastPracticedAt)||
    (t.archivedAt!==null&&instant(t.archivedAt)!==t.archivedAt))return false;
  newTopic({title:t.title,subjectId:t.subjectId,conceptId:t.conceptId,
   checkpointId:t.checkpointId,nextDueDate:t.nextDueDate,cadence:t.cadence});
  return true;
 }catch{return false}
}
function validEvent(e:PracticeEventRecord):boolean{
 try{
  if(!e||typeof e!=='object'||!e.id||!e.topicId||
    !Number.isSafeInteger(e.version)||e.version<1||
    typeof e.createdAt!=='string'||!Number.isFinite(Date.parse(e.createdAt))||
    typeof e.updatedAt!=='string'||!Number.isFinite(Date.parse(e.updatedAt))||
    (e.voidedAt!==null&&instant(e.voidedAt)!==e.voidedAt))return false;
  eventInput({occurredAt:e.occurredAt,rating:e.rating,response:e.response,minutes:e.minutes});
  return instant(e.occurredAt)===e.occurredAt;
 }catch{return false}
}
function load():Snapshot|null{
 try{
  const raw=sessionStorage.getItem(KEY);if(!raw)return null;
  const v=JSON.parse(raw) as Snapshot;
  if(v?.schema!==1||!Array.isArray(v.topics)||!Array.isArray(v.events)||
   !Array.isArray(v.history)||!v.topics.every(validTopic)||!v.events.every(validEvent)||
   new Set(v.topics.map(t=>t.id)).size!==v.topics.length||
   new Set(v.events.map(e=>e.id)).size!==v.events.length||
   v.events.some(e=>!v.topics.some(t=>t.id===e.topicId))||
   v.history.length!==v.events.length||
   v.history.some(h=>!v.events.some(e=>e.id===h.eventId)||
    (h.previousDueDate!==null&&civil(h.previousDueDate)!==h.previousDueDate)||
    (h.previousLastPracticedAt!==null&&instant(h.previousLastPracticedAt)!==h.previousLastPracticedAt)))
   return null;
  return v;
 }catch{return null}
}
function store(v:Snapshot):void{
 try{sessionStorage.setItem(KEY,JSON.stringify(v))}catch{/* memory-only fallback */}
}
function encode(c:Cursor):string{
 return btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(raw:string|null|undefined,filter:string):Cursor|null{
 if(raw==null)return null;
 try{
  if(typeof raw!=='string'||raw.length<4||raw.length>1200||
   !/^[A-Za-z0-9_-]+$/.test(raw))return fail('invalid','Invalid practice cursor');
  const parsed=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4))) as Cursor;
  if(parsed.v!==1||parsed.filter!==filter||!Array.isArray(parsed.key)||
   parsed.key.length!==2||parsed.key.some(k=>typeof k!=='string'))
   return fail('invalid','Practice cursor does not match filter');
  return parsed;
 }catch{return fail('invalid','Invalid practice cursor')}
}
function limit(value:number|undefined):number{
 const v=value??20;
 if(!Number.isSafeInteger(v)||v<1||v>50)return fail('invalid','Page limit must be 1–50');
 return v;
}
function page<T>(rows:T[],size:number,filter:string,raw:string|null|undefined,
 key:(item:T)=>[string,string]):PracticePage<T>{
 const cursor=decode(raw,filter);
 const after=cursor?rows.filter(t=>{
  const k=key(t);return k[0]>cursor.key[0]||
   k[0]===cursor.key[0]&&k[1]>cursor.key[1];
 }):rows;
 const items=after.slice(0,size);
 return {items:clone(items),total:rows.length,
  nextCursor:after.length>size&&items.length?
   encode({v:1,filter,key:key(items[items.length-1])}):null};
}
function version(record:{version:number},expected:number):void{
 if(!Number.isSafeInteger(expected)||expected<1||record.version!==expected)
  fail('conflict','Practice record changed; current version '+record.version);
}
export function createDemoPracticeTopicApi():PracticeTopicApi{
 let snapshot=load()??fixture();store(snapshot);
 const current=()=>{snapshot=load()??snapshot;return snapshot};
 const save=(value:Snapshot)=>{snapshot=value;store(value)};
 const topic=(id:string)=>current().topics.find(t=>t.id===identifier(id))||
  fail('not_found','Practice topic not found');
 const owned=(id:string,expected:number)=>{const t=topic(id);version(t,expected);return t};
 const modify=(old:PracticeTopicRecord,patch:Partial<PracticeTopicRecord>)=>{
  const next:PracticeTopicRecord={...old,...patch,version:old.version+1,
   updatedAt:nowAfter(old.updatedAt)};
  const data=current();
  save({...data,topics:data.topics.map(t=>t.id===old.id?next:t)});
  return receipt(next);
 };
 return {
  mode:'demo',
  async listTopics(query:PracticeTopicQuery={}){
   keys(query,['archived','subjectId','limit','cursor']);
   const archived=query.archived??'active';
   if(!['active','archived','all'].includes(archived))
    return fail('invalid','Invalid practice archive filter');
   const subject=query.subjectId===undefined?'*':
    query.subjectId===null?null:identifier(query.subjectId);
   const filter=JSON.stringify([archived,subject]);
   const match=current().topics.filter(t=>
    (archived==='all'||(archived==='active'?t.archivedAt===null:t.archivedAt!==null))&&
    (subject==='*'||t.subjectId===subject));
   const key=(t:PracticeTopicRecord):[string,string]=>[t.nextDueDate??'9999-12-31',t.id];
   match.sort((a,b)=>key(a)[0].localeCompare(key(b)[0])||a.id.localeCompare(b.id));
   return page(match,limit(query.limit),filter,query.cursor,key);
  },
  async getTopic(id){identifier(id);return clone(current().topics.find(t=>t.id===id)??null)},
  async createTopic(input){
   const values=newTopic(input),at=nowAfter();
   const rec:PracticeTopicRecord={id:uid(),...values,lastPracticedAt:null,
    archivedAt:null,version:1,createdAt:at,updatedAt:at};
   const data=current();save({...data,topics:[...data.topics,rec]});
   return receipt(rec);
  },
  async updateTopic(id,expectedVersion,patch:PracticeTopicPatch){
   const old=owned(id,expectedVersion);
   if(!patch||typeof patch!=='object')return fail('invalid','Topic patch required');
   keys(patch,['title','subjectId','conceptId','checkpointId','nextDueDate','cadence']);
   if(!Object.keys(patch).length)return fail('invalid','Topic patch must not be empty');
   const changes=newTopic({title:patch.title??old.title,
    subjectId:patch.subjectId===undefined?old.subjectId:patch.subjectId,
    conceptId:patch.conceptId===undefined?old.conceptId:patch.conceptId,
    checkpointId:patch.checkpointId===undefined?old.checkpointId:patch.checkpointId,
    nextDueDate:patch.nextDueDate===undefined?old.nextDueDate:patch.nextDueDate,
    cadence:patch.cadence??old.cadence});
   return modify(old,changes);
  },
  async archiveTopic(id,expectedVersion){
   const old=owned(id,expectedVersion);
   if(old.archivedAt!==null)return fail('invalid','Topic already archived');
   return modify(old,{archivedAt:nowAfter(old.updatedAt)});
  },
  async restoreTopic(id,expectedVersion){
   const old=owned(id,expectedVersion);
   if(old.archivedAt===null)return fail('invalid','Topic is already active');
   return modify(old,{archivedAt:null});
  },
  async deleteTopic(id,expectedVersion){
   const old=owned(id,expectedVersion),data=current();
   if(data.events.some(e=>e.topicId===old.id))
    return fail('conflict','Practice topic has events; archive it to preserve history');
   save({...data,topics:data.topics.filter(t=>t.id!==old.id)});
   return receipt({id:old.id});
  },
  async listEvents(query:PracticeEventQuery={}){
   keys(query,['topicId','includeVoided','limit','cursor']);
   if(query.includeVoided!==undefined&&typeof query.includeVoided!=='boolean')
    return fail('invalid','Invalid voided filter');
   if(query.topicId!==undefined)identifier(query.topicId);
   const filter=JSON.stringify([query.topicId??'*',query.includeVoided===true]);
   const events=current().events.filter(e=>
    (query.topicId===undefined||e.topicId===query.topicId)&&
    (query.includeVoided===true||e.voidedAt===null));
   // Sort ascending by instant then ID for unambiguous keyset traversal.
   const key=(e:PracticeEventRecord):[string,string]=>[e.occurredAt,e.id];
   events.sort((a,b)=>key(a)[0].localeCompare(key(b)[0])||a.id.localeCompare(b.id));
   return page(events,limit(query.limit),filter,query.cursor,key);
  },
  async recordPractice(topicId,expectedVersion,input:NewPracticeEvent){
   const old=owned(topicId,expectedVersion);
   if(old.archivedAt!==null)return fail('invalid','Archived topic cannot be practiced');
   const patch=eventInput(input),at=nowAfter(),days=old.cadence.kind==='fixed_days'?
    old.cadence.days:old.cadence.daysByRating[patch.rating-1];
   const event:PracticeEventRecord={id:uid(),topicId:old.id,...patch,voidedAt:null,
    version:1,createdAt:at,updatedAt:at};
   const updated:PracticeTopicRecord={...old,lastPracticedAt:patch.occurredAt,
    nextDueDate:changedDate(patch.occurredAt,days),version:old.version+1,
    updatedAt:nowAfter(old.updatedAt)};
   const data=current();
   save({...data,topics:data.topics.map(t=>t.id===old.id?updated:t),
    events:[...data.events,event],history:[...data.history,{
      eventId:event.id,previousDueDate:old.nextDueDate,
      previousLastPracticedAt:old.lastPracticedAt}]});
   return receipt<PracticeChange>({topic:updated,event});
  },
  async voidPracticeEvent(eventId,expectedVersion){
   identifier(eventId);const data=current(),old=data.events.find(e=>e.id===eventId);
   if(!old)return fail('not_found','Practice event not found');
   version(old,expectedVersion);
   if(old.voidedAt!==null)return fail('invalid','Practice event already voided');
   // Reversing an older event would corrupt a later event's due-date change.
   const unvoided=data.events.filter(e=>e.topicId===old.topicId&&e.voidedAt===null);
   if(unvoided[unvoided.length-1]?.id!==eventId)
    return fail('conflict','Void newer practice events before this event');
   const previous=data.history.find(h=>h.eventId===eventId);
   if(!previous)return fail('conflict','Missing inverse due-date snapshot');
   const base=topic(old.topicId),at=nowAfter(old.updatedAt);
   const event:PracticeEventRecord={...old,voidedAt:at,version:old.version+1,updatedAt:at};
   const updated:PracticeTopicRecord={...base,
    nextDueDate:previous.previousDueDate,lastPracticedAt:previous.previousLastPracticedAt,
    version:base.version+1,updatedAt:nowAfter(base.updatedAt)};
   save({...data,events:data.events.map(e=>e.id===eventId?event:e),
    topics:data.topics.map(t=>t.id===base.id?updated:t)});
   return receipt<PracticeChange>({topic:updated,event});
  },
 };
}
