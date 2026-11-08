import {dayBounds,loggedMinutes,type StudyEntry as EffortEntry} from '../../lib/effort';
import type {GoalRecord} from '../../data/study-goals/contract';
import type {StudyEntryRecord,StudyRange} from '../../data/study/contract';
import {addDays} from './model';

/** Goal endDate is inclusive in its own IANA timezone, not in the device timezone. */
export function goalWindow(goal:GoalRecord):StudyRange{
 return {start:dayBounds(goal.startDate,goal.timeZone).start,
  end:dayBounds(addDays(goal.endDate,1),goal.timeZone).start};
}
/** A single StudyApi read can include the selected chart range and shown goal windows. */
export function encompassingRange(view:StudyRange,goals:GoalRecord[]):StudyRange{
 return goals.reduce((span,goal)=>{
  const window=goalWindow(goal);
  return {start:span.start<window.start?span.start:window.start,
   end:span.end>window.end?span.end:window.end};
 },view);
}
/** The same saved-focus, break-subtraction and interval-union engine as Progress. */
export function goalSavedMinutes(entries:StudyEntryRecord[],goal:GoalRecord,now:string):number{
 const exact=entries.filter(entry=>
  (goal.subjectId==null||entry.subjectId===goal.subjectId)&&
  (goal.projectId==null||entry.projectId===goal.projectId))
  .map((entry):EffortEntry=>({
   id:entry.id,status:entry.status,subjectId:entry.subjectId,
   intervals:entry.intervals.filter(i=>i.end!==null).map(i=>({
    kind:i.kind,start:i.start,end:i.end!,
   })),
  }));
 return loggedMinutes(exact,goalWindow(goal),goal.timeZone,now).minutes;
}
