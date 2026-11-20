import {expect,it} from 'vitest'
import {ownerAgenda,type HostData} from '../../../supabase/functions/_shared/agenda/host'
import type {BankItem} from '../../../supabase/functions/_shared/practice/questions'

const asOf='2026-11-20T12:00:00Z',lessonAt='2026-11-20T11:00:00Z'
const bank:Omit<BankItem,'nativeProbability'|'nativeAsOf'>={id:'native',itemVersion:1,project:'project',concept:'concept',facet:'use',
  context:'proof',family:'family',form:'whole',minutes:5,uncued:true,novel:true,approved:true,registeredAt:'2026-11-01T00:00:00Z',
  track:'course',policy:'p1',bank:'b1',rubric:'r1',nativeOrder:0,difficulty:0,arm:'level80',
  expertAsOf:lessonAt,expertProbabilities:{level80:.1}}
const host:HostData={asOf,watermark:'snapshot',forecastEnabled:true,
  rows:{settings:{time_zone:'UTC',capacity:{weekday_minutes:60}},projects:[{id:'project',last_study_on:'2026-12-10'}],
    concepts:[{id:'concept',name:'Sets',kind:'topic'}],
    checkpoints:[{id:'checkpoint',project_id:'project',position:1,status:'not_started',estimate_minutes:15}],
    cpConcepts:[{checkpoint_id:'checkpoint',concept_id:'concept'}],sessions:[{id:'session',project_id:'project',started_at:lessonAt}]},
  calendar:{asOf,watermark:'snapshot',status:'ok',horizonEnd:'2026-11-20T13:00:00Z',fixed:[],
    availability:[{id:'study',revision:1,startsAt:asOf,endsAt:'2026-11-20T13:00:00Z'}]},
  evidence:[{ownerId:'owner',source:'instruction_events',lineageId:'lesson',revision:1,kind:'record',
    occurredAt:lessonAt,reportedAt:lessonAt,knownAt:lessonAt,payload:{id:'lesson',concept_id:'concept',session_id:'session',
      occurred_at:lessonAt,created_at:lessonAt,origin:'tutor',source_key:'lesson'}}],
  practiceBank:[bank,{...bank,id:'challenger',nativeOrder:1,expertProbabilities:{level80:.8}}]}

function read(preference:unknown,forecastEnabled=true,released=true){
  const original=JSON.stringify(host)
  const result=ownerAgenda('owner',{...host,forecastEnabled,rows:{...host.rows!,
    settings:{...host.rows!.settings,scheduling_algorithm:preference}}},released,()=>0)
  expect(JSON.stringify(host)).toBe(original)
  expect(result.decision.outcome.kind).toBe('action')
  if(result.practice?.status!=='available')throw Error('Expected registered practice: '+JSON.stringify(result.practice))
  return result.practice
}

it('Legacy opts out of both the four-state forecast and challenger questions without changing assignments',()=>{
  expect(read('legacy')).toMatchObject({questionId:'native',arm:'atlas80',forecast:null,certificate:null})
  expect(host.practiceBank?.map(item=>item.arm)).toEqual(['level80','level80'])
  expect(read('new')).toMatchObject({questionId:'challenger',arm:'level80',forecast:{version:'atlas-latent-guard-2026-11-20.1'}})
})

it.each([null,undefined])('missing preference %s enables New learning only after the common release',preference=>{
  expect(read(preference)).toMatchObject({questionId:'challenger',arm:'level80',forecast:{version:'atlas-latent-guard-2026-11-20.1'}})
  expect(read(preference,true,false)).toMatchObject({questionId:'native',arm:'atlas80',forecast:null,certificate:null})
})

it('preserves the independent forecast switch for an owner who still chooses New',()=>{
  expect(read('new',false)).toMatchObject({questionId:'challenger',arm:'level80',forecast:null,certificate:null})
  expect(read('legacy',false)).toMatchObject({questionId:'native',arm:'atlas80',forecast:null,certificate:null})
})
