import type {CheckpointView} from '../data/types'

const DAY=86_400_000
export type ScheduleState='early'|'on_time'|'late'|'future'|'unscheduled'
export interface ScheduledCheckpoint {
 checkpoint:CheckpointView
 dueOn:string|null
 inferred:boolean
 state:ScheduleState
 /** Positive = days behind the planned date; negative = days ahead. */
 deltaDays:number|null
 /** Completion date for demonstrated checkpoints, projection for the current one. */
 actualOn:string|null
 projected:boolean
}
export interface ScheduleOptions {
 targetDate?:string|null
 now?:Date
 /** Checkpoints demonstrated per week over the last 28 days. */
 pacePerWeek?:number
}
function dayNumber(date:string|null|undefined):number|null {
 if(!date||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(date))return null
 const value=Date.parse(date.slice(0,10)+'T00:00:00Z')
 return Number.isFinite(value)?Math.floor(value/DAY):null
}
function localDay(now:Date):number {
 return Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/DAY)
}
function dayIso(day:number):string{return new Date(day*DAY).toISOString().slice(0,10)}
function isFinished(cp:CheckpointView){return cp.ui==='done'||cp.ui==='revisit'}
function isPending(cp:CheckpointView){return !isFinished(cp)&&cp.ui!=='proposed'}
function stepWeight(cp:CheckpointView):number{return Math.max(1,cp.stepsTotal||1)}

/** Calendar-day scheduling, independent of timezone and daylight-saving transitions.
 * Explicit due dates are authoritative; only unfinished checkpoints without dates
 * are spread by step count between today and the project's target date.
 */
export function buildSchedule(checkpoints:readonly CheckpointView[],options:ScheduleOptions={}):ScheduledCheckpoint[]{
 const today=localDay(options.now??new Date())
 const target=dayNumber(options.targetDate)
 const pending=checkpoints.filter(isPending)
 const remainingWeight=pending.reduce((sum,cp)=>sum+stepWeight(cp),0)
 let weightSoFar=0
 const pace=Math.max(.25,options.pacePerWeek??.25)
 return checkpoints.map(cp=>{
  const finished=isFinished(cp)
  if(isPending(cp))weightSoFar+=stepWeight(cp)
  const explicit=dayNumber(cp.dueOn)
  const inferred=explicit===null&&target!==null&&isPending(cp)
  const due=explicit??(inferred?today+Math.round((target!-today)*weightSoFar/Math.max(1,remainingWeight)):null)
  let actual:number|null=null
  let projected=false
  if(finished)actual=dayNumber(cp.demonstratedAt)
  else if(cp.ui==='now'&&due!==null){
   const remainingSteps=Math.max(1,cp.stepsTotal-Math.max(0,cp.currentStep-1))
   actual=today+Math.ceil(7*remainingSteps/stepWeight(cp)/pace)
   projected=true
  }
  const delta=due!==null&&actual!==null?actual-due:null
  let state:ScheduleState='unscheduled'
  if(due!==null){
   if(delta!==null)state=delta>=3?'late':delta<=-3?'early':'on_time'
   else if(isPending(cp))state=due<today?'late':'future'
  }
  return {checkpoint:cp,dueOn:due===null?null:dayIso(due),inferred,state,
   deltaDays:delta,actualOn:actual===null?null:dayIso(actual),projected}
 })
}
export function scheduleHeadline(rows:readonly ScheduledCheckpoint[]):string|null{
 const current=rows.find(row=>row.checkpoint.ui==='now'&&row.dueOn)
 if(current){
  const delta=current.deltaDays
  if(delta===null)return null
  if(delta>=3)return delta+' days behind'
  if(delta<=-3)return Math.abs(delta)+' days ahead'
  return 'On schedule'
 }
 const overdue=rows.filter(row=>row.state==='late'&&row.checkpoint.ui!=='proposed')
 if(overdue.length)return 'Behind schedule'
 return rows.some(row=>row.dueOn)?'On schedule':null
}
export function scheduleDate(date:string):string{
 const day=dayNumber(date)
 if(day===null)return date
 return new Date(day*DAY).toLocaleDateString('en',{day:'numeric',month:'short',timeZone:'UTC'})
}
export function scheduleDetail(row:ScheduledCheckpoint):string|null{
 if(!row.dueOn)return null
 const prefix='Planned '+scheduleDate(row.dueOn)
 if(!row.actualOn)return prefix
 const delta=row.deltaDays??0
 const suffix=Math.abs(delta)+' days '+(delta<0?'early':'late')
 return prefix+', '+(row.projected?'expected ':'done ')+scheduleDate(row.actualOn)+
  ': '+(Math.abs(delta)<=2?'on time':suffix)
}
/** Shared pace estimate used by both the project Metro and checkpoint sheet. */
export function paceFromDemonstrations(events:readonly {projectId:string;checkpointCode:string;kind:string;at:string}[],
 projectId:string,now=Date.now()):number{
 const since=now-28*DAY
 const completed=new Set(events.filter(event=>event.projectId===projectId&&event.kind==='demonstrated'
  &&Date.parse(event.at)>=since&&Date.parse(event.at)<=now).map(event=>event.checkpointCode))
 return Math.max(1,completed.size)/4
}
export const scheduleColor:Record<ScheduleState,string>={
 early:'var(--good)',on_time:'var(--accent)',late:'var(--bad, var(--again))',
 future:'var(--ink-3)',unscheduled:'var(--line)'
}
