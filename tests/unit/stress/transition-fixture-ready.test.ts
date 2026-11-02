import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

// C2/D6 measure *navigation* from an already hydrated extreme fixture.
// A Paths heading renders during the skeleton state, so it is not a
// sufficient precondition for the first-attempt 4x CPU stopwatch.
describe('strict C2/D6 loaded-fixture transition precondition (FIX #604)',()=>{
 for(const spec of ['audit-441-atlas-budget.spec.ts','st-4.spec.ts']){
  it(spec+' waits for actual Paths rows before CPU throttling',()=>{
   const source=readFileSync(join(process.cwd(),'tests/e2e',spec),'utf8')
   const ready=source.indexOf('await waitForLoadedPaths(page)')
   const throttle=source.indexOf("await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})")
   expect(ready,'must wait for data-backed Paths, not just the h1').toBeGreaterThan(-1)
   expect(throttle,'must preserve 4x CPU throttling after fixture readiness').toBeGreaterThan(ready)
   expect(source,'must retain the strict 2000ms first-attempt cap').toContain('.toBeLessThan(2000)')
  })
 }
 it('helper requires a real project row and its Mini Route, not only a heading',()=>{
  const source=readFileSync(join(process.cwd(),'tests/e2e/helpers/waitForLoadedPaths.ts'),'utf8')
  expect(source).toContain('[data-project-row]')
  expect(source).toContain('[data-mini-route]')
  expect(source).toContain('toBeVisible')
  expect(source,'prior Paths page must finish painting before the transition clock starts').toContain('requestAnimationFrame')
  expect(source.match(/requestAnimationFrame/g)?.length,'require two-frame paint barrier, not a timer').toBeGreaterThanOrEqual(2)
 })

 it('D6 first-attempt performance failures cannot pass through CI retries',()=>{
  const source=readFileSync(join(process.cwd(),'tests/e2e/st-4.spec.ts'),'utf8')
  const d6=source.slice(source.indexOf('// D6 acceptance:'))
  expect(d6,'D6 block must exist').toContain('ST-4 extreme cards open under 2s')
  expect(d6,'strict D6 budget must disable retries and avoid simultaneous 4x CPU test contention').toContain("test.describe.configure({mode:'default',retries:0})")
  expect(d6,'retain the original 4x throttle').toContain("await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})")
  expect(d6,'retain the original 2000ms first-attempt budget').toContain('.toBeLessThan(2000)')
 })
 it('C2 runs all four first-attempt cells sequentially, not simultaneously under 4x CPU',()=>{
  const source=readFileSync(join(process.cwd(),'tests/e2e/audit-441-atlas-budget.spec.ts'),'utf8')
  expect(source,'mode default overrides fullyParallel without serial fail-fast skips')
   .toContain("test.describe.configure({mode:'default',retries:0})")
  expect(source).not.toContain("mode:'serial'")
 })

 it('C2 allows slow fixture setup without relaxing its 2s measured transition',()=>{
  const source=readFileSync(join(process.cwd(),'tests/e2e/audit-441-atlas-budget.spec.ts'),'utf8')
  expect(source,'fixture generation and screenshots must not exhaust the outer 30s test timeout')
   .toContain('test.setTimeout(120_000)')
  expect(source,'keep strict 2000ms first-attempt transition budget').toContain('.toBeLessThan(2000)')
 })

})
