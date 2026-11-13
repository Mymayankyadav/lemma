import {useEffect,useRef,useState} from 'react';
import {getDayPlanApi} from '../../../data/day-plans';
import {getStudyApi} from '../../../data/study';
import {getTaskApi} from '../../../data/tasks';
import {Button} from '../../../ui/v7/components';
import {StatusIcon} from '../../../ui/v7/KitPrimitives';
import {formatShortDate} from '../../../lib/format';
import {dayKey} from '../model';
import {useToast} from '../../../ui/Toast';
import PlannerLaunch from '../../planner/Sheet';
import {commitPlannerSelection} from '../../planner/commit';
import {selectPlannerPlacements} from '../../planner/selection';
import {loadSuggestions,type Suggestions} from './suggestions';
import {suggestionLabel} from './quickAddModel';
import type {SuggestedBlock} from './DayGrid';

/** PLAN §6.6: the planner's one-day preview as a banner. Add all commits it atomically; Adjust opens the planner. */
export default function SuggestionsBanner({date,zone,openPlanner,onChanged,onPlannerClosed,onSuggest,inline=false}:{
 date:string;zone:string;openPlanner:boolean;onChanged:()=>void;onPlannerClosed:()=>void;
 /** Where the suggestions would land, so the grid can draw them. */
 onSuggest?:(items:SuggestedBlock[])=>void;
 inline?:boolean;
}){
 const notify=useToast(),[data,setData]=useState<Suggestions|null>(null),[adjusting,setAdjusting]=useState(openPlanner),[busy,setBusy]=useState(false);
 const operation=useRef<{key:string;id:string}|null>(null),locked=useRef(false);
 useEffect(()=>{
  let live=true;setData(null);
  void loadSuggestions(date,zone).then(next=>{if(live)setData(next);}).catch(()=>{if(live)setData(null);});
  return()=>{live=false;};
 },[date,zone]);
 useEffect(()=>{if(openPlanner)setAdjusting(true);},[openPlanner]);
 const count=data?.result.placements.length??0;
 useEffect(()=>{
  onSuggest?.((data?.result.placements??[]).map(place=>({id:place.taskId+':'+place.part,start:place.start,end:place.end,title:data!.tasks.find(task=>task.id===place.taskId)?.title??'Study task',...(inline?{busy,onAccept:()=>{void addAll(place.taskId+':'+place.part);}}:{})})));
  return()=>onSuggest?.([]);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data,busy,inline]);
 async function addAll(only?:string){
  if(!data||locked.current||!count)return;
  locked.current=true;setBusy(true);
  try{
   const key=date+':'+(only??'all'),plans=getDayPlanApi(),id=operation.current?.key===key?operation.current.id:crypto.randomUUID();operation.current={key,id};
   const selected=selectPlannerPlacements(data.result,new Set(only?[only]:data.result.placements.map(place=>place.taskId+':'+place.part)));
   const done=await commitPlannerSelection({from:date,through:date,zone,selection:selected,tasks:data.tasks,blocks:data.blocks,entries:data.entries},{tasks:getTaskApi(),study:getStudyApi(),plans},id);
   operation.current=null;setData(null);onChanged();
   const added=only?1:count;
   notify((added===1?'Added 1 block':'Added '+added+' blocks')+' to your calendar',{tone:'success',...(done.actionNo!==null?{action:{label:'Undo',onClick:()=>{
    void plans.undoPlacements(done.actionNo!).then(()=>{onChanged();notify('Removed the planned blocks',{tone:'success'});},()=>notify('Could not undo the planner commit',{tone:'danger'}));}}}:{})});
  }catch(problem){notify((problem as Error).message||'Could not add the suggested blocks',{tone:'danger'});}
  finally{locked.current=false;setBusy(false);}
 }
 return <>
  {/* KC15/CD1: an info-tone banner in one 44 px row — a suggestion is not a success. "Adjust" stays an underlined link. */}
  {inline?<Button small variant="secondary" onClick={()=>setAdjusting(true)}>Plan day</Button>:count>0&&<div className="v7-cal-suggest v7-tone-info" role="region" aria-label="Suggested blocks">
   <StatusIcon tone="info" size={16}/>
   <p>{suggestionLabel(count)}{date===dayKey(new Date(),zone)?'':' for '+formatShortDate(date,{zone})} · <button type="button" className="v7-link-button" onClick={()=>setAdjusting(true)}>Adjust</button></p>
   <Button small variant="secondary" disabled={busy} onClick={()=>{void addAll();}}>{busy?'Adding…':'Add all'}</Button>
  </div>}
  {adjusting&&<PlannerLaunch v7 date={date} zone={zone} autoOpen hideTrigger onClosed={()=>{setAdjusting(false);onPlannerClosed();onChanged();}}/>}
 </>;
}
