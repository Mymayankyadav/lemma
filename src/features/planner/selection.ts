// N68 v6 planner-sheet selection, kept separate from N67's pure allocator.
// A deselection never silently deletes a task from the preview.
import type {PlannerPlacement,PlannerResult} from './model';
export interface SheetSelection {
 selected:PlannerPlacement[];
 unplaced:{taskId:string;reason:string}[];
}
export function selectPlannerPlacements(
 preview:PlannerResult,selectedTaskIds:ReadonlySet<string>,
 overrides:ReadonlyMap<string,{start:string;end:string;date:string}>=new Map()
):SheetSelection{
 const selected:PlannerPlacement[]=[],unplaced:SheetSelection['unplaced']=preview.unplaced.map(x=>({
  taskId:x.taskId,reason:x.reason,
 }));
 for(const p of preview.placements){
  if(!selectedTaskIds.has(p.taskId)&&
   !selectedTaskIds.has(p.taskId+':'+p.part)){
   if(!unplaced.some(x=>x.taskId===p.taskId))
    unplaced.push({taskId:p.taskId,reason:'Deselected by owner'});
   continue;
  }
  const update=overrides.get(p.taskId+':'+p.part);
  const moved=update?{...p,...update}:p;
  if(!Number.isFinite(Date.parse(moved.start))||
   !Number.isFinite(Date.parse(moved.end))||
   Date.parse(moved.end)<=Date.parse(moved.start))
   throw new Error('Invalid moved planner interval');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(moved.date))
   throw new Error('Invalid moved planner date');
  if(selected.some(x=>Date.parse(x.start)<Date.parse(moved.end)&&
   Date.parse(moved.start)<Date.parse(x.end)))
   throw new Error('Planner placements overlap after a move');
  selected.push(moved);
 }
 return {selected,unplaced};
}

/** Refuse moved placements outside the chosen owner-local range or over
 * existing active calendar blocks. Checking again immediately before writes
 * matters even when the original allocator produced a conflict-free preview. */
export function validatePlannerWindow(
 placements:readonly PlannerPlacement[],
 blocks:readonly {startsAt:string;endsAt:string;status:string}[],
 from:string,through:string,zone:string
):void{
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,
  year:'numeric',month:'2-digit',day:'2-digit'});
 const civil=(at:Date)=>{
  const parts=formatter.formatToParts(at);
  const read=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return read('year')+'-'+read('month')+'-'+read('day');
 };
 for(const place of placements){
  const start=Date.parse(place.start),end=Date.parse(place.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
   throw Error('Invalid selected planner interval');
  const day=civil(new Date(start));
  if(place.date!==day||day<from||day>through||civil(new Date(end-1))!==day)
   throw Error('Selected placement leaves the chosen owner-local planning day');
  if(blocks.some(block=>{
   if(block.status==='cancelled')return false;
   const a=Date.parse(block.startsAt),b=Date.parse(block.endsAt);
   return Number.isFinite(a)&&Number.isFinite(b)&&a<end&&start<b;
  }))throw Error('Selected placement overlaps an existing calendar block');
 }
}
