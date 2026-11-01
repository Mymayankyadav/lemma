// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

// The stress demo exposes only a bounded InsightAggregate, with no
// checkpointEvents. GoalDistance cannot use that aggregate for its pace
// estimate, so starting an Insights query on the strict 4x CPU Today cold
// path performs extra work without changing the rendered result.
describe('FIX #507 avoid unused stress Insights query on Today',()=>{
 it('keeps default-demo pace data but skips the empty stress aggregate request',()=>{
  const source=readFileSync('src/features/home/GoalDistance.tsx','utf8')
  expect(source).toContain('getDemoProfile')
  expect(source).toMatch(/enabled:\s*getMode\(\)===['"]demo['"]\s*&&\s*getDemoProfile\(\)===['"]default['"]/)
  expect(source).toContain('events={insight.data?.checkpointEvents}')
 })
})
