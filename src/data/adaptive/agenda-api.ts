import { useQuery } from '@tanstack/react-query'
import { authGeneration } from '../authBoundary'
import { getMode } from '../mode'
import { usePlanRelease } from '../usePlanRelease'
import type { ForecastPractice } from '../../../supabase/functions/_shared/forecast/product'
import type { AgendaDecision } from '../../../supabase/functions/_shared/agenda/contract'

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
