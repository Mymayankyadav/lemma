// N57.1 manual practice topics and events; independent of FSRS card reviews.
import type {StudyReceipt} from '../study/contract';
export type PracticeRating=1|2|3|4;
export type PracticeCadence=
 |{kind:'fixed_days';days:number}
 |{kind:'after_rating';daysByRating:[number,number,number,number]};
export interface PracticeLinks{subjectId?:string|null;conceptId?:string|null;checkpointId?:string|null}
export interface PracticeTopic extends PracticeLinks{
 id:string;title:string;nextDueDate:string|null;cadence:PracticeCadence;
 lastPracticedAt:string|null;archivedAt:string|null;version:number;createdAt:string;updatedAt:string;
}
export interface PracticeEvent{
 id:string;topicId:string;occurredAt:string;rating:PracticeRating;
 response:string|null;minutes:number|null;voidedAt:string|null;version:number;
}
export type NewPracticeTopic=PracticeLinks & Pick<PracticeTopic,'title'|'cadence'> & {nextDueDate?:string|null};
export type PracticeTopicPatch=PracticeLinks & Partial<Pick<PracticeTopic,'title'|'cadence'|'nextDueDate'>>;
export interface PracticePage<T>{items:T[];total:number;nextCursor:string|null}
export interface PracticeQuery{limit?:number;cursor?:string|null;archived?:boolean}
export interface PracticeApi{
 readonly mode:'demo'|'live';
 listTopics(q?:PracticeQuery):Promise<PracticePage<PracticeTopic>>;
 listEvents(topicId:string,q?:PracticeQuery):Promise<PracticePage<PracticeEvent>>;
 createTopic(input:NewPracticeTopic):Promise<StudyReceipt<PracticeTopic>>;
 updateTopic(id:string,expectedVersion:number,patch:PracticeTopicPatch):Promise<StudyReceipt<PracticeTopic>>;
 archiveTopic(id:string,expectedVersion:number):Promise<StudyReceipt<PracticeTopic>>;
 restoreTopic(id:string,expectedVersion:number):Promise<StudyReceipt<PracticeTopic>>;
 deleteTopic(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
 recordPractice(topicId:string,expectedVersion:number,input:{occurredAt:string;rating:PracticeRating;response?:string|null;minutes?:number|null}):Promise<StudyReceipt<PracticeEvent>>;
 voidEvent(topicId:string,eventId:string,expectedVersion:number):Promise<StudyReceipt<PracticeEvent>>;
}
export class PracticeError extends Error{
 constructor(public readonly code:'invalid'|'conflict'|'not_found',message:string){super(message);this.name='PracticeError'}
}
