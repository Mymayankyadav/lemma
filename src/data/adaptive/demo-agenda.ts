import { getApi } from '..'
import {demoCapacityOverrides} from './capacity-override'
import {localDay} from '../../features/home/v7/todayModel'
import { getStudyApi } from '../study'
import { getTaskApi } from '../tasks'
import { zonedInstant } from '../../platform/reminders'
import { ownerAgenda } from '../../../supabase/functions/_shared/agenda/host'
import type { TaskRecord } from '../tasks/contract'

export async function readDemoAgenda(){
  const now=new Date(),asOf=now.toISOString(),horizonEnd=new Date(+now+7*86400000).toISOString()
  const [{rows},settings,blocks,active]=await Promise.all([getApi().getAdaptiveData(now),getApi().getSettings(),
    getStudyApi().listCalendarBlocks({start:asOf,end:horizonEnd}),getStudyApi().activeStudyEntry()])
  const tasks:TaskRecord[]=[]
  let cursor:string|null=null
  do{
    const page=await getTaskApi().listTasks({status:['backlog','in_progress'],limit:50,cursor})
    tasks.push(...page.items)
    cursor=page.nextCursor
  }while(cursor)
  function deadline(task:TaskRecord){
    if(task.due.kind==='instant') return task.due.at
    if(task.due.kind==='none') return null
    const next=new Date(Date.parse(task.due.date+'T00:00:00Z')+86400000).toISOString().slice(0,10)
    return new Date(zonedInstant(next,'00:00',settings.timeZone??'UTC')).toISOString()
  }
  const intervals=blocks.filter(b=>b.status==='planned').map(b=>({id:b.id,revision:b.version,startsAt:b.startsAt,endsAt:b.endsAt,
    projectId:b.projectId,kind:b.kind,taskId:b.taskId}))
  const available=intervals.filter(b=>b.kind==='study'),watermark='demo/'+asOf
  const day=localDay(settings.timeZone??'UTC',now),minutes=demoCapacityOverrides()[day]
  const nextStart=intervals.filter(b=>Date.parse(b.startsAt)>+now).map(b=>Date.parse(b.startsAt)).sort((a,b)=>a-b)[0]
  const end=Math.min(+now+minutes*60_000,nextStart??Infinity)
  const extra=minutes>0&&end>+now&&!available.some(b=>Date.parse(b.startsAt)<=+now)
    ? [{id:'capacity/'+day,revision:1,startsAt:asOf,endsAt:new Date(end).toISOString()}] : []
  const windows=[...extra,...available]
  const {decision,label,baselineLabel,practice}=ownerAgenda('demo',{asOf,watermark,rows:{...rows,settings:{...rows.settings,scheduling_algorithm:settings.schedulingAlgorithm}},
    calendar:{asOf,watermark,horizonEnd,status:'ok',fixed:intervals.filter(b=>b.kind==='busy'),availability:windows.length?windows:null},
    occupied:!!active,tasks:tasks.map(t=>({id:t.id,title:t.title,project_id:t.projectId??null,estimate_minutes:t.estimateMinutes??null,
      deadline:deadline(t),priority:t.priority})),reservations:available.filter(b=>b.taskId).map(b=>({task_id:b.taskId!,starts_at:b.startsAt,ends_at:b.endsAt}))},true)
  return {decision,label,baselineLabel,practice}
}
