// N56.1: typed v6 deadlines app contract, shared by demo/live adapters and screens.
import type {StudyReceipt} from '../study/contract';
export type DeadlineKind='exam'|'seminar'|'assignment'|'milestone'|'other';
export type DeadlineStatus='open'|'done'|'cancelled';
/** A civil due date is not a UTC instant; never coerce one into the other. */
export type DeadlineDue={kind:'date';date:string}|{kind:'instant';at:string};
export type DeadlineOrigin='owner'|'project_target'|'checkpoint_due';
export interface DeadlineLinks {
 subjectId?:string|null;projectId?:string|null;checkpointId?:string|null;
}
export interface DeadlineRecord extends DeadlineLinks {
 id:string;title:string;kind:DeadlineKind;due:DeadlineDue;
 remainingMinutes:number|null;estimateSource:'owner'|'derived'|null;
 status:DeadlineStatus;origin:DeadlineOrigin;
 version:number;createdAt:string;updatedAt:string;
}
export interface NewDeadline extends DeadlineLinks {
 title:string;kind:DeadlineKind;due:DeadlineDue;
 remainingMinutes?:number|null;estimateSource?:'owner'|'derived'|null;
}
export type DeadlinePatch=Partial<Pick<DeadlineRecord,'title'|'kind'|'due'|'remainingMinutes'|'estimateSource'>> & DeadlineLinks;
export interface DeadlineQuery {
 /** Default open; 'all' includes completed and cancelled records. */
 statuses?:DeadlineStatus[];
 /** Include read-only projections of existing project/checkpoint target dates (default true). */
 includeProjections?:boolean;
 /** Bounded, exact total, 1–50 records per page. */
 limit?:number;cursor?:string|null;
}
export interface DeadlinePage {items:DeadlineRecord[];total:number;nextCursor:string|null}
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
 /** Project/checkpoint projections are read-only; never delete their source. */
 deleteDeadline(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
}
export function emptyDeadlineApi(mode:'live'|'demo'):DeadlineApi{
 const refuse=(operation:string)=>()=>Promise.reject(new Error('deadlines '+mode+': '+operation+' unavailable until live adapter'));
 return {
  mode,listDeadlines:async()=>({items:[],total:0,nextCursor:null}),getDeadline:async()=>null,
  createDeadline:refuse('create'),updateDeadline:refuse('update'),
  completeDeadline:refuse('complete'),reopenDeadline:refuse('reopen'),cancelDeadline:refuse('cancel'),
  restoreDeadline:refuse('restore'),deleteDeadline:refuse('delete')
 };
}
