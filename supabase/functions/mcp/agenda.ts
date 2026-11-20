import type { Context } from './db.ts';
import type { ForecastPractice } from '../_shared/forecast/product.ts';
import { holdReceipt } from '../_shared/agenda/decision.ts';
import { ownerAgenda, type HostData } from '../_shared/agenda/host.ts';
import { requestedAlgorithm, type AgendaDecision } from '../_shared/agenda/contract.ts';

export interface AgendaRead {decision:AgendaDecision;label?:string;baselineLabel?:string;practice?:ForecastPractice}
export interface AgendaResponse {released:boolean;agenda:AgendaRead|null}
const shadowConfigured=()=>typeof Deno!=='undefined' && Deno.env.get('LEMMA_ATLAS_SHADOW')==='1';
export async function readAgenda(c:Context,stored?:unknown,shadowEnabled=shadowConfigured()):Promise<AgendaResponse>{
  let released=false;
  try {
    const gate=await c.db.rpc('lemma_plan_released');
    released=!gate.error&&gate.data===true;
  } catch { /* A database without the release capability serves its existing queue. */ }
  if(!released&&!shadowEnabled)return {released:false,agenda:null};
  try {
    const result=await c.db.rpc('lemma_agenda_snapshot',{p_owner:c.userId});
    if(result.error||!result.data)throw Error('Missing agenda snapshot');
    const read=ownerAgenda(c.userId,result.data as HostData,released);
    // Coarse shadow and fallback counters only. Never write learner material, IDs or times to diagnostic logs.
    console.info('atlas-agenda',JSON.stringify({elapsedMs:Math.round(read.elapsedMs),effective:read.candidate.effective,
      kind:read.candidate.outcome.kind,policy:read.candidate.policyVersion,hardViolations:read.hardViolations,
      fallback:read.candidate.reason.slice(0,100)}));
    return {released,agenda:released?{decision:read.decision,label:read.label,baselineLabel:read.baselineLabel,practice:read.practice}:null};
  } catch {
    const decision=holdReceipt(new Date().toISOString(),'unavailable',requestedAlgorithm(stored,released),'Decision inputs temporarily unavailable');
    return {released,agenda:released?{decision}:null};
  }
}
export function agendaQueue(read:AgendaRead):string{
  const {decision,label}=read, action=decision.outcome;
  const body=action.kind==='action'?'1. '+(label??'Study')+' · '+Math.round((action.end-action.start)*10)/10+' min':'Hold · '+decision.reason;
  return 'QUEUE\n'+body;
}
