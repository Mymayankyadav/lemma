// N58.1: typed parked thoughts. Conversion is one server command, never two browser writes.
import type {StudyReceipt} from '../study/contract';
import type {NewTask,TaskRecord} from '../tasks/contract';
export type ThoughtStatus='open'|'converted'|'dismissed';
export interface ParkedThought {
 id:string;studyEntryId:string|null;text:string;status:ThoughtStatus;
 destinationKind:'task'|null;destinationId:string|null;resolvedAt:string|null;
 version:number;createdAt:string;updatedAt:string;
}
export interface NewThought{studyEntryId?:string|null;text:string}
export interface ThoughtPatch{text?:string;studyEntryId?:string|null}
export interface ThoughtQuery{status?:ThoughtStatus[];limit?:number;cursor?:string|null}
export interface ThoughtPage{items:ParkedThought[];total:number;nextCursor:string|null}
export interface ThoughtApi {
 readonly mode:'demo'|'live';
 listThoughts(query?:ThoughtQuery):Promise<ThoughtPage>;
 getThought(id:string):Promise<ParkedThought|null>;
 createThought(input:NewThought):Promise<StudyReceipt<ParkedThought>>;
 editThought(id:string,expectedVersion:number,patch:ThoughtPatch):Promise<StudyReceipt<ParkedThought>>;
 dismissThought(id:string,expectedVersion:number):Promise<StudyReceipt<ParkedThought>>;
 reopenThought(id:string,expectedVersion:number):Promise<StudyReceipt<ParkedThought>>;
 deleteThought(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
 /** Atomic N44 conversion: the one receipt contains both the new Task and resolved thought. */
 convertToTask(id:string,expectedVersion:number,task:NewTask):Promise<StudyReceipt<{thought:ParkedThought;task:TaskRecord}>>;
}
export class ThoughtError extends Error {
 constructor(public readonly code:'invalid'|'conflict'|'not_found',message:string){super(message);this.name='ThoughtError'}
}
