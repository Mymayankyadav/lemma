import {describe,expect,it} from 'vitest'
import {stressViolations,type StressMeasurement} from '../../scripts/stress-limits'

const base:StressMeasurement={
 route:'/',nodes:800,horizontalOverflow:0,smallText:0,smallMath:0,
 smallTargets:0,minCircleGap:8,durationMs:1000,cpuThrottle:4,
 requestCount:0,transferBytes:0,
}

describe('FIX-507b fail-closed browser timing evidence',()=>{
 it('rejects absent, non-finite and negative first-render measurements',()=>{
  for(const durationMs of [Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY,-1])
   expect(stressViolations({...base,durationMs})).toContain('invalid first render timing')
 })
 it('retains the unchanged strict 1,500ms at 4x CPU boundary',()=>{
  expect(stressViolations({...base,durationMs:1499})).toEqual([])
  expect(stressViolations({...base,durationMs:1500})).toContain('4x CPU first render >= 1.5s')
  expect(stressViolations({...base,durationMs:1501})).toContain('4x CPU first render >= 1.5s')
 })
 it('does not mistake a valid unthrottled measurement for missing evidence',()=>{
  expect(stressViolations({...base,cpuThrottle:1,durationMs:2000})).toEqual([])
 })
})
