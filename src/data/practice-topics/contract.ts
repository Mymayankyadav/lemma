// N57.1: typed practice topics/events contract for demo and future owner-RLS live.
import type {StudyReceipt} from '../study/contract';

export type PracticeRating=1|2|3|4;
export type PracticeCadence=
 | {kind:'fixed_days';days:number}
 | {kind:'after_rating';daysByRating:[number,number,number,number]};
export interface PracticeTopicLinks {
 subjectId?:string|null;
 conceptId?:string|null;
 checkpointId?:string|null;
}
export interface PracticeTopicRecord {
 id:string;title:string;subjectId:string|null;conceptId:string|null;
 checkpointId:string|null;nextDueDate:string|null;cadence:PracticeCadence;
 lastPracticedAt:string|null;archivedAt:string|null;version:number;
 createdAt:string;updatedAt:string;
}
export interface NewPracticeTopic extends PracticeTopicLinks {
 title:string;cadence?:PracticeCadence;nextDueDate?:string|null;
}
export interface PracticeTopicPatch extends PracticeTopicLinks {
 title?:string;cadence?:PracticeCadence;nextDueDate?:string|null;
}
export interface PracticeEventRecord {
 id:string;topicId:string;occurredAt:string;rating:PracticeRating;
 response:string|null;minutes:number|null;voidedAt:string|null;
 version:number;createdAt:string;updatedAt:string;
}
export interface NewPracticeEvent {
 occurredAt?:string;rating:PracticeRating;response?:string|null;minutes?:number|null;
}
export interface PracticeTopicQuery {
 archived?:'active'|'archived'|'all';subjectId?:string|null;
 limit?:number;cursor?:string|null;
}
export interface PracticeEventQuery {
 topicId?:string;includeVoided?:boolean;limit?:number;cursor?:string|null;
}
export interface PracticePage<T> {items:T[];total:number;nextCursor:string|null}
export interface PracticeChange {topic:PracticeTopicRecord;event:PracticeEventRecord}
export interface PracticeTopicApi {
 readonly mode:'demo'|'live';
 listTopics(q?:PracticeTopicQuery):Promise<PracticePage<PracticeTopicRecord>>;
 getTopic(id:string):Promise<PracticeTopicRecord|null>;
 createTopic(input:NewPracticeTopic):Promise<StudyReceipt<PracticeTopicRecord>>;
 updateTopic(id:string,expectedVersion:number,patch:PracticeTopicPatch):Promise<StudyReceipt<PracticeTopicRecord>>;
 archiveTopic(id:string,expectedVersion:number):Promise<StudyReceipt<PracticeTopicRecord>>;
 restoreTopic(id:string,expectedVersion:number):Promise<StudyReceipt<PracticeTopicRecord>>;
 deleteTopic(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
 listEvents(q?:PracticeEventQuery):Promise<PracticePage<PracticeEventRecord>>;
 recordPractice(topicId:string,expectedVersion:number,input:NewPracticeEvent):Promise<StudyReceipt<PracticeChange>>;
 voidPracticeEvent(eventId:string,expectedVersion:number):Promise<StudyReceipt<PracticeChange>>;
}
export function emptyPracticeTopicApi(mode:'demo'|'live'):PracticeTopicApi {
 const reject=(name:string)=>()=>Promise.reject(new Error('practice-topics '+mode+': '+name+' unavailable until adapter'));
 return {
  mode,listTopics:async()=>({items:[],total:0,nextCursor:null}),
  getTopic:async()=>null,createTopic:reject('createTopic'),
  updateTopic:reject('updateTopic'),archiveTopic:reject('archiveTopic'),
  restoreTopic:reject('restoreTopic'),deleteTopic:reject('deleteTopic'),
  listEvents:async()=>({items:[],total:0,nextCursor:null}),
  recordPractice:reject('recordPractice'),voidPracticeEvent:reject('voidPracticeEvent'),
 };
}
