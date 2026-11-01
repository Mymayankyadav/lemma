// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('FIX-507c Atlas route-aware prefetch',()=>{
 it('preserves eager Today/Paths while verifying lazy direct-route coverage',()=>{
  const routes=readFileSync('src/app/routes.tsx','utf8')
  // FIX #507c recorded 33 direct-navigation failures when a previous lazy
  // split had no cold-route coverage. FIX #632 now pairs a smaller entry
  // with an actual extreme cold-navigation browser test of every route.
  // Keep Today, Paths, Atlas and Cards eager: strict Today, C2 and D6
  // first-interactive budgets cannot depend on a deferred chunk.
  for(const n of [0,1,11,13])
   expect(routes,'screen '+n+' remains eager').toContain('import Page'+n+' from ')
  for(const n of Array.from({length:18},(_,i)=>i).filter(n=>![0,1,11,13].includes(n)))
   expect(routes,'screen '+n+' is code-split').toContain('const Page'+n+'=lazy(()=>import(')
  const browser=readFileSync('tests/e2e/fix-632-direct-routes.spec.ts','utf8')
  expect(browser).toContain('QA3_ROUTES')
  expect(browser).toContain('demo=extreme')
  expect(browser).toContain('readiness.landmark')
  expect(browser).toContain('toHaveCount(0')
 })
 it('prefetches Atlas data only on demo Paths, not live Paths or Today',()=>{
  const projects=readFileSync('src/features/projects/Page.tsx','utf8')
  const section=projects.slice(projects.indexOf('export default function Page(){'))
  expect(section).toContain("if(getMode()!=='demo')return")
  expect(section).toContain("import('../atlas/Page')")
  expect(section).toContain('prefetchAtlasForPaths(queryClient')
  // A full extreme Atlas query on Paths mount stalls the first route paint.
  // Trigger the same deduplicated prefetch only on genuine Atlas intent.
  for(const handler of ['onPointerEnter','onPointerDown','onFocus'])
   expect(section).toContain(handler+'={warmAtlas}')
  expect(section).not.toMatch(/useEffect\(\(\)=>\{\s*if\(getMode\(\)!=='demo'\)return/)
  const today=readFileSync('src/features/home/Page.tsx','utf8')
  expect(today).not.toContain("import('../atlas/Page')")
 })
})
