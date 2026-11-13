import type {StudyApi} from '../../../data/study/contract';
import type {TaskApi} from '../../../data/tasks/contract';
import {calendarRange} from '../model';
import {validatePlannerWindow} from '../../planner/selection';
import type {Suggestions} from './suggestions';

/** A grid suggestion is one calendar command, like Quick add. It must not commit the whole day plan: that would
 * prevent accepting the next suggestion on the same day. Check the captured task and current occupancy first. */
export async function acceptSuggestion(data:Suggestions,id:string,date:string,zone:string,study:StudyApi,tasks:TaskApi){
 const place=data.result.placements.find(item=>item.taskId+':'+item.part===id);
 if(!place)throw new Error('This suggestion changed. Refresh the calendar.');
 const captured=data.tasks.find(task=>task.id===place.taskId),current=await tasks.getTask(place.taskId);
 if(!captured||!current||current.version!==captured.version||!['backlog','in_progress'].includes(current.status))
  throw new Error('Task changed since this suggestion. Refresh the calendar.');
 const range=calendarRange(date,zone),[blocks,entries]=await Promise.all([study.listCalendarBlocks(range),study.listStudyEntries(range)]);
 // A retry after a lost acknowledgement must not make the same task/time block twice.
 const existing=blocks.find(block=>block.status!=='cancelled'&&block.kind==='study'&&block.taskId===place.taskId&&
  Date.parse(block.startsAt)===Date.parse(place.start)&&Date.parse(block.endsAt)===Date.parse(place.end));
 if(existing)return {record:existing,created:false};
 const focus=entries.filter(entry=>entry.status==='saved').flatMap(entry=>entry.intervals.filter(item=>item.kind==='focus'&&item.end!==null)
  .map(item=>({startsAt:item.start,endsAt:item.end!,status:'done'})));
 validatePlannerWindow([place],[...blocks,...focus],date,date,zone);
 const receipt=await study.createCalendarBlock({kind:'study',title:current.title,startsAt:place.start,endsAt:place.end,timeZone:zone,taskId:place.taskId});
 return {record:receipt.record,created:true};
}
