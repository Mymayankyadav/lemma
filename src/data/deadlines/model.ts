import {DeadlineError,type DeadlineKind,type DeadlineStatus,type DeadlineDue,type EstimateSource,
 type NewDeadline,type DeadlinePatch} from './contract';
const fail=(message:string):never=>{throw new DeadlineError('invalid',message)};
const kinds:DeadlineKind[]=['exam','seminar','assignment','milestone','other'];
const sources:EstimateSource[]=['owner','derived'];
/** A civil due date stays a date; a due instant requires an explicit timezone offset. */
export function validateDue(due:DeadlineDue):DeadlineDue{
 if(!due||typeof due!=='object')fail('A deadline must have one due value');
 if(due.kind==='date'){
  if(typeof due.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(due.date)||
   new Date(due.date+'T00:00:00Z').toISOString().slice(0,10)!==due.date)
   fail('Invalid civil due date');
  if('at' in due)fail('Due date and due instant are exclusive');
  return {kind:'date',date:due.date};
 }
 if(due.kind==='instant'){
  if(typeof due.at!=='string'||!/([zZ]|[+-]\d{2}:\d{2})$/.test(due.at)||
   !Number.isFinite(Date.parse(due.at)))fail('Due instant requires an ISO offset');
  if('date' in due)fail('Due date and due instant are exclusive');
  return {kind:'instant',at:new Date(due.at).toISOString()};
 }
 return fail('Unknown due kind');
}
export function validateDeadline(input:NewDeadline):NewDeadline{
 if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>200)
  fail('Deadline title must contain 1–200 characters');
 if(!kinds.includes(input.kind))fail('Invalid deadline kind');
 const due=validateDue(input.due);
 if(input.remainingMinutes!==undefined&&input.remainingMinutes!==null&&
   (!Number.isInteger(input.remainingMinutes)||input.remainingMinutes<0||input.remainingMinutes>1000000))
  fail('Remaining minutes must be a bounded whole number');
 if(input.estimateSource!==undefined&&input.estimateSource!==null&&
   !sources.includes(input.estimateSource))fail('Invalid estimate source');
 if(input.remainingMinutes!=null&&input.estimateSource==null)
  fail('An estimate must have a provenance');
 for(const key of ['subjectId','projectId','checkpointId'] as const){
  const value=input[key];
  if(value!==undefined&&value!==null&&(typeof value!=='string'||!value.trim()))
   fail('Invalid linked record ID');
 }
 return {...input,title:input.title.trim(),due};
}
export function validateDeadlinePatch(patch:DeadlinePatch):DeadlinePatch{
 if(!patch||typeof patch!=='object'||Array.isArray(patch))fail('Invalid deadline patch');
 // Reuse the create validator with unchanged fields supplied by caller at update.
 const allowed=new Set(['title','kind','due','remainingMinutes','estimateSource','subjectId','projectId','checkpointId']);
 if(Object.keys(patch).some(k=>!allowed.has(k)))fail('Unknown deadline patch field');
 if(patch.title!==undefined&&(typeof patch.title!=='string'||!patch.title.trim()||patch.title.trim().length>200))
  fail('Invalid deadline title');
 if(patch.kind!==undefined&&!kinds.includes(patch.kind))fail('Invalid deadline kind');
 if(patch.due!==undefined)validateDue(patch.due);
 if(patch.remainingMinutes!==undefined&&patch.remainingMinutes!==null&&
   (!Number.isInteger(patch.remainingMinutes)||patch.remainingMinutes<0||patch.remainingMinutes>1000000))
  fail('Invalid remaining minutes');
 if(patch.estimateSource!==undefined&&patch.estimateSource!==null&&!sources.includes(patch.estimateSource))
  fail('Invalid estimate source');
 return {...patch,...(patch.title!==undefined?{title:patch.title.trim()}:{}),
  ...(patch.due!==undefined?{due:validateDue(patch.due)}:{})};
}
/** Reject invalid status transitions instead of silently accepting stale states. */
export function nextDeadlineStatus(status:DeadlineStatus,op:'complete'|'reopen'|'cancel'|'restore'):DeadlineStatus{
 if(op==='complete'&&status==='open')return 'done';
 if(op==='reopen'&&status==='done')return 'open';
 if(op==='cancel'&&status==='open')return 'cancelled';
 if(op==='restore'&&status==='cancelled')return 'open';
 return fail('Invalid deadline lifecycle transition');
}
