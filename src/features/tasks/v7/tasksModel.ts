import type {TaskRecord,TaskStatus} from '../../../data/tasks/contract';

/** PLAN §6.6. Pure grouping, filtering and wording for the Tasks screen. Days are civil YYYY-MM-DD strings in the owner's zone. */
export type Segment='To do'|'Doing'|'Done';
export const segments:readonly Segment[]=['To do','Doing','Done'];
export const segmentOf=(status:TaskStatus):Segment=>status==='backlog'?'To do':status==='in_progress'?'Doing':'Done';
export type Bucket='overdue'|'today'|'week'|'later'|'none';
export const bucketLabels:Readonly<Record<Bucket,string>>={overdue:'Overdue',today:'Today',week:'This week',later:'Later',none:'No date'};
const bucketOrder:readonly Bucket[]=['overdue','today','week','later','none'];
const ordinal=(day:string)=>{const [y,m,d]=day.slice(0,10).split('-').map(Number);return Date.UTC(y,m-1,d)/86_400_000;};
export const civilDay=(at:Date|string,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(typeof at==='string'?new Date(at):at);

/** The civil day a task is due, or null. An instant is read in the owner's zone. */
export function dueDay(task:Pick<TaskRecord,'due'>,zone:string):string|null{
 if(task.due.kind==='date')return task.due.date;
 if(task.due.kind==='instant'){const at=new Date(task.due.at);return Number.isNaN(at.getTime())?null:civilDay(at,zone);}
 return null;
}
const open=(task:Pick<TaskRecord,'status'>)=>task.status!=='completed'&&task.status!=='cancelled';
/** Past its day (or its instant has passed); done and cancelled tasks are never overdue. */
export function isOverdue(task:Pick<TaskRecord,'status'|'due'>,now:Date,zone:string):boolean{
 if(!open(task))return false;
 if(task.due.kind==='instant')return Date.parse(task.due.at)<now.getTime();
 const day=dueDay(task,zone);
 return day!==null&&day<civilDay(now,zone);
}
export function bucketOf(task:Pick<TaskRecord,'status'|'due'>,now:Date,zone:string):Bucket{
 if(isOverdue(task,now,zone))return 'overdue';
 const day=dueDay(task,zone);
 if(day===null)return 'none';
 const offset=ordinal(day)-ordinal(civilDay(now,zone));
 return offset<=0?'today':offset<=6?'week':'later';
}
const byDue=(zone:string)=>(a:TaskRecord,b:TaskRecord)=>{
 const x=dueDay(a,zone)??'9999-12-31',y=dueDay(b,zone)??'9999-12-31';
 return x.localeCompare(y)||a.position-b.position||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
};
export interface TaskGroup{key:Bucket|'all';label:string;items:TaskRecord[]}
/** To do: Overdue, Today, This week, Later, No date. Empty groups are left out; overdue always leads. */
export function groupTodo(tasks:readonly TaskRecord[],now:Date,zone:string):TaskGroup[]{
 // B3/TK1: an overdue task stays in the Overdue group even once started, so the group heading, the Overdue filter and the
 // shared overdue count (Today, Calendar) agree.
 const mine=tasks.filter(task=>task.status==='backlog'||(task.status==='in_progress'&&isOverdue(task,now,zone)));
 return bucketOrder.flatMap(key=>{
  const items=mine.filter(task=>bucketOf(task,now,zone)===key).sort((a,b)=>a.position-b.position||byDue(zone)(a,b));
  return items.length?[{key,label:bucketLabels[key],items}]:[];
 });
}
/** A drag and the row menu use the same persisted order within a due group. */
export function reorderedTasks(list:readonly TaskRecord[],from:string,to:string):TaskRecord[]{
 const source=list.findIndex(task=>task.id===from),target=list.findIndex(task=>task.id===to);
 if(source<0||target<0||source===target)return [...list];
 const next=[...list],removed=next.splice(source,1)[0];next.splice(target,0,removed);
 return next;
}
export interface TaskFilter{projectId:string|null;overdueOnly:boolean;highOnly:boolean}
export const noFilter:TaskFilter={projectId:null,overdueOnly:false,highOnly:false};
export function applyFilter(tasks:readonly TaskRecord[],filter:TaskFilter,now:Date,zone:string):TaskRecord[]{
 return tasks.filter(task=>(!filter.projectId||task.projectId===filter.projectId)&&(!filter.highOnly||task.priority==='high')&&(!filter.overdueOnly||isOverdue(task,now,zone)));
}
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const weekday=(day:string)=>new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short'}).format(new Date(ordinal(day)*86_400_000+43_200_000));
/** "Today", "Tomorrow", "Fri" within a week, otherwise "Fri 13 Nov". Day-first on purpose, independent of the browser locale. */
export function dayWord(day:string,now:Date,zone:string):string{
 const offset=ordinal(day)-ordinal(civilDay(now,zone));
 if(offset===0)return 'Today';
 if(offset===1)return 'Tomorrow';
 if(offset===-1)return 'Yesterday';
 const [,m,d]=day.split('-').map(Number);
 return Math.abs(offset)<=6?weekday(day):weekday(day)+' '+d+' '+months[m-1];
}
export type DueTone='overdue'|'today'|'later'|'none';
export function dueChip(task:Pick<TaskRecord,'status'|'due'>,now:Date,zone:string):{text:string;tone:DueTone}|null{
 const day=dueDay(task,zone);
 if(day===null)return null;
 if(isOverdue(task,now,zone)){const word=weekday(day);return {text:'Overdue · '+word,tone:'overdue'};}
 const text=dayWord(day,now,zone);
 return {text,tone:text==='Today'?'today':'later'};
}
/** Whole-row swipe: right completes, left reveals actions, anything short of the threshold does nothing. */
export function swipeIntent(dx:number,dy:number,threshold=96):'complete'|'reveal'|null{
 if(Math.abs(dy)>Math.abs(dx))return null;
 return dx>=threshold?'complete':dx<=-threshold?'reveal':null;
}
export const estimateText=(minutes:number|null)=>minutes===null||minutes<=0?null:minutes>=60?(Math.floor(minutes/60)+' h'+(minutes%60?' '+minutes%60+' min':'')):minutes+' min';
