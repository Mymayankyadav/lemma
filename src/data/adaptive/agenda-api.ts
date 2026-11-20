import { useQuery } from '@tanstack/react-query'
import { authGeneration } from '../authBoundary'
import { getMode } from '../mode'
import { usePlanRelease } from '../usePlanRelease'
import type { ForecastPractice } from '../../../supabase/functions/_shared/forecast/product'
import type { AgendaDecision } from '../../../supabase/functions/_shared/agenda/contract'
import {PracticeScoreRejectedError,validPracticeRequest,validPracticeScore,validPracticeScoreRejection,type PracticeDelivery,type PracticeScoreRequest,type PracticeScoreReceipt} from '../../../supabase/functions/_shared/practice/delivery'

export interface AgendaRead {decision:AgendaDecision;label?:string;baselineLabel?:string;practice?:ForecastPractice}
async function readAgenda():Promise<AgendaRead|null>{
  if(getMode()==='demo') return (await import('./demo-agenda')).readDemoAgenda()
  const {liveClient}=await import('../live/client')
  const {data,error}=await liveClient().functions.invoke<{released:boolean;agenda:AgendaRead|null}>('mcp/agenda',{method:'POST'})
  if(error) throw error
  return data?.released ? data.agenda : null
}
export function useAgenda(){
  const enabled=usePlanRelease('atlasAgendaV1')
  return {enabled,query:useQuery({queryKey:['agenda',getMode(),authGeneration()],queryFn:readAgenda,enabled,
    staleTime:0,refetchInterval:30_000})}
}

export async function openPracticeQuestion(requestId:string){
  if(!validPracticeRequest(requestId))throw Error('A question request ID is required.')
  if(getMode()==='demo')throw Error('Practice question delivery requires a signed-in account.')
  const generation=authGeneration()
  const {liveClient}=await import('../live/client')
  if(generation!==authGeneration())throw Error('The account changed. Reopen the question.')
  const {data,error}=await liveClient().functions.invoke<PracticeDelivery>(
    'mcp/practice-question',{method:'POST',headers:{'Idempotency-Key':requestId}})
  if(generation!==authGeneration())throw Error('The account changed. Reopen the question.')
  if(error||!data||data.status!=='unavailable'&&(data.status!=='available'||data.requestId!==requestId||
    typeof data.question!=='string'||!data.question||typeof data.itemId!=='string'||!validPracticeRequest(data.projectId)||!Number.isInteger(data.itemVersion)||data.itemVersion<1))
    throw Error('Question delivery is temporarily unavailable.')
  return data
}

/** Retry the same frozen request after an uncertain acknowledgement. */
export async function savePracticeResult(request:PracticeScoreRequest):Promise<PracticeScoreReceipt>{
  if(!validPracticeScore(request))throw Error('Confirm your result, hints and question familiarity before saving.')
  if(getMode()==='demo')throw Error('Saving practice results requires a signed-in account.')
  const generation=authGeneration()
  const {liveClient}=await import('../live/client')
  if(generation!==authGeneration())throw Error('The account changed. Open the result in its original account.')
  const {data,error}=await liveClient().functions.invoke<PracticeScoreReceipt>('mcp/practice-result',
    {method:'POST',body:request,headers:{'Idempotency-Key':request.operationId}})
  let rejected:unknown
  // Supabase preserves the non-2xx Response in FunctionsHttpError.context. Network/relay errors,
  // unknown status codes and unbound bodies must keep the original operation available for retry.
  if(error?.name==='FunctionsHttpError'&&error.context instanceof Response&&error.context.status===409){
    try{rejected=await error.context.json()}catch{/* An unreadable response is an uncertain acknowledgement. */}
  }
  if(generation!==authGeneration())throw Error('The account changed. Open the result in its original account.')
  if(request.outcome.sessionId&&validPracticeScoreRejection(rejected)&&rejected.operationId===request.operationId&&rejected.requestId===request.requestId)
    throw new PracticeScoreRejectedError(rejected)
  if(error||data?.status!=='ok'||data.operationId!==request.operationId||data.requestId!==request.requestId)
    throw Error('The saved result could not be confirmed. Retry the same result.')
  return data
}
