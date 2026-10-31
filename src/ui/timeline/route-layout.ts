/** LOOK-3b: deterministic one-line Route geometry; no DOM or SVG layout guesses. */
export interface RouteStageSpan{start:number;end:number}
export interface RouteMark{
 kind:'station'|'stage';index:number;stageIndex:number;stageEnd:number;
 x:number;width:number;height:number;stages:number;selected:boolean;
}
type Draft=Omit<RouteMark,'x'>;
export interface RouteLayout{mode:'plain'|'folded';marks:RouteMark[];activeStage:number}
// Include the 1.5px outline around future/recheck stations.
const STATION_RADIUS=4.2;
// Reserve the full 11px translucent halo, not just the 5.5px red core.
const CURRENT_RADIUS=11;
const CLEARANCE=8;
const EDGE=12;
const capsuleWidth=(checkpoints:number)=>Math.max(4,Math.min(20,4*Math.sqrt(Math.max(1,checkpoints))));
const spanWidth=(marks:readonly Draft[])=>marks.reduce((sum,m)=>sum+m.width,0)+
 Math.max(0,marks.length-1)*CLEARANCE;

/** Every adjacent pair of drawn marks has at least 8 CSS px edge clearance.
 * In folded mode the current stage exposes at most nine stations. Other
 * stages are one capsule each; far-future capsules merge before past ones.
 */
export function layoutRoute(
 stages:readonly RouteStageSpan[],total:number,selectedIndex:number,containerWidth:number,
):RouteLayout{
 const n=Math.max(0,Math.floor(total));
 if(!n)return {mode:'plain',marks:[],activeStage:0};
 const width=Math.max(44,containerWidth);
 const selected=Math.max(0,Math.min(n-1,selectedIndex));
 const activeStage=Math.max(0,stages.findIndex(s=>s.start<=selected&&s.end>=selected));
 const plain=n<=Math.floor(width/22);
 const drafts:Draft[]=[];
 if(plain){
  for(let i=0;i<n;i++)drafts.push({
   kind:'station',index:i,stageIndex:Math.max(0,stages.findIndex(s=>s.start<=i&&s.end>=i)),
   stageEnd:Math.max(0,stages.findIndex(s=>s.start<=i&&s.end>=i)),
   width:i===selected?CURRENT_RADIUS*2:STATION_RADIUS*2,
   height:i===selected?CURRENT_RADIUS*2:STATION_RADIUS*2,
   stages:0,selected:i===selected,
  });
 }else{
  for(let s=0;s<stages.length;s++){
   const stage=stages[s];
   if(s===activeStage){
    const from=Math.max(stage.start,selected-4);
    const to=Math.min(stage.end,selected+4);
    for(let i=from;i<=to;i++)drafts.push({
     kind:'station',index:i,stageIndex:s,stageEnd:s,
     width:i===selected?CURRENT_RADIUS*2:STATION_RADIUS*2,
     height:i===selected?CURRENT_RADIUS*2:STATION_RADIUS*2,
     stages:0,selected:i===selected,
    });
   }else drafts.push({
    kind:'stage',index:stage.start,stageIndex:s,stageEnd:s,
    width:capsuleWidth(stage.end-stage.start+1),height:4.5,
    stages:1,selected:false,
   });
  }
  // Keep the current stage and its neighbourhood; compress the far future
  // first, then the far past. Never hide the selected checkpoint.
  let attempts=0;
  while(spanWidth(drafts)>width-2*EDGE&&drafts.length>1&&attempts++<500){
   let pair=-1;
   for(let i=drafts.length-2;i>=0;i--)
    if(drafts[i].kind==='stage'&&drafts[i+1].kind==='stage'&&
      drafts[i].stageIndex>activeStage){pair=i;break;}
   if(pair<0)for(let i=0;i<drafts.length-1;i++)
    if(drafts[i].kind==='stage'&&drafts[i+1].kind==='stage'){pair=i;break;}
   if(pair>=0){
    const a=drafts[pair],b=drafts[pair+1];
    const checkpointCount=stages.slice(a.stageIndex,b.stageEnd+1)
     .reduce((sum,stage)=>sum+stage.end-stage.start+1,0);
    drafts.splice(pair,2,{kind:'stage',index:a.index,stageIndex:a.stageIndex,
     stageEnd:b.stageEnd,width:capsuleWidth(checkpointCount),height:4.5,
     stages:a.stages+b.stages,selected:false});
    continue;
   }
   const stationChoices=drafts.map((mark,i)=>({mark,i}))
    .filter(v=>v.mark.kind==='station'&&!v.mark.selected)
    .sort((a,b)=>Math.abs(b.mark.index-selected)-Math.abs(a.mark.index-selected));
   if(!stationChoices.length)break;
   drafts.splice(stationChoices[0].i,1);
  }
 }
 if(drafts.length===1)return {mode:plain?'plain':'folded',activeStage,
  marks:[{...drafts[0],x:width/2}]};
 const available=Math.max(0,width-2*EDGE);
 const required=spanWidth(drafts);
 const extra=Math.max(0,available-required);
 const activeGaps=drafts.slice(1).map((m,i)=>m.kind==='station'&&drafts[i].kind==='station'&&
  m.stageIndex===activeStage&&drafts[i].stageIndex===activeStage);
 const activeCount=activeGaps.filter(Boolean).length;
 const activeWidth=drafts.filter(m=>m.kind==='station'&&m.stageIndex===activeStage)
  .reduce((sum,m)=>sum+m.width,0)+activeCount*CLEARANCE;
 const desiredActive=Math.min(width*.56,26*Math.max(1,activeCount+1));
 const activeExtra=activeCount?Math.min(extra,Math.max(0,desiredActive-activeWidth)):0;
 const otherGaps=activeGaps.length-activeCount;
 const marks:RouteMark[]=[];
 let cursor=EDGE+(plain?0:Math.max(0,available-required-extra)/2);
 for(let i=0;i<drafts.length;i++){
  const mark=drafts[i];
  marks.push({...mark,x:cursor+mark.width/2});
  cursor+=mark.width;
  if(i<drafts.length-1){
   const bonus=activeGaps[i]?activeExtra/Math.max(1,activeCount):
    (extra-activeExtra)/Math.max(1,otherGaps);
   cursor+=CLEARANCE+bonus;
  }
 }
 return {mode:plain?'plain':'folded',marks,activeStage};
}
