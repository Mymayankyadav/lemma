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
 const selected:PlannerPlacement[]=[],unplaced=preview.unplaced.map(x=>({
  taskId:x.taskId,reason:x.reason,
 }));
 for(const p of preview.placements){
  if(!selectedTaskIds.has(p.taskId)){
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
