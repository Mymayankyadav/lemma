import type {CheckpointView,ProjectStageProgress,ProjectSummary} from '../../data/types';
import type {ScheduledCheckpoint,ScheduleState} from '../../lib/schedule';
import {currentMiniRouteOrdinal} from '../../ui/timeline/MiniStageBar';

/** Use only home_summary's bounded stage counts; never fetch 36/40 detail rows. */
function summaryStages(project:ProjectSummary):ProjectStageProgress[]{
 const total=Math.max(0,project.total);
 const supplied=project.stageProgress;
 if(supplied?.length&&supplied.reduce((sum,s)=>sum+Math.max(0,s.total),0)===total)
  return supplied;
 return Array.from({length:Math.ceil(total/8)},(_,i)=>{
  const start=i*8+1,count=Math.min(8,total-i*8);
  return {label:'CP'+start+'–'+(start+count-1),
   firstCode:'CP'+start,lastCode:'CP'+(start+count-1),
   total:count,done:Math.max(0,Math.min(count,project.done-i*8)),
   overdue:0,schedule:'unscheduled' as const};
 });
}

const stageState:Record<ProjectStageProgress['schedule'],ScheduleState>={
 complete:'on_time',behind:'late',dated:'future',unscheduled:'unscheduled',
};

/** The old aggregate labels are not the owner-approved v4 status vocabulary. */
export function summaryScheduleStatus(project:ProjectSummary):string{
 const headline=project.scheduleHeadline?.trim()??'';
 if(/^\d+\s+days?\s+behind$/i.test(headline))return headline;
 if(/^\d+\s+days?\s+ahead$/i.test(headline))return headline;
 if(/behind|overdue/i.test(headline))return 'Behind schedule';
 if(/ahead/i.test(headline))return 'Ahead of schedule';
 if(/on schedule|dates planned|dated|planned/i.test(headline))return 'On schedule';
 if(/not started/i.test(headline))return 'Not started';
 if(project.total>0&&project.done>=project.total)return 'Complete';
 return project.done===0&&!project.targetDate?'Not started':'On schedule';
}

/** Synthetic stations represent aggregate counts, not invented detail data.
 * Only the actual current checkpoint's code/title are used for navigation.
 * All other marks are passive and never link to guessed checkpoint codes.
 */
export function summaryRouteCheckpoints(project:ProjectSummary):{
 checkpoints:CheckpointView[];
 scheduleRows:ScheduledCheckpoint[];
 foldedLabel:string;
}{
 const stages=summaryStages(project),total=stages.reduce((n,s)=>n+s.total,0);
 if(!total)return {checkpoints:[],scheduleRows:[],foldedLabel:'0 groups · 0 to go'};
 const ordinal=currentMiniRouteOrdinal(project.current?.code,stages,project.done);
 const currentIndex=Math.max(0,Math.min(total-1,Math.floor(ordinal)));
 const checkpoints:CheckpointView[]=[];
 const scheduleRows:ScheduledCheckpoint[]=[];
 let offset=0,currentStage=0;
 for(const [stageIndex,stage] of stages.entries()){
  const stageName=stage.label.replace(/^(CP\d+)–CP(\d+)$/,'$1–$2');
  for(let i=0;i<stage.total;i++){
   const index=offset+i;
   const isCurrent=!!project.current&&index===currentIndex;
   const done=i<Math.max(0,Math.min(stage.total,stage.done))&&!isCurrent;
   const code=isCurrent?project.current!.code:
    i===0?stage.firstCode:i===stage.total-1?stage.lastCode:'CP'+(index+1);
   const cp:CheckpointView={
    id:project.id+':summary:'+index,code,
    title:isCurrent?project.current!.title:'',
    position:index+1,stage:stageName,
    ui:isCurrent?'now':done?'done':index<currentIndex?'next':'locked',
    currentStep:isCurrent?project.current!.step:0,
    stepsTotal:isCurrent?project.current!.stepsTotal:1,
    recheckDue:null,dueCards:0,
   };
   checkpoints.push(cp);
   scheduleRows.push({checkpoint:cp,dueOn:null,inferred:false,
    state:stageState[stage.schedule],deltaDays:null,actualOn:null,projected:false});
   if(isCurrent)currentStage=stageIndex;
  }
  offset+=stage.total;
 }
 // With no current checkpoint, point at the next unfinished group.
 if(!project.current){
  let before=0;
  for(const [index,stage] of stages.entries()){
   if(currentIndex<before+stage.total){currentStage=index;break;}
   before+=stage.total;
  }
 }
 const remainingGroups=Math.max(0,stages.length-currentStage-1);
 const remainingCheckpoints=stages.slice(currentStage+1).reduce((sum,s)=>sum+s.total,0);
 const named=!!project.stageProgress?.length&&
  project.stageProgress.some(s=>!/^CP\d+\s*[–-]\s*(?:CP)?\d+$/i.test(s.label));
 return {checkpoints,scheduleRows,
  foldedLabel:remainingGroups+' '+(named?'stages':'groups')+' · '+remainingCheckpoints+' to go'};
}
