import type {ProjectStageProgress} from '../../data/types';

type Stage=Pick<ProjectStageProgress,'label'|'total'|'done'|'schedule'>;
export type MiniRouteSegment=Stage&{groupedCount:number;widthPercent:number};

const priority:Record<Stage['schedule'],number>={
 complete:0,unscheduled:1,dated:2,behind:3,
};

/**
 * One continuous bar, with a minimum eight-pixel segment for every visible
 * stage. When the available width cannot hold the stage count, fold adjacent
 * stages together without dropping progress or changing plan order.
 *
 * The first 8px per segment are reserved before distributing the remainder
 * proportionally to checkpoint count, so a short stage never shrinks into a
 * barcode mark when a later stage has hundreds of checkpoints.
 */
export function layoutMiniRoute(stages:readonly Stage[],width:number):MiniRouteSegment[]{
 if(!stages.length)return [];
 const available=Math.max(48,Number.isFinite(width)?width:48);
 const maxSegments=Math.max(1,Math.floor(available/8));
 const groupSize=Math.ceil(stages.length/maxSegments);
 const groups:Omit<MiniRouteSegment,'widthPercent'>[]=[];
 for(let start=0;start<stages.length;start+=groupSize){
  const part=stages.slice(start,start+groupSize);
  const total=part.reduce((sum,stage)=>sum+Math.max(0,stage.total),0);
  const done=part.reduce((sum,stage)=>sum+Math.min(Math.max(0,stage.done),Math.max(0,stage.total)),0);
  const schedule=part.reduce<Stage['schedule']>((worst,stage)=>
   priority[stage.schedule]>priority[worst]?stage.schedule:worst,'complete');
  groups.push({
   label:part.length===1?part[0].label:part[0].label+'–'+part.at(-1)!.label,
   total,done,schedule,groupedCount:part.length,
  });
 }
 const remaining=available-8*groups.length;
 const weight=groups.reduce((sum,group)=>sum+group.total,0);
 return groups.map(group=>({
  ...group,
  widthPercent:100*(8+remaining*(weight?group.total/weight:1/groups.length))/available,
 }));
}
