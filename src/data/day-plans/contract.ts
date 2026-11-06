// N60 (D8c) — dated plans and their placements, independent of N46 migration.
// Civil planDate is never derived from an ISO instant or a browser-local clock.
import type { StudyReceipt } from '../study/contract';

export type DayPlanStatus = 'draft' | 'previewed' | 'committed' | 'closed';
export type DayPlanDisposition = 'placed' | 'unplaced' | 'carried_over';
export type DayPlanSource = 'app' | 'mcp' | 'worker';
export type DaySourceKind = 'task' | 'calendar_block';
export interface DaySourceVersion {kind:DaySourceKind;id:string;version:number}
export interface AvailabilityWindow {start:string;end:string}
export interface DayAvailability {
  windows:AvailabilityWindow[];
  /** Optimistic versions captured when previewing; N46 checks current DB versions on commit. */
  sources:DaySourceVersion[];
}
export interface DayPlanRitual {
  choice:string|null;
  completedSteps:string[];
  reflection:string|null;
}
export interface DayPlanItem {
  id:string;planId:string;taskId:string;calendarBlockId:string|null;
  disposition:DayPlanDisposition;reason:string|null;position:number;
}
export type NewDayPlanItem = Omit<DayPlanItem,'id'|'planId'>;
export interface DayPlanRecord {
  id:string;planDate:string;timeZone:string;intention:string;
  capacityMinutes:number;availability:DayAvailability;status:DayPlanStatus;
  closedAt:string|null;tomorrowFirstTaskId:string|null;ritual:DayPlanRitual;
  items:DayPlanItem[];source:DayPlanSource;
  version:number;createdAt:string;updatedAt:string;
}
export interface NewDayPlan {
  planDate:string;timeZone:string;intention:string;capacityMinutes:number;
  availability:DayAvailability;items?:NewDayPlanItem[];
  ritual?:DayPlanRitual;
}
export interface DayPlanPatch {
  intention?:string;capacityMinutes?:number;availability?:DayAvailability;
  items?:NewDayPlanItem[];ritual?:DayPlanRitual;
  /** Updating to previewed records the exact source versions for commit. */
  status?:'draft'|'previewed';
}
export interface DayClosure {
  tomorrowFirstTaskId?:string|null;
  ritual?:DayPlanRitual;
}
export interface DayPlanQuery {
  fromDate?:string;toDate?:string;
  status?:DayPlanStatus|'all';
  limit?:number;cursor?:string|null;
}
export interface DayPlanPage {items:DayPlanRecord[];total:number;nextCursor:string|null}
export interface DayPlanApi {
  readonly mode:'demo'|'live';
  listDayPlans(query?:DayPlanQuery):Promise<DayPlanPage>;
  getDayPlan(id:string):Promise<DayPlanRecord|null>;
  createDayPlan(input:NewDayPlan):Promise<StudyReceipt<DayPlanRecord>>;
  updateDayPlan(id:string,expectedVersion:number,patch:DayPlanPatch):Promise<StudyReceipt<DayPlanRecord>>;
  /** Requires a preview and unchanged captured task/block versions. */
  commitDayPlan(id:string,expectedVersion:number):Promise<StudyReceipt<DayPlanRecord>>;
  /** Closes only this dated plan, retaining unplaced and carried-over items. */
  closeDayPlan(id:string,expectedVersion:number,closure?:DayClosure):Promise<StudyReceipt<DayPlanRecord>>;
  reopenDayPlan(id:string,expectedVersion:number):Promise<StudyReceipt<DayPlanRecord>>;
}
