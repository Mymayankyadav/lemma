import type {CalendarBlockKind,CalendarBlockStatus} from '../../../data/study/contract';

/** Transient history-state handoff between quick entry and the full create form, never URL fields. */
export interface CalendarBlockDraft {
 title:string;kind:CalendarBlockKind;startsAt:string;endsAt:string;zone:string;
 projectId:string|null;taskId:string|null;subjectId?:string|null;checkpointId?:string|null;status?:CalendarBlockStatus;
}
export function calendarBlockDraft(input:Omit<CalendarBlockDraft,'endsAt'> & {minutes:number}):CalendarBlockDraft{
 const {minutes,...fields}=input;
 return {...fields,projectId:fields.kind==='study'?fields.projectId:null,
  subjectId:fields.kind==='study'?fields.subjectId:null,checkpointId:fields.kind==='study'?fields.checkpointId:null,
  endsAt:new Date(Date.parse(fields.startsAt)+minutes*60_000).toISOString()};
}

export function readCalendarBlockDraft(state:unknown):CalendarBlockDraft|undefined{
 if(!state||typeof state!=='object'||!('calendarBlockDraft' in state))return;
 const draft=state.calendarBlockDraft;
 if(!draft||typeof draft!=='object')return;
 const d=draft as Partial<CalendarBlockDraft>;
 if(typeof d.title!=='string'||d.title.length>500||!['study','busy'].includes(d.kind??'')||
  typeof d.startsAt!=='string'||typeof d.endsAt!=='string'||typeof d.zone!=='string'||
  !Number.isFinite(Date.parse(d.startsAt))||!Number.isFinite(Date.parse(d.endsAt))||
  Date.parse(d.startsAt)>=Date.parse(d.endsAt)||
  !(d.projectId===null||typeof d.projectId==='string')||!(d.taskId===null||typeof d.taskId==='string')||
  !(d.subjectId==null||typeof d.subjectId==='string')||
  !(d.checkpointId==null||typeof d.checkpointId==='string')||
  (d.status!==undefined&&!['planned','done','cancelled'].includes(d.status)))return;
 try{new Intl.DateTimeFormat('en',{timeZone:d.zone});}catch{return;}
 return {...d,projectId:d.kind==='busy'?null:d.projectId,subjectId:d.kind==='busy'?null:d.subjectId,checkpointId:d.kind==='busy'?null:d.checkpointId} as CalendarBlockDraft;
}
