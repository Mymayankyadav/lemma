// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('FIX-507c Atlas route-aware prefetch',()=>{
 it('preserves eager direct-route availability until the full stress-hydration fix lands',()=>{
  const routes=readFileSync('src/app/routes.tsx','utf8')
  // A route-only lazy split caused 33 extreme-profile direct-navigation
  // failures across all four shards. Keep the existing eager route contract;
  // the parent FIX-507 can split chunks alongside its optimized fixture path.
  for(const n of Array.from({length:18},(_,i)=>i))
   expect(routes,'screen '+n+' must mount without a deferred route chunk').toContain('import Page'+n+' from ')
  expect(routes).not.toMatch(/const Page\d+=lazy\(/)
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
