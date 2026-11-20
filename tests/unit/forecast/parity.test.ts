import {expect,it} from 'vitest'
import fixture from './forecast-golden.json'
import {Tracker, type Query} from '../../../supabase/functions/_shared/forecast/tracker'
import {ForecastGuard} from '../../../supabase/functions/_shared/forecast/guard'
import {scopedForecast} from '../../../supabase/functions/_shared/forecast/stream'
it('matches each Python forecast before observations, including help, sleep, prerequisites and reference slots',()=>{
  const tracker=new Tracker({target:['pre']})
  for(const row of fixture.tracker){
    const query=row.q as Query,ref=row.ref??undefined
    if(row.before){
      const read=tracker.predict(query,ref)
      expect(read.probability).toBeCloseTo(row.before.probability,12)
      expect(read.recall).toBeCloseTo(row.before.recall,12)
      expect(read.execution).toBeCloseTo(row.before.execution,12)
      expect(read.observations).toBe(row.before.unique_observations)
      for(const [expert,w] of Object.entries(row.before.expert_weights))expect(read.expertWeights[expert]).toBeCloseTo(w,12)
    }
    expect(tracker.update({query,outcome:row.outcome,eventId:row.id,feedback:row.outcome===false},ref)).toBe(true)
  }
  expect(()=>tracker.predict({kc:'target',kind:'attempt',day:17})).toThrow(/order/)
})
it('matches independently generated Python log masses, clipping, and the static ln(2) sequence bound',()=>{
  const guard=new ForecastGuard()
  for(const row of fixture.guard){
    const offered=guard.observe(row.ref,row.challengers,row.outcome)
    expect(offered.forecast).toBeCloseTo(row.p,12)
    offered.weights.forEach((w,i)=>expect(w).toBeCloseTo(row.weights[i],12))
  }
  const stream=new ForecastGuard()
  let differential=0
  for(let i=0;i<800;i++){
    const ref=i%9?.65:.0000003,y=i%5!==0,read=stream.observe(ref,[i%7?.998:.02,.49],y)
    differential+=Math.log((y?ref:1-ref)/(y?read.forecast:1-read.forecast))
    expect(differential).toBeLessThanOrEqual(Math.log(2)+1e-9)
  }
})
it('maintains one safeguarded clean stream per registered context and ignores duplicate, helped and future evidence',()=>{
  const scope={owner:'a',project:'p',concept:'c',facet:'use',context:'whole-proof',rubric:'r1'}
  const event={scope,id:'one',origin:'orig',at:'2026-02-01T12:00:00Z',knownAt:'2026-02-01T12:10:00Z',actor:'owner' as const,
    kind:'attempt' as const,outcome:true,hint:0,reliability:1,uncued:true,worked:false,nativeProbability:.72}
  const req={scope,asOf:'2026-02-03T12:00:00Z',kind:'attempt' as const,nativeProbability:.78,nativeAsOf:'2026-02-02T12:00:00Z'}
  const read=scopedForecast([event,{...event,id:'duplicate'},{...event,id:'copy',origin:'third',worked:true},
    {...event,id:'future',origin:'late',knownAt:'2026-02-07T12:00:00Z'},{...event,id:'other',origin:'other',scope:{...scope,rubric:'r2'}}],req)
  expect(read.observations).toBe(1);expect(read.guardObservations).toBe(1);expect(read.guarded).toBe(true)
  expect(scopedForecast([event],{...req,nativeAsOf:'2026-02-07T12:00:00Z'}).guarded).toBe(false)
})
