import type { Context } from './db.ts';
import type { ForecastPractice } from '../_shared/forecast/product.ts';
import { holdReceipt } from '../_shared/agenda/decision.ts';
import { ownerAgenda, type HostData } from '../_shared/agenda/host.ts';
import { requestedAlgorithm, type AgendaDecision } from '../_shared/agenda/contract.ts';
import {PracticeScoreRejectedError,validPracticeRequest,validPracticeScore,type PracticeDelivery,type PracticeScoreRequest,type PracticeScoreReceipt} from '../_shared/practice/delivery.ts';
export {validPracticeRequest} from '../_shared/practice/delivery.ts';
export type {PracticeDelivery} from '../_shared/practice/delivery.ts';

export interface AgendaRead {decision:AgendaDecision;label?:string;baselineLabel?:string;practice?:ForecastPractice}
export interface AgendaResponse {released:boolean;agenda:AgendaRead|null}
const shadowConfigured=()=>typeof Deno!=='undefined' && Deno.env.get('LEMMA_ATLAS_SHADOW')==='1';
async function unavailablePreference(c:Context,stored:unknown,released:boolean):Promise<AgendaDecision['requested']>{
  if(stored!==undefined)return requestedAlgorithm(stored,released);
  try{
    const result=await c.db.from('settings').select('scheduling_algorithm').eq('user_id',c.userId).maybeSingle();
    if(!result.error&&result.data)return requestedAlgorithm(result.data.scheduling_algorithm,released);
  }catch{/* An unread owner preference is unknown, not a fresh-account default. */}
  return 'unknown';
}
export async function readAgenda(c:Context,stored?:unknown,shadowEnabled=shadowConfigured()):Promise<AgendaResponse>{
  const started=performance.now();
  let released=false;
  try {
    const gate=await c.db.rpc('lemma_plan_released');
    released=!gate.error&&gate.data===true;
  } catch { /* A database without the release capability serves its existing queue. */ }
  if(!released&&!shadowEnabled)return {released:false,agenda:null};
  const report=(candidate:AgendaDecision,elapsedMs:number,hardViolations:number)=>{
    // Production comparisons use only coarse status, policy, and latency.
    console.info('atlas-agenda',JSON.stringify({mode:released?'live':'shadow',
      readMs:Math.round(performance.now()-started),elapsedMs:Math.round(elapsedMs),
      effective:candidate.effective,kind:candidate.outcome.kind,policy:candidate.policyVersion,
      hardViolations,fallback:candidate.reason.slice(0,100)}));
  };
  try {
    const result=await c.db.rpc('lemma_agenda_snapshot',{p_owner:c.userId});
    if(result.error||!result.data)throw Error('Missing agenda snapshot');
    const read=ownerAgenda(c.userId,result.data as HostData,released);
    if(!result.data.rows?.settings)read.decision.requested=await unavailablePreference(c,stored,released);
    report(read.candidate,read.elapsedMs,read.hardViolations);
    return {released,agenda:released?{decision:read.decision,label:read.label,baselineLabel:read.baselineLabel,practice:read.practice}:null};
  } catch {
    const preference=await unavailablePreference(c,stored,released);
    const decision:AgendaDecision={...holdReceipt(new Date().toISOString(),'unavailable',preference==='new'?'new':'legacy',
      preference==='unknown'?'Planning preference and decision inputs temporarily unavailable':'Decision inputs temporarily unavailable'),requested:preference};
    report(decision,0,0);
    return {released,agenda:released?{decision}:null};
  }
}
export function agendaQueue(read:AgendaRead):string{
  const {decision,label}=read, action=decision.outcome;
  const body=action.kind==='action'?'1. '+(label??'Study')+' · '+Math.round((action.end-action.start)*10)/10+' min':'Hold · '+decision.reason;
  const policy=decision.requested==='unknown'?'Planning preference unavailable':
    'Planning · '+(decision.requested==='new'?'New':'Legacy')+(decision.effective==='legacy'&&decision.requested==='new'?' · native fallback':'');
  return 'QUEUE\n'+body+'\n'+policy+(action.kind==='action'?' · '+decision.reason:'');
}

/** An explicit delivery opens an approved question and records its actual arm. Agenda previews stay read-only. */
export async function openPractice(c:Context,requestId:string):Promise<PracticeDelivery>{
  if(!validPracticeRequest(requestId))throw Error('A UUID request ID is required');
  const {released,agenda}=await readAgenda(c,undefined,false);
  if(!released)return {status:'unavailable'};
  const p=agenda?.practice;
  const selection=p?.status==='available'?{scope:p.scope,arm:p.arm,questionId:p.questionId,itemVersion:p.itemVersion,
    nativeQuestionId:p.nativeQuestionId,nativeVersion:p.nativeVersion,native:p.native,nativeItemProbability:p.nativeItemProbability}:null;
  const result=await c.db.rpc('lemma_deliver_practice',{p_owner:c.userId,p_request:requestId,p_selection:selection});
  if(result.error||!result.data)throw Error('Question delivery is temporarily unavailable');
  return result.data;
}

/** Only explicit learner assessments enter the canonical evidence writer. */
export async function recordPractice(c:Context,request:PracticeScoreRequest,source:'app'|'claude'|'chatgpt'|'other'='app'):Promise<PracticeScoreReceipt>{
  if(!validPracticeScore(request))throw Error('A learner-confirmed result with valid hints and familiarity is required');
  if(!['app','claude','chatgpt','other'].includes(source))throw Error('Unknown practice client');
  const result=await c.db.rpc('lemma_record_practice',{p_owner:c.userId,p_operation:request.operationId,
    p_request:request.requestId,p_outcome:request.outcome,p_source:source});
  if(result.error){
    // This check follows accepted-receipt replay and precedes every canonical insert in the RPC.
    // Other authorization, transport, or database errors do not prove that a score was not saved.
    if(request.outcome.sessionId&&result.error.code==='42501'&&result.error.message==='Practice session outside owner/project or not open yet')
      throw new PracticeScoreRejectedError({status:'rejected',code:'practice_session_unavailable',operationId:request.operationId,requestId:request.requestId});
    throw Error(result.error.message);
  }
  if(result.data?.status!=='ok'||result.data.operationId!==request.operationId||result.data.requestId!==request.requestId)
    throw Error('The saved practice result could not be confirmed');
  return result.data;
}
