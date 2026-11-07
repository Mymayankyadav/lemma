// N63.1: pure proposal-draft validation and conflict boundaries.
// N49 alone can authorize a submission; none of these helpers approves edits.
import {ProposalDraftError,type NewProposalDraft,type ProposalBaseVersions,
 type ProposalEditPayload,type ProposalDraftQuery,type ProposalDraftRecord,
 type ProposalDraftStatus,type ProposalDraftConflict} from './contract';
const fail=(message:string):never=>{throw new ProposalDraftError('invalid',message)};
const conflict=(message:string):never=>{throw new ProposalDraftError('conflict',message)};
const isObject=(v:unknown):v is Record<string,unknown>=>{
 if(v===null||typeof v!=='object'||Array.isArray(v))return false;
 const prototype=Object.getPrototypeOf(v);
 return prototype===Object.prototype||prototype===null;
};
const allowed=(obj:Record<string,unknown>,keys:readonly string[]):void=>{
 if(Object.keys(obj).some(k=>!keys.includes(k)))fail('Unexpected proposal-draft field');
};
const uuid=(v:unknown):string=>{
 if(typeof v!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))
  return fail('Expected a UUID');
 return v.toLowerCase();
};
const version=(v:unknown):number=>{
 if(typeof v!=='number'||!Number.isInteger(v)||v<1||v>2147483647)
  return fail('Expected a positive int4 version');
 return v;
};
const statuses:ProposalDraftStatus[]=['draft','saved','submitted','discarded'];
const forbidden=new Set(['userId','user_id','ownerId','owner_id','source',
 'actorId','actor_id','approvedAt','approved_at','approvedBy','approved_by',
 'status','decision','isApproved','is_approved']);
/** Deep JSON-only copy, with no silent omission of undefined or NaN. */
function cloneJson(v:unknown,seen:Set<object>,depth:number):unknown{
 if(depth>32)return fail('Proposal edit exceeds JSON depth');
 if(v===null||typeof v==='string'||typeof v==='boolean')return v;
 if(typeof v==='number')return Number.isFinite(v)?v:fail('Invalid JSON number');
 if(typeof v!=='object')return fail('Proposal edit must be JSON');
 if(seen.has(v))return fail('Cyclic or shared proposal edit object');
 seen.add(v);
 if(Array.isArray(v)){
  const result=v.map(x=>cloneJson(x,seen,depth+1));
  seen.delete(v);return result;
 }
 if(!isObject(v))return fail('Proposal edit must be a plain JSON object');
 const copy:Record<string,unknown>={};
 for(const [key,value] of Object.entries(v)){
  if(forbidden.has(key)||key==='__proto__'||key==='constructor'||key==='prototype')
   return fail('Caller cannot supply ownership, source, approval or status fields');
  copy[key]=cloneJson(value,seen,depth+1);
 }
 seen.delete(v);
 return copy;
}
export function normalizeDraftPayload(payload:ProposalEditPayload):ProposalEditPayload{
 if(!isObject(payload))return fail('Proposal draft must contain a full edit object');
 if(Object.keys(payload).length===0)return fail('Proposal edit payload cannot be empty');
 return cloneJson(payload,new Set(),0) as ProposalEditPayload;
}
export function normalizeBaseVersions(value:ProposalBaseVersions):ProposalBaseVersions{
 if(!isObject(value))return fail('Missing source base versions');
 allowed(value,['proposal','target']);
 return {proposal:version(value.proposal),target:version(value.target)};
}
export function normalizeNewDraft(value:NewProposalDraft):NewProposalDraft{
 if(!isObject(value))return fail('New draft must be an object');
 allowed(value,['proposalId','targetId','baseVersions','payload']);
 return {proposalId:uuid(value.proposalId),targetId:uuid(value.targetId),
  baseVersions:normalizeBaseVersions(value.baseVersions),
  payload:normalizeDraftPayload(value.payload)};
}
export function normalizeDraftQuery(query:ProposalDraftQuery={}):Required<ProposalDraftQuery>{
 if(!isObject(query))return fail('Invalid proposal draft query');
 allowed(query,['status','proposalId','targetId','limit','cursor']);
 const status=query.status??[...statuses];
 if(!Array.isArray(status)||status.length===0||status.length>statuses.length||
  new Set(status).size!==status.length||status.some(s=>!statuses.includes(s)))
  return fail('Invalid proposal status filter');
 const limit=query.limit??50;
 if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>50)
  return fail('Draft page size must be 1–50');
 const cursor=query.cursor??null;
 if(cursor!==null&&(typeof cursor!=='string'||!cursor.trim()||cursor.length>2048))
  return fail('Invalid draft page cursor');
 return {status:[...status],proposalId:query.proposalId===undefined?undefined:uuid(query.proposalId),
  targetId:query.targetId===undefined?undefined:uuid(query.targetId),
  limit,cursor} as Required<ProposalDraftQuery>;
}
export function compareDraftSourceVersions(base:ProposalBaseVersions,
 current:ProposalBaseVersions):{ok:boolean;changed:('proposal'|'target')[]}{
 const original=normalizeBaseVersions(base),live=normalizeBaseVersions(current);
 const changed:( 'proposal'|'target')[]=[];
 if(original.proposal!==live.proposal)changed.push('proposal');
 if(original.target!==live.target)changed.push('target');
 return {ok:changed.length===0,changed};
}
export function draftConflictDetails(
 current:ProposalDraftRecord,attemptedPayload:ProposalEditPayload,
 currentSources?:ProposalBaseVersions):ProposalDraftConflict{
 const draft=normalizeDraftPayload(attemptedPayload);
 const sources=currentSources===undefined?undefined:normalizeBaseVersions(currentSources);
 const base=normalizeBaseVersions(current.baseVersions);
 return {kind:sources&&(!compareDraftSourceVersions(base,sources).ok)?
  'source_version':'draft_version',current:{...current,payload:normalizeDraftPayload(current.payload),
   baseVersions:base},baseVersions:base,attemptedPayload:draft,
  ...(sources?{currentSourceVersions:sources}:{})};
}
/** Explicit instant for the edit log; no server authority is inferred here. */
function instant(value:string):string{
 if(typeof value!=='string'||
  !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(value)||
  !Number.isFinite(Date.parse(value)))
  return fail('Expected a real timezone-aware edit instant');
 const day=value.slice(0,10),canonical=new Date(Date.parse(day+'T00:00:00Z')).toISOString().slice(0,10);
 if(day!==canonical)return fail('Invalid edit calendar date');
 return value;
}
/** No mutation or persistence; the server enforces the same guards under lock. */
export function nextDraftState(
 current:ProposalDraftRecord,operation:'save'|'submit'|'discard',
 expectedDraftVersion:number,at:string,
 replacement?:ProposalEditPayload,currentSources?:ProposalBaseVersions
):ProposalDraftRecord{
 const expected=version(expectedDraftVersion),now=instant(at);
 if(current.draftVersion!==expected)return conflict('A newer proposal draft exists');
 if(current.status!=='draft'&&current.status!=='saved')
  return fail('Submitted/discarded drafts are immutable');
 if(!['save','submit','discard'].includes(operation))
  return fail('Unknown proposal draft operation');
 if(current.draftVersion>=2147483647)return fail('Draft version exhausted');
 if(operation==='submit'){
  if(current.status!=='saved')return fail('Save draft before submitting');
  if(currentSources===undefined)return fail('Submission requires current source versions');
  if(!compareDraftSourceVersions(current.baseVersions,currentSources).ok)
   return conflict('Proposal or target changed since base');
 }
 if(operation==='save'&&replacement===undefined)
  return fail('Save requires a complete edit payload');
 if(operation!=='save'&&replacement!==undefined)
  return fail('Only save can replace a draft edit payload');
 return {...current,draftVersion:current.draftVersion+1,
  status:operation==='save'?'saved':operation==='submit'?'submitted':'discarded',
  editedAt:now,baseVersions:normalizeBaseVersions(current.baseVersions),
  payload:operation==='save'?normalizeDraftPayload(replacement!):
   normalizeDraftPayload(current.payload)};
}
