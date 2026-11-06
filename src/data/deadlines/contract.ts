// N56: typed deadline and milestone adapter contract for the N42 owner tables.
// Civil due dates and timed instants are never converted into each other.
import type {StudyReceipt} from '../study/contract';

export type DeadlineKind='exam'|'seminar'|'assignment'|'milestone'|'other';
export type DeadlineStatus='open'|'done'|'cancelled';
export type DeadlineSource='app'|'mcp'|'worker';
export type EstimateSource='owner'|'derived';
export type DeadlineDue={kind:'date';date:string}|{kind:'instant';at:string};
export type DeadlineOrigin='deadline'|'project_target'|'checkpoint_due';

export interface DeadlineLinks {
 subjectId?:string|null;
 projectId?:string|null;
 checkpointId?:string|null;
}
export interface DeadlineRecord extends DeadlineLinks {
 id:string;title:string;kind:DeadlineKind;due:DeadlineDue;
 /** Whole minutes remaining, or null when there is no reliable estimate. */
 remainingMinutes:number|null;
 /** Owner-supplied and derived estimates are distinguishable. */
 estimateSource:EstimateSource|null;
 status:DeadlineStatus;source:DeadlineSource;
 /** Project targets/checkpoint due dates are projected, never copied to deadlines. */
 origin:DeadlineOrigin;
 version:number;createdAt:string;updatedAt:string;
}
export interface NewDeadline extends DeadlineLinks {
 title:string;kind:DeadlineKind;due:DeadlineDue;
 remainingMinutes?:number|null;estimateSource?:EstimateSource|null;
}
export type DeadlinePatch=Partial<Pick<DeadlineRecord,
 'title'|'kind'|'due'|'remainingMinutes'|'estimateSource'>> & DeadlineLinks;
export interface DeadlineQuery {
 /** Default: all statuses. The list is limited to 1–50 rows per page. */
 status?:DeadlineStatus[];
 limit?:number;
 cursor?:string|null;
}
export interface DeadlinePage {
 items:DeadlineRecord[];
 total:number;
 nextCursor:string|null;
}
export interface DeadlineApi {
 readonly mode:'live'|'demo';
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
