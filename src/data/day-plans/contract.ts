// N60.1: common typed day-plan contract. N60.2 supplies persistent adapters.
import type {StudyReceipt} from '../study/contract';
import type {CommitPlacementsInput} from './placements';

export type DayPlanStatus='draft'|'previewed'|'committed'|'closed';
export type PlanSourceResource='tasks'|'calendar_blocks'|'study_entries';
export interface PlanSourceVersion {
 resource:PlanSourceResource;
 id:string;
 /** Optimistic version captured at preview, never current browser state alone. */
 version:number;
}
export interface PlanAvailability {sources:PlanSourceVersion[]}
export type PlanDisposition='placed'|'unplaced'|'carried_over';

export interface DayPlanItem {
 id:string;planId:string;taskId:string;blockId:string|null;
 disposition:PlanDisposition;reason:string|null;position:number;
 version:number;
}
export interface NewDayPlanItem {
 taskId:string;blockId?:string|null;disposition:PlanDisposition;
 reason?:string|null;position:number;
}
/** One record per owner + civil planDate; never carry yesterday's close state. */
export interface DayPlanRecord {
 id:string;planDate:string;timeZone:string;
 intention:string;capacityMinutes:number;availability:PlanAvailability;
 status:DayPlanStatus;closedAt:string|null;
 tomorrowFirstTaskId:string|null;ritual:Record<string,unknown>;
 version:number;createdAt:string;updatedAt:string;
}
export interface NewDayPlan {
 planDate:string;timeZone:string;intention?:string;
 capacityMinutes?:number;availability?:PlanAvailability;
 tomorrowFirstTaskId?:string|null;ritual?:Record<string,unknown>;
}
export type DayPlanPatch=Partial<Pick<DayPlanRecord,
 'timeZone'|'intention'|'capacityMinutes'|'availability'|
 'tomorrowFirstTaskId'|'ritual'>>;
export interface DayPlanQuery {
 from?:string;through?:string;
 status?:DayPlanStatus[];
 /** Owner-scoped 1–50 row keyset page, with filter-bound opaque cursor. */
 limit?:number;cursor?:string|null;
}
/** One atomic receipt covers all of the owner's selected civil days. */
export interface AtomicPlacementResult {plans:DayPlanRecord[];blockIds:string[]}
export interface DayPlanPage {items:DayPlanRecord[];total:number;nextCursor:string|null}
export interface DayPlanItemPage {items:DayPlanItem[];total:number;nextCursor:string|null}
export interface DayPlanApi {
 readonly mode:'demo'|'live';
 listPlans(query?:DayPlanQuery):Promise<DayPlanPage>;
 getPlan(id:string):Promise<DayPlanRecord|null>;
 listItems(planId:string,query?:{limit?:number;cursor?:string|null}):Promise<DayPlanItemPage>;
 createPlan(input:NewDayPlan):Promise<StudyReceipt<DayPlanRecord>>;
 updatePlan(id:string,expectedVersion:number,patch:DayPlanPatch):Promise<StudyReceipt<DayPlanRecord>>;
 /** Preview captures task/block versions and unplaced items; it does not commit. */
 previewPlan(id:string,expectedVersion:number,items:NewDayPlanItem[],
  availability:PlanAvailability):Promise<StudyReceipt<DayPlanRecord>>;
 /** N107: one journalled owner action covers every placement, plan and item. */
 commitPlacements(input:CommitPlacementsInput):Promise<StudyReceipt<AtomicPlacementResult>>;
 /** Undo one atomic placement action (every block, plan and item together)
  * through the journalled undo path. Refused when a newer owner write exists
  * or when the receipt had no action number (demo mode has no journal). */
 undoPlacements(actionNo:number):Promise<void>;
 /** Server atomically validates snapshot versions before creating placements. */
 commitPlan(id:string,expectedVersion:number):Promise<StudyReceipt<DayPlanRecord>>;
 closePlan(id:string,expectedVersion:number,
  ritual?:Record<string,unknown>):Promise<StudyReceipt<DayPlanRecord>>;
 reopenPlan(id:string,expectedVersion:number):Promise<StudyReceipt<DayPlanRecord>>;
}
export class DayPlanError extends Error {
 constructor(public readonly code:'invalid'|'conflict'|'not_found',message:string) {
  super(message);this.name='DayPlanError';
 }
}
