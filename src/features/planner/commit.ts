// N68: commits the selected placements through ONE atomic planner command
// (N107 `DayPlanApi.commitPlacements`): every block, day plan and item is one
// journalled action with one receipt and one Undo. A stale source refuses the
// whole commit on the server and nothing is written. The browser preflight
// below is advisory and only avoids an obviously stale request.
import type {TaskRecord,TaskApi} from '../../data/tasks/contract';
import type {StudyApi,CalendarBlockRecord,StudyEntryRecord} from '../../data/study/contract';
import {DayPlanError,type DayPlanApi,type DayPlanRecord} from '../../data/day-plans/contract';
import type {AtomicPlacementDay,PlacementSourceVersion} from '../../data/day-plans/placements';
import type {PlannerPlacement} from './model';
import {validatePlannerWindow,type SheetSelection} from './selection';

export interface PlannerCommitSnapshot {
 from:string;through:string;zone:string;selection:SheetSelection;
 tasks:TaskRecord[];blocks:CalendarBlockRecord[];entries:StudyEntryRecord[];
}
export interface PlannerCommitApis {
 tasks:Pick<TaskApi,'getTask'>;
 study:Pick<StudyApi,'listCalendarBlocks'|'listStudyEntries'>;
 plans:Pick<DayPlanApi,'listPlans'|'commitPlacements'>;
}
export interface PlannerCommitResult {
 committedDays:string[];
 /** Journal action for the whole commit; null in demo mode (no Undo offered). */
 actionNo:number|null;
}
export class PlannerCommitError extends Error {
 /** True when the server may have committed (retry must reuse the operation ID). */
 constructor(message:string,public readonly uncertain=false){
  super(message);this.name='PlannerCommitError';
 }
}
const dayOffset=(date:string,n:number)=>{
 const epoch=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(epoch))throw Error('Invalid planner civil day');
 return new Date(epoch+n*86400000).toISOString().slice(0,10);
};
const range=(from:string,through:string)=>({
 start:dayOffset(from,-2)+'T00:00:00Z',
 end:dayOffset(through,2)+'T00:00:00Z',
});
/** Only persisted focus intervals matter. Sort snapshots to avoid unstable RPC row order. */
export function savedFocusSignature(entries:readonly StudyEntryRecord[]):string{
 return JSON.stringify(entries.filter(e=>e.status==='saved').flatMap(e=>
  e.intervals.filter(i=>i.kind==='focus'&&i.end!==null).map(i=>({
   entryId:e.id,entryVersion:e.version,intervalId:i.id,
   start:i.start,end:i.end,
  }))).sort((a,b)=>a.entryId.localeCompare(b.entryId)||
   a.intervalId.localeCompare(b.intervalId)||a.start.localeCompare(b.start)));
}
function focusAsBlocks(entries:readonly StudyEntryRecord[]){
 return entries.filter(e=>e.status==='saved').flatMap(e=>
  e.intervals.filter(i=>i.kind==='focus'&&i.end!==null)
   .map(i=>({startsAt:i.start,endsAt:i.end!,status:'done'})));
}
/** Advisory preflight, then one atomic, idempotent server commit. */
export async function commitPlannerSelection(
 snapshot:PlannerCommitSnapshot,apis:PlannerCommitApis,
 operationId:string=crypto.randomUUID()
):Promise<PlannerCommitResult>{
 const {from,through,zone,selection,tasks,blocks,entries}=snapshot;
 if(selection.selected.length===0)throw new PlannerCommitError(
  'Choose at least one placement before committing');
 if(from>through||!zone)throw new PlannerCommitError('Invalid planner day selection');
 const taskMap=new Map(tasks.map(t=>[t.id,t]));
 const referenced=new Set([...selection.selected.map(p=>p.taskId),
  ...selection.unplaced.map(p=>p.taskId)]);
 for(const id of referenced){
  const captured=taskMap.get(id);
  if(!captured)throw new PlannerCommitError('Task missing from planner preview; refresh');
  const current=await apis.tasks.getTask(id);
  if(!current||current.version!==captured.version)
   throw new PlannerCommitError('Task changed since preview; refresh the plan');
 }
 const scanRange=range(from,through);
 const [currentBlocks,currentEntries,plansPage]=await Promise.all([
  apis.study.listCalendarBlocks(scanRange),
  apis.study.listStudyEntries(scanRange),
  apis.plans.listPlans({from,through,limit:50}),
 ]);
 // New, removed or changed blocks (not only moved ones) invalidate preview.
 const byId=new Map(currentBlocks.map(b=>[b.id,b.version]));
 if(currentBlocks.length!==blocks.length||
  blocks.some(b=>byId.get(b.id)!==b.version))
  throw new PlannerCommitError('Calendar changed since preview; refresh the plan');
 if(savedFocusSignature(currentEntries)!==savedFocusSignature(entries))
  throw new PlannerCommitError('Saved focus time changed since preview; refresh the plan');
 validatePlannerWindow(selection.selected,
  [...currentBlocks,...focusAsBlocks(currentEntries)],from,through,zone);
 if(plansPage.nextCursor||plansPage.total!==plansPage.items.length||
  plansPage.items.length>50)
  throw new PlannerCommitError('Unbounded owner day-plan preflight');
 const plansByDate=new Map<string,DayPlanRecord>();
 for(const plan of plansPage.items){
  if(plansByDate.has(plan.planDate))throw new PlannerCommitError('Duplicate owner day plan');
  plansByDate.set(plan.planDate,plan);
 }
 const placementsByDay=new Map<string,PlannerPlacement[]>();
 for(const place of selection.selected)
  placementsByDay.set(place.date,[...(placementsByDay.get(place.date)??[]),place]);
 // Unplaced reasons are recorded on the first requested day, even when every
 // selected placement belongs to a later day.
 if(selection.unplaced.length&&!placementsByDay.has(from))
  placementsByDay.set(from,[]);
 const chosenDays=[...placementsByDay.keys()].sort();
 for(const date of chosenDays){
  const old=plansByDate.get(date);
  if(old&&!['draft','previewed'].includes(old.status))
   throw new PlannerCommitError('An already committed day plan exists on '+date);
 }
 // Every source version captured at preview, for the server to lock and recheck.
 const capturedSources:PlacementSourceVersion[]=[
  ...blocks.map(b=>({resource:'calendar_blocks' as const,id:b.id,version:b.version})),
  ...entries.filter(e=>e.status==='saved'&&
   e.intervals.some(i=>i.kind==='focus'&&i.end!==null))
   .map(e=>({resource:'study_entries' as const,id:e.id,version:e.version})),
 ];
 const days:AtomicPlacementDay[]=chosenDays.map(date=>{
  const placements=placementsByDay.get(date)??[];
  const unplaced=date===from?selection.unplaced:[];
  const ids=[...new Set([...placements.map(x=>x.taskId),...unplaced.map(x=>x.taskId)])];
  const plan=plansByDate.get(date);
  return {
   planDate:date,timeZone:zone,
   ...(plan?{planId:plan.id,expectedVersion:plan.version}:{}),
   sources:[...ids.map(id=>({resource:'tasks' as const,id,
    version:taskMap.get(id)!.version})),...capturedSources],
   placements:placements.map((place,i)=>{
    const title=taskMap.get(place.taskId)?.title;
    if(!title)throw new PlannerCommitError('Missing task title for '+place.taskId);
    return {taskId:place.taskId,title,startsAt:place.start,endsAt:place.end,position:i};
   }),
   unplaced:unplaced.map((entry,i)=>({taskId:entry.taskId,reason:entry.reason,
    position:placements.length+i})),
  };
 });
 try{
  // The adapter retries a lost acknowledgement with this same operationId,
  // so a retry can never create a second set of blocks.
  const receipt=await apis.plans.commitPlacements({days,operationId});
  return {committedDays:chosenDays,actionNo:receipt.actionNo};
 }catch(error){
  const message=error instanceof Error?error.message:'Planner commit failed';
  // A typed server refusal rolled the whole transaction back. Anything else
  // (lost connection after the adapter's own retry) is uncertain.
  if(error instanceof DayPlanError)
   throw new PlannerCommitError(message+'. Nothing was written; refresh the plan and try again.',false);
  throw new PlannerCommitError(message+
   '. The commit may or may not have been saved; refresh the plan to check before retrying.',true);
 }
}
