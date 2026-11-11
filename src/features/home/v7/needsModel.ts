import type {PracticeTopicRecord} from '../../../data/practice-topics/contract';
import type {PresetRecord} from '../../../data/presets/contract';
import type {TaskRecord} from '../../../data/tasks/contract';
import {dueDay} from '../../tasks/v7/tasksModel';

/** PLAN §6.2 targets and "Needs you", and the §6.3 start sheet cards. Pure, so each rule is testable from data. */
export interface TargetRow{key:'focus'|'reviews'|'practice';label:string;value:number;max:number}
const rank:Record<string,number>={high:0,normal:1,low:2};
/** Focus against the daily minimum, Reviews answered against answered plus due, Practice done against done plus due. Zero targets are left out. */
export function targetRows(input:{focus:number;focusGoal:number;answered:number;reviewsDue:number;practiceDone:number;practiceDue:number}):TargetRow[]{
 const rows:TargetRow[]=[];
 if(input.focusGoal>0)rows.push({key:'focus',label:'Focus',value:input.focus,max:input.focusGoal});
 const reviews=input.answered+input.reviewsDue;
 if(reviews>0)rows.push({key:'reviews',label:'Reviews',value:input.answered,max:reviews});
 const practice=input.practiceDone+input.practiceDue;
 if(practice>0)rows.push({key:'practice',label:'Practice',value:input.practiceDone,max:practice});
 return rows;
}
export const targetDone=(row:TargetRow)=>row.value>=row.max;
/** Open tasks due today (not earlier: those are overdue), most urgent first. */
export function tasksDueToday(tasks:readonly TaskRecord[],day:string,zone:string):TaskRecord[]{
 return tasks.filter(task=>(task.status==='backlog'||task.status==='in_progress')&&dueDay(task,zone)===day)
  .sort((a,b)=>(rank[a.priority]??1)-(rank[b.priority]??1)||a.position-b.position||a.id.localeCompare(b.id));
}
/** Topics due on the day, and how many were practised on it (`lastPracticedAt` reads in the owner's zone). */
export function practiceToday(topics:readonly PracticeTopicRecord[],day:string,zone:string){
 const active=topics.filter(topic=>topic.archivedAt===null);
 const civil=(instant:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(new Date(instant));
 return {
  due:active.filter(topic=>topic.nextDueDate!==null&&topic.nextDueDate===day),
  done:active.filter(topic=>topic.lastPracticedAt!==null&&civil(topic.lastPracticedAt)===day).length,
 };
}
export type NeedRow={kind:'review';count:number}|{kind:'task';task:TaskRecord}|{kind:'practice';topic:PracticeTopicRecord}|{kind:'overdue';count:number};
/** At most `cap` rows with the rest counted for "Show all (n)". Order: overdue, review, tasks, practice. */
export function needsRows(input:{due:number;tasks:readonly TaskRecord[];topics:readonly PracticeTopicRecord[];overdue:number},cap=4,all=false){
 const rows:NeedRow[]=[];
 if(input.overdue>0)rows.push({kind:'overdue',count:input.overdue});
 if(input.due>0)rows.push({kind:'review',count:input.due});
 for(const task of input.tasks)rows.push({kind:'task',task});
 for(const topic of input.topics)rows.push({kind:'practice',topic});
 return {rows:all?rows:rows.slice(0,cap),hidden:all?0:Math.max(0,rows.length-cap),total:rows.length};
}
/** "Pomodoro · 25 / 5 × 4", "Flowtime", "Open". */
export function presetLine(preset:Pick<PresetRecord,'mode'|'focusMinutes'|'breakMinutes'|'cycles'>):string{
 if(preset.mode==='pomodoro')return 'Pomodoro · '+preset.focusMinutes+' / '+preset.breakMinutes+' × '+preset.cycles;
 return preset.mode==='flowtime'?'Flowtime':'Open';
}
/** Close the day is offered from 17:00 in the owner's zone, unless it is already closed. */
export const offerClose=(hour:number,closed:boolean)=>!closed&&hour>=17;
