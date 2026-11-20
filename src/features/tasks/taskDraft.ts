import type {TaskDue,TaskPriority} from '../../data/tasks/contract';
import {localClockInstant,localWallParts} from '../time-log/local-time';

export interface TaskFormValues {
 title:string; estimate:string; priority:TaskPriority; dueKind:TaskDue['kind'];
 dueDate:string; dueInstant:string; subjectId:string; projectId:string;
}
/** The capture sheet hands over local wall fields *and* the zone used to parse them. */
export interface CapturedTaskDraft {values:TaskFormValues;zone:string}

/** Browser history is input, not a typed or trusted source. Unknown drafts act like plain New task. */
export function readCapturedTaskDraft(state:unknown):CapturedTaskDraft|undefined{
 if(!state||typeof state!=='object'||!('captureTaskDraft' in state))return;
 const d=state.captureTaskDraft as Partial<CapturedTaskDraft>|null;
 if(!d||typeof d.zone!=='string'||!d.values||typeof d.values!=='object')return;
 const v=d.values;
 if(typeof v.title!=='string'||typeof v.estimate!=='string'||typeof v.dueDate!=='string'||
    typeof v.dueInstant!=='string'||typeof v.subjectId!=='string'||typeof v.projectId!=='string'||
    !['low','normal','high'].includes(v.priority)||!['none','date','instant'].includes(v.dueKind))return;
 try{new Intl.DateTimeFormat('en',{timeZone:d.zone});}catch{return;}
 return {zone:d.zone,values:v};
}

export function taskInput(values:TaskFormValues,zone=Intl.DateTimeFormat().resolvedOptions().timeZone,originalInstant?:string) {
  const title=values.title.trim();
  if (!title) throw new Error('Enter a task title.');
  if (title.length>200) throw new Error('Task title must be 200 characters or fewer.');
  const raw=values.estimate.trim();
  if (raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)>2147483647))
    throw new Error('Estimate must be whole minutes, 0 or more.');
  if (!['low','normal','high'].includes(values.priority)) throw new Error('Choose a priority.');
  let due:TaskDue={kind:'none'};
  if (values.dueKind==='date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dueDate) ||
        !Number.isFinite(Date.parse(values.dueDate))) throw new Error('Choose a valid due date.');
    const [y,m,d]=values.dueDate.split('-').map(Number);
    const date=new Date(Date.UTC(y,m-1,d));
    if (date.getUTCFullYear()!==y || date.getUTCMonth()+1!==m || date.getUTCDate()!==d)
      throw new Error('Choose a valid due date.');
    due={kind:'date',date:values.dueDate};
  } else if (values.dueKind==='instant') {
    const at=localClockInstant(values.dueInstant.slice(0,10),values.dueInstant.slice(11),zone);
    if (!at) throw new Error('Choose a valid local date and time.');
    // Editing a title must not move an existing instant from the second occurrence of a DST fold to the first.
    const original=originalInstant?localWallParts(originalInstant,zone):null;
    due={kind:'instant',at:originalInstant&&original&&original.day+'T'+original.clock===values.dueInstant?originalInstant:at};
  } else if (values.dueKind!=='none') throw new Error('Choose a due type.');
  return {
    title,estimateMinutes:raw?Number(raw):null,priority:values.priority,due,
    subjectId:values.subjectId||null,projectId:values.projectId||null,
  };
}
