import type {CalendarBlockRecord} from '../../data/study/contract';
import type {PlannerTask} from './model';
import {getTaskApi,type TaskRecord} from '../../data/tasks';
/** Every open owner task (backlog and in progress), at most 500, with a guard against repeated cursors. */
export async function readTasks():Promise<TaskRecord[]>{
 const rows:TaskRecord[]=[];let cursor:string|null=null;
 const seen=new Set<string>();
 for(let i=0;i<10;i++){
  const page=await getTaskApi().listTasks({
   status:['backlog','in_progress'],limit:50,cursor});
  if(page.items.length>50||!Number.isSafeInteger(page.total)||page.total<0)
   throw new Error('Malformed owner task page');
  rows.push(...page.items);
  if(!page.nextCursor)return rows;
  if(seen.has(page.nextCursor))
   throw new Error('Repeated owner task cursor; refresh the planner');
  seen.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw new Error('Task list exceeds 500; narrow your task selection');
}

/** Both the Calendar banner and full planner use the same available task set. */
export function plannerCandidates(tasks:TaskRecord[],blocks:CalendarBlockRecord[],zeroIsUnestimated:boolean):PlannerTask[]{
 const scheduled=new Set(blocks.filter(block=>block.kind==='study'&&block.status!=='cancelled'&&block.taskId).map(block=>block.taskId));
 return tasks.filter(task=>!scheduled.has(task.id)).map(task=>({
  id:task.id,priority:task.priority,due:task.due,status:task.status,
  estimateMinutes:zeroIsUnestimated&&task.estimateMinutes===0?null:task.estimateMinutes,
 }));
}
