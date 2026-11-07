// N59.1: typed study-goals contract shared by demo and future owner-RLS live adapter.
import type {StudyReceipt} from '../study/contract';
export type GoalPeriod='week'|'month'|'custom';
export interface GoalScope {subjectId?:string|null;projectId?:string|null}
/** Dates are inclusive civil YYYY-MM-DD values; timeZone is an IANA identifier. */
export interface GoalRecord extends GoalScope {
 id:string;period:GoalPeriod;startDate:string;endDate:string;timeZone:string;
 targetMinutes:number;archivedAt:string|null;version:number;
 createdAt:string;updatedAt:string;
}
export interface NewGoal extends GoalScope {
 period:GoalPeriod;startDate:string;endDate:string;timeZone:string;targetMinutes:number;
}
export type GoalPatch=Partial<Pick<GoalRecord,
 'period'|'startDate'|'endDate'|'timeZone'|'targetMinutes'>> & GoalScope;
export interface GoalQuery {
 /** Unarchived goals by default. Archived goals are read-only history unless restored. */
 includeArchived?:boolean;
 /** Bounded 1–50; cursor is bound to the filter. */
 limit?:number;cursor?:string|null;
 /** Optional owner-scoped ID filter; null selects unscoped rows. */
 subjectId?:string|null;projectId?:string|null;
}
export interface GoalPage {items:GoalRecord[];total:number;nextCursor:string|null}
export interface GoalApi {
 readonly mode:'demo'|'live';
 listGoals(query?:GoalQuery):Promise<GoalPage>;
 getGoal(id:string):Promise<GoalRecord|null>;
 createGoal(input:NewGoal):Promise<StudyReceipt<GoalRecord>>;
 updateGoal(id:string,expectedVersion:number,patch:GoalPatch):Promise<StudyReceipt<GoalRecord>>;
 archiveGoal(id:string,expectedVersion:number):Promise<StudyReceipt<GoalRecord>>;
 restoreGoal(id:string,expectedVersion:number):Promise<StudyReceipt<GoalRecord>>;
 deleteGoal(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
}
export function emptyGoalApi(mode:'demo'|'live'):GoalApi {
 const refuse=(operation:string)=>()=>Promise.reject(new Error(
  'study-goals '+mode+': '+operation+' unavailable until adapter'));
 return {
  mode,listGoals:async()=>({items:[],total:0,nextCursor:null}),getGoal:async()=>null,
  createGoal:refuse('createGoal'),updateGoal:refuse('updateGoal'),
  archiveGoal:refuse('archiveGoal'),restoreGoal:refuse('restoreGoal'),
  deleteGoal:refuse('deleteGoal'),
 };
}
