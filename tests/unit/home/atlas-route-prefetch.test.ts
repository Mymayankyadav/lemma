// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

// Atlas is an important fast navigation target from Paths, but a static
// Atlas import on the Today entry inflates its strict 4x CPU cold-start cost.
// Paths may warm the dynamic chunk before a user navigates to Atlas.
describe('FIX #507 route-aware Atlas prefetch',()=>{
 it('does not eagerly parse Atlas on Today and preloads it from Paths',()=>{
  const routes=readFileSync('src/app/routes.tsx','utf8')
  const projects=readFileSync('src/features/projects/Page.tsx','utf8')
  expect(routes).not.toMatch(/import\s+Page13\s+from\s+['"]\.\.\/features\/atlas\/Page['"]/)
  expect(routes).toMatch(/lazy\(loadAtlas\)/)
  expect(routes).toMatch(/#\\\/\(\?:projects\|atlas\)/)
  expect(projects).toContain("import('../atlas/Page')")
 })
})
