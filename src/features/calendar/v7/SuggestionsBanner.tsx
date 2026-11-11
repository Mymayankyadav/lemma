import {useEffect,useRef,useState} from 'react';
import {getDayPlanApi} from '../../../data/day-plans';
import {getStudyApi} from '../../../data/study';
import {getTaskApi} from '../../../data/tasks';
import {Banner} from '../../../ui/v7/components';
import {useToast} from '../../../ui/Toast';
import PlannerLaunch from '../../planner/Sheet';
import {commitPlannerSelection} from '../../planner/commit';
import {selectPlannerPlacements} from '../../planner/selection';
import {loadSuggestions,type Suggestions} from './suggestions';
import {suggestionLabel} from './quickAddModel';
import type {SuggestedBlock} from './DayGrid';

/** PLAN §6.6: the planner's one-day preview as a banner. Add all commits it atomically; Adjust opens the planner. */
export default function SuggestionsBanner({date,zone,openPlanner,onChanged,onPlannerClosed,onSuggest}:{
 date:string;zone:string;openPlanner:boolean;onChanged:()=>void;onPlannerClosed:()=>void;
 /** Where the suggestions would land, so the grid can draw them. */
 onSuggest?:(items:SuggestedBlock[])=>void;
}){
 const notify=useToast(),[data,setData]=useState<Suggestions|null>(null),[adjusting,setAdjusting]=useState(openPlanner),[busy,setBusy]=useState(false);
 const operation=useRef<string|null>(null);
 useEffect(()=>{
  let live=true;setData(null);
  void loadSuggestions(date,zone).then(next=>{if(live)setData(next);}).catch(()=>{if(live)setData(null);});
  return()=>{live=false;};
 },[date,zone]);
 useEffect(()=>{if(openPlanner)setAdjusting(true);},[openPlanner]);
 const count=data?.result.placements.length??0;
 useEffect(()=>{
  onSuggest?.((data?.result.placements??[]).map(place=>({id:place.taskId+':'+place.part,start:place.start,end:place.end,title:data!.tasks.find(task=>task.id===place.taskId)?.title??'Study task'})));
  return()=>onSuggest?.([]);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data]);
 async function addAll(){
  if(!data||busy||!count)return;
  setBusy(true);
  try{
   const plans=getDayPlanApi(),id=operation.current??crypto.randomUUID();operation.current=id;
   const selected=selectPlannerPlacements(data.result,new Set(data.result.placements.map(place=>place.taskId+':'+place.part)));
   const done=await commitPlannerSelection({from:date,through:date,zone,selection:selected,tasks:data.tasks,blocks:data.blocks,entries:data.entries},{tasks:getTaskApi(),study:getStudyApi(),plans},id);
   operation.current=null;setData(null);onChanged();
   notify((count===1?'Added 1 block':'Added '+count+' blocks')+' to your calendar',{tone:'success',...(done.actionNo!==null?{action:{label:'Undo',onClick:()=>{
    void plans.undoPlacements(done.actionNo!).then(()=>{onChanged();notify('Removed the planned blocks',{tone:'success'});},()=>notify('Could not undo the planner commit',{tone:'danger'}));}}}:{})});
  }catch(problem){notify((problem as Error).message||'Could not add the suggested blocks',{tone:'danger'});}
  finally{setBusy(false);}
 }
 return <>
  {count>0&&<Banner tone="good" action={busy?'Adding…':'Add all'} onAction={()=>{void addAll();}}>
   {suggestionLabel(count)} <button type="button" className="v7-link-button" onClick={()=>setAdjusting(true)}>Adjust</button></Banner>}
  {adjusting&&<PlannerLaunch date={date} zone={zone} autoOpen hideTrigger onClosed={()=>{setAdjusting(false);onPlannerClosed();onChanged();}}/>}
 </>;
}
