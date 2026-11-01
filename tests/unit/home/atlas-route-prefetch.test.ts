// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('FIX-507c Atlas route-aware prefetch',()=>{
 it('keeps Atlas out of the cold Today entry chunk',()=>{
  const routes=readFileSync('src/app/routes.tsx','utf8')
  expect(routes).not.toMatch(/import\s+Page13\s+from\s+['"]\.\.\/features\/atlas\/Page['"]/)
  expect(routes).toContain("const Page13=lazy(loadAtlas)")
  expect(routes).toContain("const loadAtlas=()=>import('../features/atlas/Page')")
  for(const n of [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17])
   expect(routes, 'screen '+n+' must not enter the cold Today chunk').toMatch(new RegExp('const Page'+n+'=lazy\\('))
 })
 it('preloads Atlas only on demo Paths, not on live Paths or Today',()=>{
  const projects=readFileSync('src/features/projects/Page.tsx','utf8')
  const section=projects.slice(projects.indexOf('export default function Page(){'))
  expect(section).toContain("if(getMode()!=='demo')return")
  expect(section).toContain("import('../atlas/Page')")
  expect(section).toContain('prefetchAtlasForPaths(queryClient')
  const today=readFileSync('src/features/home/Page.tsx','utf8')
  expect(today).not.toContain("import('../atlas/Page')")
 })
})
