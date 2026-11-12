import {useEffect,useState} from 'react';
import type {TaskRecord} from '../../../data/tasks/contract';
import {readTasks} from '../../planner/readTasks';
import {deadlineDay,type CalendarDues} from '../deadlines/DueDayItems';
import {loadCalendarDues} from '../deadlines/load';
import {dayKey} from '../model';
import {isOverdue} from '../../tasks/v7/tasksModel';

/** B3 (Night critique v2) and v7 PLAN §6.2 item 6: the one overdue count every screen reads — open tasks past their due day
 *  or instant, open deadlines past their day, and practice topics past their next due date, counted together. */
export interface OverdueSummary{tasks:number;deadlines:number;topics:number;total:number}
export const noOverdue:OverdueSummary={tasks:0,deadlines:0,topics:0,total:0};
export function overdueSummary(input:{tasks:readonly Pick<TaskRecord,'status'|'due'>[];dues:CalendarDues},zone:string,now:Date=new Date()):OverdueSummary{
 const today=dayKey(now,zone);
 const tasks=input.tasks.filter(task=>isOverdue(task,now,zone)).length;
 const deadlines=input.dues.deadlines.filter(row=>row.status==='open'&&deadlineDay(row,zone)<today).length;
 const topics=input.dues.topics.filter(row=>row.archivedAt===null&&row.nextDueDate!==null&&row.nextDueDate<today).length;
 return {tasks,deadlines,topics,total:tasks+deadlines+topics};
}
export async function loadOverdueSummary(zone:string,now:Date=new Date()):Promise<OverdueSummary>{
 const [dues,tasks]=await Promise.all([loadCalendarDues(),readTasks()]);
 return overdueSummary({tasks,dues},zone,now);
}
export function useOverdueSummary(zone:string,version:unknown=0):OverdueSummary{
 const [value,setValue]=useState(noOverdue);
 useEffect(()=>{let live=true;void loadOverdueSummary(zone).then(next=>{if(live)setValue(next);}).catch(()=>{});return()=>{live=false;};},[zone,version]);
 return value;
}
