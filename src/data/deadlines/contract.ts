// N56.1: typed deadline data contract. N42 supplies the eventual SQL implementation.
// Date-only deadlines stay civil dates; timed deadlines are explicit UTC instants.
import type {StudyReceipt} from '../study/contract';

export type DeadlineKind = 'exam'|'seminar'|'assignment'|'milestone'|'other';
export type DeadlineStatus = 'open'|'done'|'cancelled';
export type EstimateSource = 'owner'|'derived';
export type DeadlineOrigin = 'standalone'|'project_target'|'checkpoint_due';
export type DeadlineDue = {kind:'date';date:string}|{kind:'instant';at:string};
export interface DeadlineLinks {
 subjectId?:string|null;
 projectId?:string|null;
 checkpointId?:string|null;
}
export interface DeadlineRecord extends DeadlineLinks {
 id:string; title:string; kind:DeadlineKind; due:DeadlineDue;
 /** Whole remaining effort minutes, or null when no estimate exists. */
 remainingMinutes:number|null;
 estimateSource:EstimateSource|null;
 status:DeadlineStatus;
 /** Project/checkpoint dates are projections, never separate deadline rows. */
 origin:DeadlineOrigin;
 version:number;
 createdAt:string;
 updatedAt:string;
}
export interface NewDeadline extends DeadlineLinks {
 title:string;kind:DeadlineKind;due:DeadlineDue;
 remainingMinutes?:number|null;
 estimateSource?:EstimateSource|null;
}
export type DeadlinePatch = Partial<Pick<DeadlineRecord,'title'|'kind'|'due'|'remainingMinutes'|'estimateSource'>> & DeadlineLinks;
export interface DeadlineQuery {
 statuses?:DeadlineStatus[];
 limit?:number;
 cursor?:string|null;
}
export interface DeadlinePage {
 items:DeadlineRecord[];
 total:number;
 nextCursor:string|null;
}
export interface DeadlineApi {
 readonly mode:'demo'|'live';
 /** Owner-scoped, stable, bounded pages; includes project/checkpoint projections. */
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
export class DeadlineNotImplemented extends Error {
 readonly code='not_implemented';
 constructor(method:string){super('Live deadlines adapter not implemented until N56.2: '+method);this.name='DeadlineNotImplemented';}
}
export function emptyDeadlineApi():DeadlineApi {
 const refuse=(method:string)=>()=>Promise.reject(new DeadlineNotImplemented(method));
 return {
  mode:'live',
  listDeadlines:()=>Promise.resolve({items:[],total:0,nextCursor:null}),
  getDeadline:()=>Promise.resolve(null),
  createDeadline:refuse('createDeadline'),
  updateDeadline:refuse('updateDeadline'),
  completeDeadline:refuse('completeDeadline'),
  reopenDeadline:refuse('reopenDeadline'),
  cancelDeadline:refuse('cancelDeadline'),
  restoreDeadline:refuse('restoreDeadline'),
  deleteDeadline:refuse('deleteDeadline'),
 };
}
