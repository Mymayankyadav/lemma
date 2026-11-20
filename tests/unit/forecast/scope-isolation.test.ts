import {expect, it} from 'vitest'
import {scopedForecast, type ForecastScope} from '../../../supabase/functions/_shared/forecast/stream'
import {proofCertificate, type ProofEvent} from '../../../supabase/functions/_shared/practice/questions'

const legacy:ForecastScope={owner:'owner',project:'project',concept:'concept',facet:'construct',context:'proof',rubric:'r1'}
const scope={...legacy,track:'course',policy:'p1',bank:'b1'}
const asOf='2026-11-20T12:00:00Z'
const first:ProofEvent={scope,id:'first',origin:'first',at:'2026-11-10T12:00:00Z',knownAt:'2026-11-10T12:01:00Z',
  actor:'owner',kind:'attempt',outcome:true,hint:0,reliability:1,uncued:true,worked:false,nativeProbability:.7,
  session:'session-1',item:'item-1',family:'family-1',form:'whole',novel:true}
const later:ProofEvent={...first,id:'later',origin:'later',at:'2026-11-12T12:00:00Z',knownAt:'2026-11-12T12:01:00Z',
  session:'session-2',item:'item-2',family:'family-2'}
const forecast=(events:ProofEvent[],target:ForecastScope)=>scopedForecast(events,{scope:target,asOf,kind:'attempt',
  nativeProbability:.7,nativeAsOf:asOf})
const certificate=(events:ProofEvent[],target:ForecastScope)=>proofCertificate(events,target,asOf,.8,.85,'UTC',[0,1,2,3,4,5,6])

it.each(['track','policy','bank'] as const)('isolates forecast updates and proof evidence when %s changes',field=>{
  const changed={...scope,[field]:'another-registration'}
  expect(forecast([first],scope)).toMatchObject({observations:1,guardObservations:1})
  expect(forecast([first],changed)).toMatchObject({observations:0,guardObservations:0})
  expect(certificate([first,later],scope).certified).toBe(true)
  expect(certificate([first,later],changed).certified).toBe(false)
})

it('preserves unregistered reference fixtures without admitting them into a registered product stream',()=>{
  const legacyEvents=[{...first,scope:legacy},{...later,scope:legacy}]
  expect(forecast(legacyEvents,legacy)).toMatchObject({observations:2,guardObservations:2})
  expect(certificate(legacyEvents,legacy).certified).toBe(true)
  expect(forecast(legacyEvents,scope).observations).toBe(0)
  expect(forecast([first,later],legacy).observations).toBe(0)
  expect(certificate(legacyEvents,scope).certified).toBe(false)
  expect(certificate([first,later],legacy).certified).toBe(false)
})

it('rejects partial registration instead of creating an ambiguously scoped forecast or proof',()=>{
  const partial={...legacy,bank:'b1'}
  expect(()=>forecast([first],partial)).toThrow('Unregistered forecast target')
  expect(forecast([{...first,scope:partial}],scope).observations).toBe(0)
  expect(certificate([{...first,scope:partial},{...later,scope:partial}],partial).certified).toBe(false)
})

it('keeps a new lesson on another facet in the same registered target as a proof reset',()=>{
  const lesson:ProofEvent={...later,id:'lesson',origin:'lesson',at:'2026-11-13T12:00:00Z',knownAt:'2026-11-13T12:01:00Z',
    scope:{...scope,facet:'understand'},actor:'tutor',kind:'lesson',outcome:null,form:'worked',worked:true}
  expect(certificate([first,later,lesson],scope).certified).toBe(false)
  expect(certificate([first,later,{...lesson,scope:{...lesson.scope,bank:'other-bank'}}],scope).certified).toBe(true)
})
