// N61.1: pure mirror of public.overlap_ack_* SQL constraints.
// Never accept a caller-supplied owner, provenance or version on writes.
import {OverlapError} from './contract';
import type {NewOverlapAcknowledgement,OverlapChoice,OverlapParticipant,
  OverlapPatch,OverlapQuery,ValidatedOverlap} from './contract';

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const INSTANT=/^(\d{4}-\d\d-\d\d)T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const INPUT_KEYS=['participants','startsAt','endsAt','reason','disposition','attributedTo'];
const QUERY_KEYS=['from','to','stale','limit','cursor'];
const bad=(message:string):never=>{throw new OverlapError('invalid',message)};

function object(value:unknown,description:string):Record<string,unknown>{
  if(value===null||typeof value!=='object'||Array.isArray(value))
    return bad(description+' must be an object');
  return value as Record<string,unknown>;
}
function allowFields(value:Record<string,unknown>,allowed:readonly string[]):void{
  for(const key of Object.keys(value))
    if(!allowed.includes(key))bad('Unexpected overlap field: '+key);
}
function id(value:unknown):string{
  if(typeof value!=='string'||!UUID.test(value))return bad('Expected a UUID');
  return value.toLowerCase();
}
function kind(value:unknown):'entry'|'block'{
  if(value!=='entry'&&value!=='block')return bad('Invalid overlap participant kind');
  return value;
}
function absoluteInstant(value:unknown):string{
  if(typeof value!=='string')return bad('Expected a timezone-aware ISO instant');
  const match=INSTANT.exec(value);
  if(!match||!Number.isFinite(Date.parse(value)))
    return bad('Expected a timezone-aware ISO instant');
  const midnight=new Date(match[1]+'T00:00:00Z');
  if(!Number.isFinite(midnight.getTime())||
     midnight.toISOString().slice(0,10)!==match[1])
    return bad('Invalid ISO calendar date');
  const hour=Number(value.slice(11,13)),minute=Number(value.slice(14,16)),
    second=Number(value.slice(17,19));
  if(hour>23||minute>59||second>59)return bad('Invalid ISO clock time');
  const offset=value.match(/[+-](\d\d):(\d\d)$/);
  if(offset&&(Number(offset[1])>23||Number(offset[2])>59))
    return bad('Invalid timezone offset');
  return new Date(value).toISOString();
}
export function validateParticipants(input:unknown):OverlapParticipant[]{
  if(!Array.isArray(input)||input.length<2||input.length>10)
    return bad('Provide between 2 and 10 participants');
  const seen=new Set<string>();
  return input.map(raw=>{
    const participant=object(raw,'Participant');
    allowFields(participant,['kind','id','version']);
    const who=kind(participant.kind),participantId=id(participant.id);
    const version=participant.version;
    if(typeof version!=='number'||!Number.isInteger(version)||
       version<1||version>2147483647)
      return bad('Participant version must be a positive int32');
    const identity=who+':'+participantId;
    if(seen.has(identity))return bad('Duplicate overlap participant');
    seen.add(identity);
    return {kind:who,id:participantId,version};
  });
}
function choice(value:unknown,participants:OverlapParticipant[]):OverlapChoice{
  const data=object(value,'Attributed participant');
  allowFields(data,['kind','id']);
  const result={kind:kind(data.kind),id:id(data.id)};
  if(!participants.some(p=>p.kind===result.kind&&p.id===result.id))
    return bad('Attribution must be to an acknowledged participant');
  return result;
}
export function validateNewOverlap(input:NewOverlapAcknowledgement):ValidatedOverlap{
  const data=object(input,'Overlap');
  allowFields(data,INPUT_KEYS);
  const participants=validateParticipants(data.participants);
  const startsAt=absoluteInstant(data.startsAt),endsAt=absoluteInstant(data.endsAt);
  if(Date.parse(startsAt)>=Date.parse(endsAt))
    return bad('Overlap end must follow start');
  const reason=data.reason===undefined||data.reason===null?null:data.reason;
  if(reason!==null&&(typeof reason!=='string'||[...reason].length>600))
    return bad('Reason exceeds 600 characters');
  const disposition=data.disposition;
  if(disposition!=='keep_both'&&disposition!=='attribute_to')
    return bad('Unsupported overlap disposition');
  const attributedTo=disposition==='keep_both'
    ?null:choice(data.attributedTo,participants);
  if(disposition==='keep_both'&&data.attributedTo!=null)
    return bad('Keep-both cannot attribute to a participant');
  return {participants,startsAt,endsAt,reason,disposition,attributedTo};
}
export function validateOverlapPatch(
  original:NewOverlapAcknowledgement,patch:OverlapPatch
):OverlapPatch{
  const incoming=object(patch,'Overlap patch');
  allowFields(incoming,INPUT_KEYS);
  if(Object.keys(incoming).length===0)return bad('Empty overlap patch');
  // Re-validate the complete result: an attribution cannot outlive its
  // participant, even when just the participant list was patched.
  const merged=validateNewOverlap({...original,...patch});
  const fields=Object.keys(incoming) as (keyof ValidatedOverlap)[];
  return Object.fromEntries(fields.map(key=>[key,merged[key]])) as OverlapPatch;
}
export function validateOverlapQuery(query:OverlapQuery={}):OverlapQuery{
  const data=object(query,'Overlap query');
  allowFields(data,QUERY_KEYS);
  const result:OverlapQuery={};
  if('from' in data)result.from=absoluteInstant(data.from);
  if('to' in data)result.to=absoluteInstant(data.to);
  if(result.from&&result.to&&result.from>=result.to)
    return bad('Query end must follow start');
  if('stale' in data){
    if(typeof data.stale!=='boolean')return bad('Stale filter must be boolean');
    result.stale=data.stale;
  }
  if('limit' in data){
    if(typeof data.limit!=='number'||!Number.isInteger(data.limit)||
       data.limit<1||data.limit>50)return bad('Page limit must be 1–50');
    result.limit=data.limit;
  }
  if('cursor' in data){
    if(data.cursor!==null&&(typeof data.cursor!=='string'||
      data.cursor.length>4096||!/^[A-Za-z0-9_-]+$/.test(data.cursor)))
      return bad('Invalid opaque cursor');
    result.cursor=data.cursor as string|null;
  }
  return result;
}
/** A missing/deleted participant is stale; no other acknowledgement is altered. */
export function overlapIsStale(
  recorded:readonly OverlapParticipant[],current:readonly OverlapParticipant[]
):boolean{
  const versions=new Map(current.map(p=>[p.kind+':'+p.id.toLowerCase(),p.version]));
  return recorded.some(p=>versions.get(p.kind+':'+p.id.toLowerCase())!==p.version);
}
