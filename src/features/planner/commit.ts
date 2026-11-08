// N68: best-effort multi-day orchestration over existing owner command APIs.
// No rollback can be advertised as atomic: blocks and day plans are separate
// audited transactions until the Owner resolves #1177.
import type {TaskRecord,TaskApi} from '../../data/tasks/contract';
import type {StudyApi,CalendarBlockRecord,StudyEntryRecord} from '../../data/study/contract';
import type {DayPlanApi,DayPlanRecord} from '../../data/day-plans/contract';
import type {PlannerPlacement} from './model';
import {validatePlannerWindow,type SheetSelection} from './selection';

export interface PlannerCommitSnapshot {
 from:string;through:string;zone:string;selection:SheetSelection;
 tasks:TaskRecord[];blocks:CalendarBlockRecord[];entries:StudyEntryRecord[];
}
export interface PlannerCommitApis {
 tasks:Pick<TaskApi,'getTask'>;
 study:Pick<StudyApi,'listCalendarBlocks'|'listStudyEntries'|
  'createCalendarBlock'|'deleteCalendarBlock'>;
 plans:Pick<DayPlanApi,'listPlans'|'createPlan'|'previewPlan'|
  'commitPlan'|'getPlan'|'updatePlan'>;
}
export class PlannerCommitError extends Error {
 constructor(message:string,public readonly committedDays:readonly string[],
  public readonly orphanBlockIds:readonly string[]){
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
/** Protects the selected output against obvious races *before* any write.
 * An authoritative day-plan commit still locks/verifies its source versions;
 * this client preflight does not purport to be the server transaction. */
export async function commitPlannerSelection(
 snapshot:PlannerCommitSnapshot,apis:PlannerCommitApis
):Promise<{committedDays:string[]}>{
 const {from,through,zone,selection,tasks,blocks,entries}=snapshot;
 if(selection.selected.length===0)throw new PlannerCommitError(
  'Choose at least one placement before committing',[],[]);
 if(from>through||!zone)throw new Error('Invalid planner day selection');
 const taskMap=new Map(tasks.map(t=>[t.id,t]));
 const referenced=new Set([...selection.selected.map(p=>p.taskId),
  ...selection.unplaced.map(p=>p.taskId)]);
 for(const id of referenced){
  const captured=taskMap.get(id);
  if(!captured)throw new Error('Task missing from planner preview; refresh');
  const current=await apis.tasks.getTask(id);
  if(!current||current.version!==captured.version)
   throw new Error('Task changed since preview; refresh the plan');
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
  throw new Error('Calendar changed since preview; refresh the plan');
 if(savedFocusSignature(currentEntries)!==savedFocusSignature(entries))
  throw new Error('Saved focus time changed since preview; refresh the plan');
 validatePlannerWindow(selection.selected,
  [...currentBlocks,...focusAsBlocks(currentEntries)],from,through,zone);
 if(plansPage.nextCursor||plansPage.total!==plansPage.items.length||
  plansPage.items.length>50)
  throw new Error('Unbounded owner day-plan preflight');
 const plansByDate=new Map<string,DayPlanRecord>();
 for(const plan of plansPage.items){
  if(plansByDate.has(plan.planDate))throw Error('Duplicate owner day plan');
  plansByDate.set(plan.planDate,plan);
 }
 const placementsByDay=new Map<string,PlannerPlacement[]>();
 for(const place of selection.selected)
  placementsByDay.set(place.date,[...(placementsByDay.get(place.date)??[]),place]);
 // Unplaced reasons must survive even when all selected placements belong
 // to dates *after* the first day in the requested window.
 if(selection.unplaced.length&&!placementsByDay.has(from))
  placementsByDay.set(from,[]);
 const chosenDays=[...placementsByDay.keys()].sort();
 for(const date of chosenDays){
  const old=plansByDate.get(date);
  if(old&&!['draft','previewed'].includes(old.status))
   throw new Error('An already committed day plan exists on '+date);
 }
 const committedDays:string[]=[];
 let pendingBlocks:CalendarBlockRecord[]=[];
 let staged:DayPlanRecord|null=null;
 let stagingDay:string|null=null;
 try{
  for(const date of chosenDays){
   const placements=placementsByDay.get(date)??[];
   stagingDay=date;
   pendingBlocks=[];
   staged=null;
   for(const place of placements){
    const title=taskMap.get(place.taskId)?.title;
    if(!title)throw new Error('Missing task title for '+place.taskId);
    const receipt=await apis.study.createCalendarBlock({
     kind:'study',title,startsAt:place.start,endsAt:place.end,
     timeZone:zone,taskId:place.taskId,
    });
    pendingBlocks.push(receipt.record);
   }
   let plan=plansByDate.get(date);
   if(!plan)plan=(await apis.plans.createPlan({
    planDate:date,timeZone:zone,
   })).record;
   const unplaced=date===from?selection.unplaced:[];
   const ids=new Set([...placements.map(x=>x.taskId),...unplaced.map(x=>x.taskId)]);
   const sources=[
    ...[...ids].map(id=>({
     resource:'tasks' as const,id,version:taskMap.get(id)!.version,
    })),
    ...pendingBlocks.map(b=>({
     resource:'calendar_blocks' as const,id:b.id,version:b.version,
    })),
    ...blocks.map(b=>({
     resource:'calendar_blocks' as const,id:b.id,version:b.version,
    })),
   ];
   const items=[
    ...placements.map((place,i)=>({
     taskId:place.taskId,blockId:pendingBlocks[i].id,
     disposition:'placed' as const,position:i,reason:null,
    })),
    ...unplaced.map((entry,i)=>({
     taskId:entry.taskId,blockId:null,disposition:'unplaced' as const,
     position:placements.length+i,reason:entry.reason,
    })),
   ];
   const previewed=await apis.plans.previewPlan(
    plan.id,plan.version,items,{sources});
   staged=previewed.record;
   await apis.plans.commitPlan(plan.id,staged.version);
   committedDays.push(date);
   pendingBlocks=[];
   staged=null;stagingDay=null;
  }
  return {committedDays};
 }catch(error){
  const cleanupFailed:string[]=[];
  // A lost commit acknowledgement could mean that the server DID commit.
  // Re-read before attempting to invalidate a preview or delete its blocks.
  if(staged){
   const now=await apis.plans.getPlan(staged.id).catch(()=>null);
   if(now?.status==='committed'){
    if(stagingDay&&!committedDays.includes(stagingDay))
     committedDays.push(stagingDay);
    // Never remove potentially committed blocks after uncertainty.
    pendingBlocks=[];
   }else{
    try{await apis.plans.updatePlan(staged.id,staged.version,{});}
    catch{cleanupFailed.push('Plan '+staged.id+' preview not safely reset');}
   }
  }
  // Only touch blocks written after the last *confirmed* day-plan commit.
  for(const block of [...pendingBlocks].reverse()){
   try{await apis.study.deleteCalendarBlock(block.id,block.version);}
   catch{cleanupFailed.push(block.id);}
  }
  const message=error instanceof Error?error.message:'Planner commit failed';
  throw new PlannerCommitError(message+
   (committedDays.length?
    '. Earlier committed days: '+committedDays.join(', ')+
     '; inspect Calendar before retrying.':'')+
   (cleanupFailed.length?
    '. Some uncommitted writes require manual review in Calendar.':''),
   committedDays,cleanupFailed);
 }
}
