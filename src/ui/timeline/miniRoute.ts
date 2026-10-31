import type {ProjectStageProgress} from '../../data/types';

type Stage=Pick<ProjectStageProgress,'label'|'total'|'done'|'schedule'>;
export type MiniRouteSegment=Stage&{groupedCount:number;widthPercent:number};
type Group=Omit<MiniRouteSegment,'widthPercent'>&{start:number;end:number};

const priority:Record<Stage['schedule'],number>={
 complete:0,unscheduled:1,dated:2,behind:3,
};

/**
 * One continuous bar with >=8px per visible segment. Preserve the current
 * stage: fold adjacent future stages from the far end first, then fold the
 * oldest completed stages only when necessary. This keeps the user's current
 * position visible at 100x scale without turning stages into barcode ticks.
 */
export function layoutMiniRoute(stages:readonly Stage[],width:number):MiniRouteSegment[]{
 if(!stages.length)return [];
 const available=Math.max(48,Number.isFinite(width)?width:48);
 const maxSegments=Math.max(1,Math.floor(available/8));
 const firstIncomplete=stages.findIndex(stage=>stage.done<stage.total);
 const current=firstIncomplete<0?stages.length-1:firstIncomplete;
 const groups:Group[]=stages.map((stage,i)=>{
  const total=Math.max(0,stage.total);
  return {start:i,end:i,label:stage.label,total,
   done:Math.min(total,Math.max(0,stage.done)),
   schedule:stage.schedule,groupedCount:1};
 });
 while(groups.length>maxSegments){
  let pair=-1;
  // Merge the farthest future pair before touching the current stage.
  for(let i=groups.length-2;i>=0;i--){
   if(groups[i].start>current&&groups[i+1].start>current){pair=i;break;}
  }
  // If almost everything is complete, compress the oldest past first.
  if(pair<0)for(let i=0;i<groups.length-1;i++){
   if(groups[i].end<current&&groups[i+1].end<current){pair=i;break;}
  }
  // At very narrow widths a current-neighbour merge may be unavoidable.
  if(pair<0){
   const at=groups.findIndex(g=>g.start<=current&&g.end>=current);
   pair=Math.max(0,Math.min(groups.length-2,at));
  }
  const a=groups[pair],b=groups[pair+1];
  groups.splice(pair,2,{
   start:a.start,end:b.end,
   label:stages[a.start].label+'–'+stages[b.end].label,
   total:a.total+b.total,done:a.done+b.done,
   schedule:priority[a.schedule]>=priority[b.schedule]?a.schedule:b.schedule,
   groupedCount:a.groupedCount+b.groupedCount,
  });
 }
 const remaining=available-8*groups.length;
 const weight=groups.reduce((sum,group)=>sum+group.total,0);
 return groups.map(({start:_start,end:_end,...group})=>({
  ...group,
  widthPercent:100*(8+remaining*(weight?group.total/weight:1/groups.length))/available,
 }));
}
