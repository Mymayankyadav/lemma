import {expect, it} from 'vitest'
import {assembleAtlas, type AtlasRows} from '../../../supabase/functions/_shared/adaptive/atlas'
import type {Action} from '../../../supabase/functions/_shared/adaptive/kg'
import {productForecast, type PreloggedForecast} from '../../../supabase/functions/_shared/forecast/product'
import type {BankItem, SelectionScope} from '../../../supabase/functions/_shared/practice/questions'

const asOf='2026-11-20T12:00:00Z'
const scope:SelectionScope={owner:'owner',project:'project',concept:'concept',facet:'construct',context:'proof',
  rubric:'r1',track:'course',policy:'p1',bank:'b1'}
const bank:Omit<BankItem,'nativeProbability'|'nativeAsOf'>={...scope,id:'item',itemVersion:1,family:'family',form:'whole',
  minutes:10,uncued:true,novel:true,approved:true,registeredAt:'2026-11-01T00:00:00Z',difficulty:0,arm:'atlas80'}
const base:AtlasRows={settings:{time_zone:'UTC',capacity:{weekday_minutes:60}},concepts:[{id:'concept',name:'Sets',kind:'topic'}],
  projects:[{id:'project'}],checkpoints:[],cpConcepts:[],sessions:[{id:'session',project_id:'project',started_at:'2026-11-10T10:00:00Z'}]}
const view=assembleAtlas(base,new Date(asOf))
const action:Action={id:'practice',kind:'practice',concept_id:'concept',project_id:'project',minutes:10,p:.7}
const attempt={id:1,item_id:'item',project_id:'project',session_id:'session',occurred_at:'2026-11-10T12:00:00Z',
  knownAt:'2026-11-10T12:01:00Z',grader:'learner',origin:'user',cued:[],weight:1,
  context:{practice_request_id:'request',item_version:1,novelty:'novel'}}
const exposure:PreloggedForecast={requestId:'request',itemId:'item',version:1,at:'2026-11-10T11:00:00Z',scope,native:.7,
  details:{form:'whole',family:'family',uncued:true,novel:true}}
function read(attempts:NonNullable<AtlasRows['attempts']>=[attempt],exposures:PreloggedForecast[]=[exposure]){
  const rows={...base,attempts,attemptTags:attempts.map(a=>({attempt_id:a.id,concept_id:'concept',facet:'construct',role:'target',
    result:'ok',hint_level:0,confidence:1,knownAt:a.knownAt}))}
  const result=productForecast('owner',asOf,action,10,view,rows,[bank],true,exposures)
  if(result.status!=='available')throw Error(result.reason)
  return result
}

it('updates the registered forecast and its guard from one actual delivery and canonical learner outcome',()=>{
  expect(read().forecast).toMatchObject({observations:1,guardObservations:1})
})

it.each([
  ['missing delivery',()=>read([attempt],[])],
  ['unbound historical attempt',()=>read([{...attempt,context:{novelty:'novel'}}])],
  ['forged request',()=>read([{...attempt,context:{...attempt.context,practice_request_id:'not-delivered'}}])],
  ['missing item version',()=>read([{...attempt,context:{practice_request_id:'request',novelty:'novel'}}])],
  ['wrong recorded item version',()=>read([{...attempt,context:{...attempt.context,item_version:2}}])],
  ['other delivered item',()=>read([attempt],[{...exposure,itemId:'other-item'}])],
  ['other delivered version',()=>read([attempt],[{...exposure,version:2}])],
  ['outcome before delivery',()=>read([attempt],[{...exposure,at:'2026-11-11T12:00:00Z'}])],
  ['outcome at delivery',()=>read([attempt],[{...exposure,at:attempt.occurred_at}])],
  ['missing frozen item details',()=>read([attempt],[{...exposure,details:undefined}])],
  ['invalid pre-outcome baseline',()=>read([attempt],[{...exposure,native:NaN}])],
  ['other owner',()=>read([attempt],[{...exposure,scope:{...scope,owner:'other'}}])],
  ['other bank',()=>read([attempt],[{...exposure,scope:{...scope,bank:'other'}}])],
  ['other policy',()=>read([attempt],[{...exposure,scope:{...scope,policy:'other'}}])],
  ['other track',()=>read([attempt],[{...exposure,scope:{...scope,track:'other'}}])],
  ['tutor grade',()=>read([{...attempt,grader:'tutor'}])],
  ['future reported outcome',()=>read([{...attempt,knownAt:'2026-11-21T12:00:00Z'}])],
] as const)('does not learn or certify from %s',(_name,run)=>{
  const result=run()
  expect(result.forecast).toMatchObject({observations:0,guardObservations:0})
  expect(result.certificate?.certified).toBe(false)
})

it('rejects a delivery used by two active attempts but permits a single canonical survivor after correction',()=>{
  const duplicate={...attempt,id:2}
  expect(read([attempt,duplicate]).forecast).toMatchObject({observations:0,guardObservations:0})
  for(const retired of [{...duplicate,voided_at:asOf},{...duplicate,superseded_by:1}])
    expect(read([attempt,retired]).forecast).toMatchObject({observations:1,guardObservations:1})
})

it('uses the frozen delivered form and cue status even if the current bank describes an independent proof',()=>{
  const worked={...exposure,details:{...exposure.details!,form:'worked' as const}}
  expect(read([attempt],[worked]).forecast).toMatchObject({observations:0,guardObservations:0})
  const cued={...exposure,details:{...exposure.details!,uncued:false}}
  expect(read([attempt],[cued]).forecast).toMatchObject({observations:1,guardObservations:0})
})

it.each([['familiar',.5],['seen_solution',.2]] as const)('does not treat %s evidence as a clean safeguard outcome', (novelty,weight)=>{
  const result=read([{...attempt,weight,context:{...attempt.context,novelty}}])
  expect(result.forecast).toMatchObject({observations:1,guardObservations:0})
  expect(result.certificate?.certified).toBe(false)
})
