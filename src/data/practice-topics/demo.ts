import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {
  NewPracticeTopic,PracticeCadence,PracticeEvent,PracticeLinks,PracticePage,
  PracticeQuery,PracticeTopic,PracticeTopicApi,PracticeTopicPatch,RecordPractice
} from './contract';

const KEY='lemma.v6.demo.practice-topics.v1';
type StoredEvent=PracticeEvent&{previousDueDate:string|null};
type Snapshot={schema:1;topics:PracticeTopic[];events:StoredEvent[]};
const clone=<T>(value:T):T=>structuredClone(value);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{throw new LemmaError(code,message)};
let counter=0;
const newId=()=>globalThis.crypto?.randomUUID?.()??'demo-practice-'+Date.now()+'-'+(++counter);
const isoNow=(clock:()=>Date)=>clock().toISOString();
function validDate(value:string):boolean{
  if(typeof value!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&date.getUTCDate()===d;
}
const checkDate=(value:string|null):string|null=>{
  if(value!==null&&!validDate(value))fail('invalid','Invalid owner civil date');
  return value;
};
const dayPlus=(day:string,n:number)=>{
  const [year,month,date]=day.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,date+n)).toISOString().slice(0,10);
};
const minutes=(v:number|null):number|null=>{
  if(v!==null&&(!Number.isSafeInteger(v)||v<0||v>1440))fail('invalid','Practice minutes must be 0–1440');
  return v;
};
function cadence(value:PracticeCadence):PracticeCadence{
  if(!value||typeof value!=='object')fail('invalid','Practice cadence required');
  const days=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=365;
  if(value.kind==='fixed_days'&&Object.keys(value).every(k=>['kind','days'].includes(k))&&days(value.days))
    return {kind:'fixed_days',days:value.days};
  if(value.kind==='after_rating'&&Object.keys(value).every(k=>['kind','daysByRating'].includes(k))&&
    value.daysByRating&&typeof value.daysByRating==='object'&&
    Object.keys(value.daysByRating).sort().join(',')==='1,2,3,4'&&
    Object.values(value.daysByRating).every(days))
    return {kind:'after_rating',daysByRating:{...value.daysByRating}};
  return fail('invalid','Invalid practice cadence');
}
const text=(v:string,max=140)=>{
  if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('invalid','Invalid practice title');
  return v.trim();
};
function links(v:PracticeLinks):Required<PracticeLinks>{
  const result={subjectId:v.subjectId??null,conceptId:v.conceptId??null,checkpointId:v.checkpointId??null};
  for(const val of Object.values(result))
    if(val!==null&&(typeof val!=='string'||!val.trim()))fail('invalid','Invalid practice link');
  return result;
}
const receipt=<T>(record:T):StudyReceipt<T>=>({record:clone(record),actionNo:null});
const defaults=():Snapshot=>{
  const now='2026-11-06T08:00:00.000Z';
  return {schema:1,topics:[
    {id:'demo-practice-1',title:'Explain compactness',subjectId:'subject-analysis',
      conceptId:null,checkpointId:null,nextDueDate:'2026-11-08',cadence:{kind:'fixed_days',days:7},
      lastPracticedAt:null,archivedAt:null,version:1,createdAt:now,updatedAt:now,source:'app'},
    {id:'demo-practice-2',title:'Work a proof without notes',subjectId:null,
      conceptId:null,checkpointId:null,nextDueDate:'2026-11-09',
      cadence:{kind:'after_rating',daysByRating:{'1':1,'2':3,'3':7,'4':14}},
      lastPracticedAt:null,archivedAt:null,version:1,createdAt:now,updatedAt:now,source:'app'}
  ],events:[]};
};
function secureStorage(explicit?:Storage|null):Storage|null{
  if(explicit!==undefined)return explicit;
  try{return typeof sessionStorage==='undefined'?null:sessionStorage}catch{return null}
}
/** Demo API persists in the current tab; no SQL, browser user IDs, or FSRS writes. */
export function createDemoPracticeTopicApi(options:{storage?:Storage|null;now?:()=>Date}={}):PracticeTopicApi{
  const storage=secureStorage(options.storage),clock=options.now??(()=>new Date());
  let fallback:Snapshot=defaults();
  const read=():Snapshot=>{
    try{
      const raw=storage?.getItem(KEY);
      if(raw){
        const parsed=JSON.parse(raw) as Snapshot;
        if(parsed?.schema===1&&Array.isArray(parsed.topics)&&Array.isArray(parsed.events))return parsed;
      }
    }catch{/* unavailable/malformed storage: use isolated demo fixture */}
    return clone(fallback);
  };
  const write=(data:Snapshot)=>{
    fallback=clone(data);
    try{storage?.setItem(KEY,JSON.stringify(data));}catch{/* fallback remains usable */}
  };
  const find=(data:Snapshot,id:string)=>{
    const topic=data.topics.find(t=>t.id===id);
    if(!topic)fail('not_found','Practice topic not found');
    return topic;
  };
  const expectVersion=(actual:number,version:number)=>{
    if(!Number.isSafeInteger(version)||version!==actual)fail('conflict','Practice topic version changed');
  };
  const touch=(topic:PracticeTopic)=>{
    topic.version++;
    topic.updatedAt=isoNow(clock);
  };
  const mutate=<T>(fn:(data:Snapshot)=>T):StudyReceipt<T>=>{
    const data=read(),result=fn(data);
    write(data);
    return receipt(result);
  };
  const afterRating=(topic:PracticeTopic,rating:1|2|3|4)=>{
    const c=topic.cadence;
    return c.kind==='fixed_days'?c.days:c.daysByRating[String(rating) as '1'|'2'|'3'|'4'];
  };
  return {
    mode:'demo',
    async listTopics(query:PracticeQuery={}):Promise<PracticePage>{
      const includeArchived=query.includeArchived??false;
      if(typeof includeArchived!=='boolean')fail('invalid','Invalid archived filter');
      const limit=query.limit??20;
      if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('invalid','Page size must be 1–50');
      let offset=0;
      if(query.cursor){
        try{
          const decoded=JSON.parse(atob(query.cursor)) as {v:number;o:number;a:boolean};
          if(decoded.v!==1||decoded.a!==includeArchived||
             !Number.isSafeInteger(decoded.o)||decoded.o<0)throw Error();
          offset=decoded.o;
        }catch{fail('invalid','Invalid practice cursor')}
      }
      const sorted=read().topics.filter(t=>includeArchived||!t.archivedAt)
        .sort((a,b)=>(a.nextDueDate??'9999').localeCompare(b.nextDueDate??'9999')||
          a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
      const end=offset+limit;
      return {items:clone(sorted.slice(offset,end)),total:sorted.length,
        nextCursor:end<sorted.length?btoa(JSON.stringify({v:1,o:end,a:includeArchived})):null};
    },
    async getTopic(id){return clone(read().topics.find(t=>t.id===id)??null);},
    async listEvents(topicId){return clone(read().events.filter(e=>e.topicId===topicId)
      .sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt))
      .map(({previousDueDate:_,...e})=>e));},
    async createTopic(input:NewPracticeTopic){
      if(Object.keys(input).some(k=>!['title','nextDueDate','cadence','subjectId','conceptId','checkpointId'].includes(k)))
        fail('invalid','Unknown practice topic field');
      const newTopic:PracticeTopic={
        id:newId(),title:text(input.title),...links(input),nextDueDate:checkDate(input.nextDueDate??null),
        cadence:cadence(input.cadence),lastPracticedAt:null,archivedAt:null,version:1,
        createdAt:isoNow(clock),updatedAt:isoNow(clock),source:'app'
      };
      return mutate(data=>{data.topics.push(newTopic);return newTopic});
    },
    async updateTopic(id,expectedVersion,patch:PracticeTopicPatch){
      if(Object.keys(patch).some(k=>!['title','nextDueDate','cadence','subjectId','conceptId','checkpointId'].includes(k)))
        fail('invalid','Unknown practice topic patch');
      return mutate(data=>{
        const topic=find(data,id);
        expectVersion(topic.version,expectedVersion);
        if(patch.title!==undefined)topic.title=text(patch.title);
        if(patch.nextDueDate!==undefined)topic.nextDueDate=checkDate(patch.nextDueDate);
        if(patch.cadence!==undefined)topic.cadence=cadence(patch.cadence);
        for(const key of ['subjectId','conceptId','checkpointId'] as const)
          if(patch[key]!==undefined)topic[key]=links({[key]:patch[key]})[key];
        touch(topic);
        return topic;
      });
    },
    async archiveTopic(id,expectedVersion){
      return mutate(data=>{
        const t=find(data,id);expectVersion(t.version,expectedVersion);
        if(t.archivedAt)fail('conflict','Practice topic already archived');
        t.archivedAt=isoNow(clock);touch(t);return t;
      });
    },
    async restoreTopic(id,expectedVersion){
      return mutate(data=>{
        const t=find(data,id);expectVersion(t.version,expectedVersion);
        if(!t.archivedAt)fail('conflict','Practice topic is not archived');
        t.archivedAt=null;touch(t);return t;
      });
    },
    async deleteTopic(id,expectedVersion){
      return mutate(data=>{
        const t=find(data,id);expectVersion(t.version,expectedVersion);
        data.topics=data.topics.filter(row=>row.id!==id);
        data.events=data.events.filter(event=>event.topicId!==id);
        return {id};
      });
    },
    async recordPractice(input:RecordPractice){
      if(Object.keys(input).some(k=>![
        'topicId','expectedVersion','occurredAt','practiceDay','rating','response','minutes'
      ].includes(k)))fail('invalid','Unknown practice event field');
      if(!validDate(input.practiceDay))fail('invalid','Invalid practice day');
      if(typeof input.occurredAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/i.test(input.occurredAt)||
        !Number.isFinite(Date.parse(input.occurredAt)))fail('invalid','Invalid practice instant');
      if(![1,2,3,4].includes(input.rating))fail('invalid','Practice rating must be 1–4');
      const response=input.response??null;
      if(response!==null&&(typeof response!=='string'||response.length>5000))
        fail('invalid','Invalid practice response');
      const duration=minutes(input.minutes??null);
      return mutate(data=>{
        const topic=find(data,input.topicId);
        expectVersion(topic.version,input.expectedVersion);
        if(topic.archivedAt)fail('conflict','Cannot practice an archived topic');
        const event:StoredEvent={
          id:newId(),topicId:topic.id,occurredAt:new Date(input.occurredAt).toISOString(),
          rating:input.rating,response,minutes:duration,voidedAt:null,
          version:1,createdAt:isoNow(clock),previousDueDate:topic.nextDueDate
        };
        data.events.push(event);
        topic.nextDueDate=dayPlus(input.practiceDay,afterRating(topic,input.rating));
        topic.lastPracticedAt=event.occurredAt;touch(topic);
        const {previousDueDate:_,...publicEvent}=event;
        return {topic,event:publicEvent};
      });
    },
    async voidPracticeEvent(eventId,expectedVersion){
      return mutate(data=>{
        const event=data.events.find(e=>e.id===eventId);
        if(!event)fail('not_found','Practice event not found');
        if(event.version!==expectedVersion)fail('conflict','Practice event version changed');
        if(event.voidedAt)fail('conflict','Practice event already voided');
        const topic=find(data,event.topicId);
        const remaining=data.events.filter(e=>e.topicId===topic.id&&!e.voidedAt);
        if(remaining.at(-1)?.id!==event.id)
          fail('conflict','Void the latest practice event first to preserve due dates');
        event.voidedAt=isoNow(clock);event.version++;
        topic.nextDueDate=event.previousDueDate;
        const previous=remaining.slice(0,-1).at(-1);
        topic.lastPracticedAt=previous?.occurredAt??null;touch(topic);
        const {previousDueDate:_,...publicEvent}=event;
        return {topic,event:publicEvent};
      });
    }
  };
}
