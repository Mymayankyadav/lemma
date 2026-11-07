// N62.1: owner-independent review-run and queued-item contract.
// N62.2 supplies tab-local demo persistence and authenticated live RPC adapters.
import type {StudyReceipt} from '../study/contract';

export type ReviewRunStatus='running'|'paused'|'exhausted'|'completed'|'abandoned';
export type ReviewRunItemState='pending'|'graded'|'stale';
export type ReviewRunSource='app'|'mcp'|'worker';
export interface ReviewRunRecord {
 id:string;filters:Record<string,unknown>;selectedDeckIds:string[];
 cardBudget:number;minuteBudget:number;schedulerVersion:string;settingsVersion:number;
 status:ReviewRunStatus;position:number;revealed:boolean;
 startedAt:string;pausedAt:string|null;endedAt:string|null;
 version:number;source:ReviewRunSource;createdAt:string;updatedAt:string;
}
export interface ReviewRunItemRecord {
 id:string;runId:string;position:number;cardId:string;expectedCardVersion:number;
 state:ReviewRunItemState;
 /** Positive Postgres bigint as decimal text: never lose a review receipt ID to JS rounding. */
 reviewId:string|null;staleReason:string|null;
 version:number;source:ReviewRunSource;createdAt:string;updatedAt:string;
}
export interface NewReviewRun {
 filters?:Record<string,unknown>;selectedDeckIds?:string[];
 cardBudget?:number;minuteBudget?:number;
 schedulerVersion:string;settingsVersion:number;
}
export interface ReviewRunQuery {
 status?:ReviewRunStatus[];limit?:number;cursor?:string|null;
}
export interface ReviewRunItemQuery {limit?:number;cursor?:string|null}
export interface ReviewRunPage<T> {items:T[];total:number;nextCursor:string|null}
/** Grading happens through the card's existing grade path. Advance only LINKS its receipt. */
export type ReviewRunAdvance =
 | {kind:'graded';itemId:string;reviewId:string}
 | {kind:'stale';itemId:string;reason:string};
export interface ReviewRunChange {run:ReviewRunRecord;item:ReviewRunItemRecord}
export interface ReviewRunApi {
 readonly mode:'demo'|'live';
 listRuns(query?:ReviewRunQuery):Promise<ReviewRunPage<ReviewRunRecord>>;
 getRun(id:string):Promise<ReviewRunRecord|null>;
 listRunItems(runId:string,query?:ReviewRunItemQuery):Promise<ReviewRunPage<ReviewRunItemRecord>>;
 startRun(input:NewReviewRun):Promise<StudyReceipt<ReviewRunRecord>>;
 pauseRun(runId:string,expectedVersion:number):Promise<StudyReceipt<ReviewRunRecord>>;
 resumeRun(runId:string,expectedVersion:number):Promise<StudyReceipt<ReviewRunRecord>>;
 advanceRun(runId:string,expectedVersion:number,input:ReviewRunAdvance):Promise<StudyReceipt<ReviewRunChange>>;
 abandonRun(runId:string,expectedVersion:number):Promise<StudyReceipt<ReviewRunRecord>>;
 completeRun(runId:string,expectedVersion:number):Promise<StudyReceipt<ReviewRunRecord>>;
}
export class ReviewRunError extends Error {
 constructor(public readonly code:'invalid'|'conflict'|'not_found',
  message:string,public readonly currentVersion?:number) {
  super(message);this.name='ReviewRunError';
 }
}
