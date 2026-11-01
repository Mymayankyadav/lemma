// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('FIX-507c Atlas route-aware prefetch',()=>{
 it('keeps Atlas out of the cold Today entry chunk',()=>{
  const routes=readFileSync('src/app/routes.tsx','utf8')
  expect(routes).not.toMatch(/import\s+Page13\s+from\s+['"]\.\.\/features\/atlas\/Page['"]/)
  expect(routes).toContain("lazy(()=>import('../features/atlas/Page'))")
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
