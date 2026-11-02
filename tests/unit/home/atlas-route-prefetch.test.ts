// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('FIX-507c Atlas route-aware prefetch',()=>{
 it('keeps all page modules separate with complete cold-route coverage',()=>{
  const routes=readFileSync('src/app/routes.tsx','utf8')
  for(const n of Array.from({length:18},(_,i)=>i))
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
