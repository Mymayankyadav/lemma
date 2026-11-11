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
