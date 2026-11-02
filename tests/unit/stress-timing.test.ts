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
 it('rejects absent or invalid CPU-throttling evidence instead of bypassing the 4x budget',()=>{
  for(const cpuThrottle of [Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY,0,-1])
   expect(stressViolations({...base,cpuThrottle,durationMs:1800})).toContain('invalid CPU throttling evidence')
 })
 it('retains the owner-approved 4,000ms at 4x CPU boundary',()=>{
  expect(stressViolations({...base,durationMs:3999})).toEqual([])
  expect(stressViolations({...base,durationMs:4000})).toContain('4x CPU first render >= 4s')
  expect(stressViolations({...base,durationMs:4001})).toContain('4x CPU first render >= 4s')
 })
 it('does not mistake a valid unthrottled measurement for missing evidence',()=>{
  expect(stressViolations({...base,cpuThrottle:1,durationMs:2000})).toEqual([])
 })
})
