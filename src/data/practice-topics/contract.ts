/** N57: owner-scoped manual practice, separate from FSRS cards and reviews. */
import type {StudyReceipt} from '../study/contract';

export type PracticeCadence =
  | {kind:'fixed_days';days:number}
  | {kind:'after_rating';daysByRating:{'1':number;'2':number;'3':number;'4':number}};
export interface PracticeLinks {
  subjectId?:string|null;
  conceptId?:string|null;
  checkpointId?:string|null;
}
export interface PracticeTopic extends PracticeLinks {
  id:string;
  title:string;
  nextDueDate:string|null; // Owner civil YYYY-MM-DD, never an ISO instant.
  cadence:PracticeCadence;
  lastPracticedAt:string|null;
  archivedAt:string|null;
  version:number;
  createdAt:string;
  updatedAt:string;
  source:'app'|'mcp'|'worker';
}
export interface PracticeEvent {
  id:string;
  topicId:string;
  occurredAt:string; // ISO instant, distinct from owner civil practice day.
  rating:1|2|3|4;
  response:string|null;
  minutes:number|null;
  voidedAt:string|null;
  createdAt:string;
  version:number;
}
export interface NewPracticeTopic extends PracticeLinks {
  title:string;
  nextDueDate?:string|null;
  cadence:PracticeCadence;
}
export type PracticeTopicPatch=Partial<Pick<PracticeTopic,'title'|'nextDueDate'|'cadence'>> & PracticeLinks;
export interface RecordPractice {
  topicId:string;
  expectedVersion:number;
  occurredAt:string;
  /** Civil date in the owner's zone, supplied explicitly by the caller. */
  practiceDay:string;
  rating:1|2|3|4;
  response?:string|null;
  minutes?:number|null;
}
export interface PracticeQuery {
  includeArchived?:boolean;
  limit?:number; // 1–50, default 20
  cursor?:string|null;
}
export interface PracticePage {items:PracticeTopic[];total:number;nextCursor:string|null}
export interface PracticeTopicApi {
  readonly mode:'demo'|'live';
  listTopics(query?:PracticeQuery):Promise<PracticePage>;
  getTopic(id:string):Promise<PracticeTopic|null>;
  listEvents(topicId:string):Promise<PracticeEvent[]>;
  createTopic(input:NewPracticeTopic):Promise<StudyReceipt<PracticeTopic>>;
  updateTopic(id:string,expectedVersion:number,patch:PracticeTopicPatch):Promise<StudyReceipt<PracticeTopic>>;
  archiveTopic(id:string,expectedVersion:number):Promise<StudyReceipt<PracticeTopic>>;
  restoreTopic(id:string,expectedVersion:number):Promise<StudyReceipt<PracticeTopic>>;
  deleteTopic(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
  recordPractice(input:RecordPractice):Promise<StudyReceipt<{topic:PracticeTopic;event:PracticeEvent}>>;
  voidPracticeEvent(eventId:string,expectedVersion:number):Promise<StudyReceipt<{topic:PracticeTopic;event:PracticeEvent}>>;
}
