// N64.1: shared typed contract for study notices, drift and urge events.
// Owner/source fields and command-managed void state never enter browser inputs.
import type {StudyReceipt} from '../study/contract';

export type StudyEventKind='notice'|'drift'|'urge';
export type StudyEventRelatedKind='task'|'calendar_block'|'study_entry';
export type StudyEventSource='app'|'mcp'|'worker';

export interface StudyEventRecord {
 id:string;entryId:string;kind:StudyEventKind;occurredAt:string;
 durationMinutes:number|null;note:string|null;
 relatedKind:StudyEventRelatedKind|null;relatedId:string|null;
 voidedAt:string|null;version:number;source:StudyEventSource;
 createdAt:string;updatedAt:string;
}
export interface NewStudyEvent {
 entryId:string;kind:StudyEventKind;occurredAt?:string;
 durationMinutes?:number|null;note?:string|null;
 relatedKind?:StudyEventRelatedKind|null;relatedId?:string|null;
}
export interface StudyEventPatch {
 entryId?:string;kind?:StudyEventKind;occurredAt?:string;
 durationMinutes?:number|null;note?:string|null;
 relatedKind?:StudyEventRelatedKind|null;relatedId?:string|null;
}
export interface StudyEventQuery {
 /** The signed-in owner's RLS applies; owner IDs are never accepted. */
 entryId?:string;kind?:StudyEventKind[];includeVoided?:boolean;
 limit?:number;cursor?:string|null;
}
export interface StudyEventPage {items:StudyEventRecord[];total:number;nextCursor:string|null}
export interface StudyEventApi {
 readonly mode:'demo'|'live';
 listEvents(query?:StudyEventQuery):Promise<StudyEventPage>;
 getEvent(id:string):Promise<StudyEventRecord|null>;
 recordEvent(input:NewStudyEvent):Promise<StudyReceipt<StudyEventRecord>>;
 editEvent(id:string,expectedVersion:number,patch:StudyEventPatch):Promise<StudyReceipt<StudyEventRecord>>;
 voidEvent(id:string,expectedVersion:number):Promise<StudyReceipt<StudyEventRecord>>;
 restoreEvent(id:string,expectedVersion:number):Promise<StudyReceipt<StudyEventRecord>>;
}
