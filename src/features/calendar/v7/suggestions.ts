import {getStudyApi} from '../../../data/study';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import type {TaskRecord} from '../../../data/tasks/contract';
import {planTaskPlacements,type PlannerResult} from '../../planner/model';
import {readTasks} from '../../planner/Sheet';
import {shiftDay} from '../model';
import {deviceBusyBlocks} from '../../../platform/calendar';

export interface Suggestions{result:PlannerResult;tasks:TaskRecord[];blocks:CalendarBlockRecord[];entries:StudyEntryRecord[]}
/** The same preview the v6 planner builds for one day, without opening a dialog. Read-only. */
export async function loadSuggestions(date:string,zone:string):Promise<Suggestions>{
 const tasks=await readTasks(),start=shiftDay(date,-2)+'T00:00:00Z',end=shiftDay(date,2)+'T00:00:00Z',api=getStudyApi();
 const [blocks,entries,busy]=await Promise.all([api.listCalendarBlocks({start,end}),api.listStudyEntries({start,end}),deviceBusyBlocks(start,end,zone)]);
 const scheduled=new Set(blocks.filter(block=>block.kind==='study'&&block.status!=='cancelled'&&block.taskId).map(block=>block.taskId));
 const result=planTaskPlacements({from:date,through:date,timeZone:zone,now:new Date().toISOString(),
  tasks:tasks.filter(task=>!scheduled.has(task.id)).map(task=>({id:task.id,priority:task.priority,due:task.due,estimateMinutes:task.estimateMinutes,status:task.status})),
  // N123: busy times from the phone's chosen calendars (opt-in, never stored) keep suggestions clear of meetings.
  blocks:[...blocks,...busy].map(block=>({id:block.id,startsAt:block.startsAt,endsAt:block.endsAt,kind:block.kind,status:block.status})),
  savedEntries:entries.map(entry=>({id:entry.id,status:entry.status,intervals:entry.intervals}))});
 return {result,tasks,blocks,entries};
}
