// N56.1: shared deadline/milestone record contract.
// A date is a civil YYYY-MM-DD, never a midnight timestamp.
import type {StudyReceipt} from '../study/contract';
export type DeadlineKind='exam'|'seminar'|'assignment'|'milestone'|'other';
export type DeadlineStatus='open'|'done'|'cancelled';
export type DeadlineDue={kind:'date';date:string}|{kind:'instant';at:string};
export type EstimateSource='owner'|'derived';
export interface DeadlineLinks{subjectId?:string|null;projectId?:string|null;checkpointId?:string|null}
export interface DeadlineRecord extends DeadlineLinks{
 id:string;title:string;kind:DeadlineKind;due:DeadlineDue;
 remainingMinutes:number|null;estimateSource:EstimateSource|null;
 status:DeadlineStatus;version:number;createdAt:string;updatedAt:string;
}
export interface DeadlineProjection extends DeadlineRecord{
 origin:'deadline'|'project_target'|'checkpoint_due';
 /** Only explicit deadline rows can be mutated. */
 readonly:boolean;
}
export type NewDeadline=DeadlineLinks & Pick<DeadlineRecord,'title'|'kind'|'due'> & {
 remainingMinutes?:number|null;estimateSource?:EstimateSource|null;
};
export type DeadlinePatch=DeadlineLinks & Partial<Pick<DeadlineRecord,'title'|'kind'|'due'|'remainingMinutes'|'estimateSource'>>;
export interface DeadlineQuery{status?:DeadlineStatus[];limit?:number;cursor?:string|null}
export interface DeadlinePage{items:DeadlineProjection[];total:number;nextCursor:string|null}
export interface DeadlineApi{
 readonly mode:'demo'|'live';
 listDeadlines(query?:DeadlineQuery):Promise<DeadlinePage>;
 getDeadline(id:string):Promise<DeadlineRecord|null>;
 createDeadline(input:NewDeadline):Promise<StudyReceipt<DeadlineRecord>>;
 updateDeadline(id:string,expectedVersion:number,patch:DeadlinePatch):Promise<StudyReceipt<DeadlineRecord>>;
 completeDeadline(id:string,expectedVersion:number):Promise<StudyReceipt<DeadlineRecord>>;
 reopenDeadline(id:string,expectedVersion:number):Promise<StudyReceipt<DeadlineRecord>>;
 cancelDeadline(id:string,expectedVersion:number):Promise<StudyReceipt<DeadlineRecord>>;
 restoreDeadline(id:string,expectedVersion:number):Promise<StudyReceipt<DeadlineRecord>>;
 deleteDeadline(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
}
export class DeadlineError extends Error{
 constructor(public readonly code:'invalid'|'conflict'|'not_found',message:string){super(message);this.name='DeadlineError'}
}
