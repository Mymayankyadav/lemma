// Pure client-side validation shared by N64.2 demo and owner-RLS live adapters.
// The authoritative owner, related-record and optimistic checks happen in SQL.
import {LemmaError} from '../api';
import type {NewStudyEvent,StudyEventKind,StudyEventPatch,StudyEventQuery,
 StudyEventRelatedKind} from './contract';

const kinds:readonly StudyEventKind[]=['notice','drift','urge'];
const relatedKinds:readonly StudyEventRelatedKind[]=['task','calendar_block','study_entry'];
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const instantRe=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;
const writeFields=['entryId','kind','occurredAt','durationMinutes','note','relatedKind','relatedId'] as const;
const fail=(message:string):never=>{throw new LemmaError('invalid',message)};
function object(input:unknown):input is Record<string,unknown>{
 return input!==null&&typeof input==='object'&&!Array.isArray(input);
}
function only(input:Record<string,unknown>,allowed:readonly string[]):void{
 if(Object.keys(input).some(k=>!allowed.includes(k)))fail('Unknown study event field');
}
export function studyEventId(value:unknown):string{
 if(typeof value!=='string'||!uuidRe.test(value))return fail('Study event link must be a UUID');
 return value;
}
export function studyEventVersion(value:unknown):number{
 if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>2147483647)
  return fail('Expected a positive int4 event version');
 return value as number;
}
function leap(y:number):boolean{return y%4===0&&(y%100!==0||y%400===0)}
const days=[31,28,31,30,31,30,31,31,30,31,30,31];
/** PostgreSQL and browsers must agree: finite, real, explicitly zoned instants. */
export function studyEventInstant(value:unknown):string{
 if(typeof value!=='string')return fail('Event instant requires an ISO timezone');
 const m=instantRe.exec(value);
 if(!m)return fail('Event instant requires an ISO timezone');
 const [y,mo,d,h,mi,s]=m.slice(1,7).map(Number);
 const max=mo===2&&leap(y)?29:days[mo-1];
 if(y<1||mo<1||mo>12||d<1||d>max||h>23||mi>59||s>59)
  return fail('Invalid study event calendar instant');
 if(m[7]!=='Z'){
  const zh=Number(m[9]),zm=Number(m[10]);
  if(zh>14||zm>59||(zh===14&&zm!==0))
   return fail('Invalid study event timezone offset');
 }
 const stamp=Date.parse(value);
 if(!Number.isFinite(stamp))return fail('Invalid study event instant');
 return new Date(stamp).toISOString();
}
function eventKind(value:unknown):StudyEventKind{
 if(!kinds.includes(value as StudyEventKind))return fail('Unknown event kind');
 return value as StudyEventKind;
}
function minutes(value:unknown):number|null{
 if(value===null)return null;
 if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>100000)
  return fail('Drift minutes must be 1–100000 whole minutes');
 return value as number;
}
function note(value:unknown):string|null{
 if(value===null)return null;
 if(typeof value!=='string'||[...value].length>2000)
  return fail('Event note exceeds 2000 characters');
 return value;
}
function link(input:Record<string,unknown>):{relatedKind:StudyEventRelatedKind|null;relatedId:string|null}|null{
 const hasKind=Object.hasOwn(input,'relatedKind'),hasId=Object.hasOwn(input,'relatedId');
 if(!hasKind&&!hasId)return null;
 if(!hasKind||!hasId)return fail('Related kind and ID must be supplied together');
 if(input.relatedKind===null&&input.relatedId===null)return {relatedKind:null,relatedId:null};
 if(!relatedKinds.includes(input.relatedKind as StudyEventRelatedKind))
  return fail('Unknown related event kind');
 return {relatedKind:input.relatedKind as StudyEventRelatedKind,relatedId:studyEventId(input.relatedId)};
}
export function validateNewStudyEvent(input:NewStudyEvent):NewStudyEvent{
 if(!object(input))return fail('Event input must be an object');
 only(input,writeFields);
 const entryId=studyEventId(input.entryId),kind=eventKind(input.kind);
 const durationMinutes=input.durationMinutes===undefined?undefined:minutes(input.durationMinutes);
 if(kind!=='drift'&&durationMinutes!=null)return fail('Only drift events may carry minutes');
 const related=link(input);
 return {entryId,kind,
  ...(input.occurredAt!==undefined?{occurredAt:studyEventInstant(input.occurredAt)}:{}),
  ...(durationMinutes!==undefined?{durationMinutes}:{}),
  ...(input.note!==undefined?{note:note(input.note)}:{}),
  ...(related??{})};
}
export function validateStudyEventPatch(input:StudyEventPatch):StudyEventPatch{
 if(!object(input))return fail('Event patch must be an object');
 only(input,writeFields);
 if(Object.keys(input).length===0)return fail('Event patch must not be empty');
 const related=link(input);
 const out:StudyEventPatch={};
 if(input.entryId!==undefined)out.entryId=studyEventId(input.entryId);
 if(input.kind!==undefined)out.kind=eventKind(input.kind);
 if(input.occurredAt!==undefined)out.occurredAt=studyEventInstant(input.occurredAt);
 if(input.durationMinutes!==undefined)out.durationMinutes=minutes(input.durationMinutes);
 if(input.note!==undefined)out.note=note(input.note);
 if(related)Object.assign(out,related);
 if(input.kind!==undefined&&input.kind!=='drift'&&out.durationMinutes!=null)
  return fail('Only drift events may carry minutes');
 if(Object.keys(out).length===0)return fail('Event patch must not be empty');
 return out;
}
/** A partial edit is only valid if the resulting row still obeys drift semantics. */
export function applyStudyEventPatch(
 current:Pick<NewStudyEvent,'entryId'|'kind'|'durationMinutes'|'note'|'relatedKind'|'relatedId'>,
 patch:StudyEventPatch
):NewStudyEvent{
 const changes=validateStudyEventPatch(patch);
 const merged={...current,...changes};
 return validateNewStudyEvent(merged);
}
export function studyEventVoidedAt(
 current:string|null,action:'void'|'restore',now?:string
):string|null{
 if(action==='restore'){
  if(current===null)return fail('Event is not voided');
  return null;
 }
 if(action!=='void')return fail('Unknown event transition');
 if(current!==null)return fail('Event is already voided');
 if(now===undefined)return fail('Voiding requires an instant');
 return studyEventInstant(now);
}
export function validateStudyEventQuery(query:StudyEventQuery={}):Required<
 Pick<StudyEventQuery,'limit'|'includeVoided'>> & StudyEventQuery {
 if(!object(query))return fail('Event query must be an object');
 only(query,['entryId','kind','includeVoided','limit','cursor']);
 const limitRaw:unknown=query.limit;
 if(limitRaw!==undefined&&(typeof limitRaw!=='number'||!Number.isSafeInteger(limitRaw)||
  limitRaw<1||limitRaw>50))
  return fail('Event page limit must be 1–50');
 const limit=limitRaw===undefined?20:limitRaw as number;
 if(query.includeVoided!==undefined&&typeof query.includeVoided!=='boolean')
  return fail('Invalid voided filter');
 const entryId=query.entryId===undefined?undefined:studyEventId(query.entryId);
 let kind:StudyEventKind[]|undefined;
 if(query.kind!==undefined){
  if(!Array.isArray(query.kind)||!query.kind.length||
    new Set(query.kind).size!==query.kind.length||
    query.kind.some(k=>!kinds.includes(k)))
   return fail('Invalid event kind filter');
  kind=[...query.kind];
 }
 if(query.cursor!==undefined&&query.cursor!==null&&
  (typeof query.cursor!=='string'||!(/^[A-Za-z0-9_-]{8,1024}$/.test(query.cursor))))
  return fail('Invalid event cursor');
 return {limit,includeVoided:query.includeVoided??false,
  ...(entryId!==undefined?{entryId}:{}),...(kind?{kind}:{}),
  ...(query.cursor!==undefined?{cursor:query.cursor}:{})};
}
