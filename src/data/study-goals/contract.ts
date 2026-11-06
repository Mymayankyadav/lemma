// N59: D8(c) owner-bound study goal contract, independent of N45 migration.
import type {StudyReceipt} from '../study/contract';
export type GoalPeriod='week'|'month'|'custom';
export type GoalSource='app'|'mcp'|'worker';
export interface GoalScope {subjectId?:string|null;projectId?:string|null}
export interface StudyGoalRecord extends GoalScope {
 id:string;period:GoalPeriod;startDate:string;endDate:string;timeZone:string;
 targetMinutes:number;archivedAt:string|null;source:GoalSource;
 version:number;createdAt:string;updatedAt:string;
}
export interface NewStudyGoal extends GoalScope {
 period:GoalPeriod;startDate:string;endDate:string;timeZone:string;targetMinutes:number;
}
export type StudyGoalPatch=Partial<Pick<StudyGoalRecord,
 'period'|'startDate'|'endDate'|'timeZone'|'targetMinutes'>> & GoalScope;
export interface StudyGoalQuery {
 limit?:number;
 cursor?:string|null;
 archived?:'all'|'active'|'archived';
}
export interface StudyGoalPage {
 items:StudyGoalRecord[];total:number;nextCursor:string|null;
}
export interface StudyGoalApi {
 readonly mode:'demo'|'live';
 listStudyGoals(query?:StudyGoalQuery):Promise<StudyGoalPage>;
 getStudyGoal(id:string):Promise<StudyGoalRecord|null>;
 createStudyGoal(input:NewStudyGoal):Promise<StudyReceipt<StudyGoalRecord>>;
 updateStudyGoal(id:string,expectedVersion:number,patch:StudyGoalPatch):Promise<StudyReceipt<StudyGoalRecord>>;
 archiveStudyGoal(id:string,expectedVersion:number):Promise<StudyReceipt<StudyGoalRecord>>;
 restoreStudyGoal(id:string,expectedVersion:number):Promise<StudyReceipt<StudyGoalRecord>>;
 deleteStudyGoal(id:string,expectedVersion:number):Promise<StudyReceipt<{id:string}>>;
}
