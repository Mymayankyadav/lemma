import type {CheckpointView} from '../../data/types'
import type {ScheduledCheckpoint,ScheduleState} from '../../lib/schedule'
import {paceFromDemonstrations} from '../../lib/schedule'

export interface ProgressStage {
 key:string; name:string; start:number; end:number; checkpoints:CheckpointView[]
}

/** A tutor may omit stages. Neutral groups of eight preserve the actual plan order. */
export function groupCheckpointStages(checkpoints:readonly CheckpointView[]):ProgressStage[]{
 const stages:ProgressStage[]=[]
 for(let i=0;i<checkpoints.length;i++){
  const cp=checkpoints[i],explicit=cp.stage?.trim()
  const last=stages.at(-1)
  if(explicit&&last?.name===explicit&&last.end===i-1){
   last.checkpoints.push(cp);last.end=i
  }else if(!explicit&&last&&!last.checkpoints[0].stage?.trim()&&last.checkpoints.length<8){
   last.checkpoints.push(cp);last.end=i
   last.name=last.checkpoints[0].code+'–'+cp.code
  }else{
   stages.push({key:(explicit??'auto')+':'+i,name:explicit||cp.code+'–'+cp.code,
    start:i,end:i,checkpoints:[cp]})
  }
 }
 return stages
}

export function currentCheckpointIndex(checkpoints:readonly CheckpointView[]):number{
 const now=checkpoints.findIndex(cp=>cp.ui==='now')
 if(now>=0)return now
 const revisit=checkpoints.findIndex(cp=>cp.ui==='revisit')
 if(revisit>=0)return revisit
 const next=checkpoints.findIndex(cp=>cp.ui==='next')
 return Math.max(0,next)
}

/** Stage colour denotes the least favourable scheduled checkpoint, not an average. */
export function worstStageSchedule(rows:readonly ScheduledCheckpoint[]):ScheduleState{
 if(rows.some(row=>row.state==='late'))return 'late'
 if(rows.some(row=>row.state==='on_time'))return 'on_time'
 if(rows.some(row=>row.state==='future'))return 'future'
 if(rows.some(row=>row.state==='early'))return 'early'
 return 'unscheduled'
}

const DAY=86_400_000
export interface CompletionEvent {projectId:string;checkpointCode:string;kind:string;at:string}
export interface FinishEstimate {pace:number|null;finish:Date|null;source:'plan'|'measured'|'none';spare:number|null}

/** A fresh plan predicts from its own dates, never the arbitrary .25/wk fallback.
 * Measured pace begins only after 28 calendar days of actual observations.
 */
export function estimateFinish(input:{
 projectId:string;done:number;total:number;targetDate?:string|null
 dueDates?:readonly (string|null|undefined)[];events?:readonly CompletionEvent[];now?:number
}):FinishEstimate{
 const {projectId,done,total,targetDate,dueDates=[],events=[],now=Date.now()}=input
 const remaining=Math.max(0,total-done)
 const observations=events.filter(event=>event.projectId===projectId&&event.kind==='demonstrated'&&
  Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=now)
 const hasHistory=observations.some(event=>Date.parse(event.at)<=now-28*DAY)
 const targetMs=(date:string|null|undefined)=>date&&/^\d{4}-\d{2}-\d{2}/.test(date)
  ?Date.parse(date.slice(0,10)+'T12:00:00Z'):NaN
 if(hasHistory){
  const pace=paceFromDemonstrations(events,projectId,now)
  const finish=new Date(now+remaining/pace*7*DAY)
  const target=targetMs(targetDate)
  return {pace,finish,source:'measured',spare:Number.isFinite(target)?Math.floor((target-finish.getTime())/DAY):null}
 }
 const dates=dueDates.map(date=>targetMs(date)).filter((value):value is number=>Number.isFinite(value))
 const target=targetMs(targetDate)
 const planEnd=dates.length?Math.max(...dates):target
 if(Number.isFinite(planEnd)&&planEnd>now){
  const pace=remaining>0?Math.max(.01,remaining*7*DAY/(planEnd-now)):0
  return {pace,finish:new Date(planEnd),source:'plan',spare:Number.isFinite(target)?Math.floor((target-planEnd)/DAY):null}
 }
 if(remaining===0)return {pace:0,finish:new Date(now),source:'plan',spare:null}
 return {pace:null,finish:null,source:'none',spare:null}
}
