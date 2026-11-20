import {expect,it} from 'vitest'
import {proofCertificate,selectPracticeQuestion,type BankItem,type ProofEvent} from '../../../supabase/functions/_shared/practice/questions'
const scope={owner:'o',project:'p',concept:'c',facet:'construct',context:'formal proof',rubric:'r1',track:'alg',policy:'p1',bank:'v1'}
const at='2026-11-20T10:00:00Z'
const item:BankItem={...scope,id:'first',family:'f',form:'whole',minutes:12,uncued:true,novel:true,approved:true,registeredAt:'2026-10-20T00:00:00Z',
  nativeAsOf:at,nativeProbability:.70,nativeOrder:1,difficulty:0,arm:'atlas80'}
const event:ProofEvent={scope,at:'2026-11-12T12:00:00Z',knownAt:'2026-11-12T12:00:10Z',id:'id',origin:'origin',actor:'owner',kind:'attempt',outcome:true,
  uncued:true,hint:0,reliability:1,session:'session',family:'family',item:'one',form:'whole',worked:false,novel:true}
it('preserves native item order, scope and urgent full-proof eligibility; falls back for a missing arm-specific score',()=>{
  const unusable={...item,form:'micro' as const,nativeOrder:0,id:'short'}
  const read=selectPracticeQuestion([unusable,item,{...item,id:'newer',nativeOrder:2}],[],scope,at,15,'whole')
  expect(read?.id).toBe('first');expect(read?.forecast.status).toBe('uncertain')
  expect(selectPracticeQuestion([item],[],{...scope,rubric:'changed'},at,15,'whole')).toBeNull()
  expect(selectPracticeQuestion([item],[],scope,at,10,'whole')).toBeNull()
  expect(selectPracticeQuestion([{...item,arm:'guided80'}],[],scope,at,15,'whole')?.arm).toBe('atlas80')
})
it('requires complete independent clean dated proof evidence and holds certification after a new lesson',()=>{
  const first=event,later={...event,id:'id2',origin:'s2',family:'other',session:'next',item:'other',at:'2026-11-17T12:00:00Z',knownAt:'2026-11-17T12:01:00Z'}
  const cert=(rows:ProofEvent[])=>proofCertificate(rows,scope,at,.8,.85,'UTC',[0,1,2,3,4,5,6]).certified
  expect(cert([first,later])).toBe(true)
  for(const patch of [{hint:1},{uncued:false},{novel:false},{origin:first.origin},{family:first.family},{item:first.item},{actor:'tutor' as const},{reliability:.9},{form:'step' as const}])
    expect(cert([first,{...later,...patch}])).toBe(false)
  expect(cert([first,later,{...later,id:'lesson',kind:'lesson',outcome:null}])).toBe(false)
})
