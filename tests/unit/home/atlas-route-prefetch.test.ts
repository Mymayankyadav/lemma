// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it,test} from 'vitest'

// Atlas is an important fast navigation target from Paths, but a static
// Atlas import on the Today entry inflates its strict 4x CPU cold-start cost.
// Paths may warm the dynamic chunk before a user navigates to Atlas.
describe('FIX #507 route-aware Atlas prefetch',()=>{
 it('does not eagerly parse Atlas on Today and preloads it from Paths',()=>{
  const routes=readFileSync('src/app/routes.tsx','utf8')
  const projects=readFileSync('src/features/projects/Page.tsx','utf8')
  expect(routes).not.toMatch(/import\s+Page13\s+from\s+['"]\.\.\/features\/atlas\/Page['"]/)
  expect(routes).toMatch(/lazy\(loadAtlas\)/)
  expect(routes).toContain('(?:projects|atlas)')
  expect(projects).toContain("import('../atlas/Page')")
 })
})

test('direct Atlas entry warms the rich math chunk without loading it on Today',()=>{
 const routes=readFileSync('src/app/routes.tsx','utf8')
 expect(routes).toContain("if(/^#\\/(?:projects|atlas)(?:\\/|$)/.test(location.hash))")
 expect(routes).toContain("import('../lib/render')")
 expect(routes).toContain("if(typeof window!=='undefined'")
})

// The C2 4x CPU clock begins after Paths becomes usable. Preloading only the
// Atlas page leaves its separate KaTeX/Markdown chunk on the critical path.
// This is a real prefetch contract, not a relaxation of the 1000ms budget.
test('Paths entry also warms Atlas mathematical rendering before navigation',()=>{
 const routes=readFileSync('src/app/routes.tsx','utf8')
 expect(routes).toContain("if(/^#\\/(?:projects|atlas)(?:\\/|$)/.test(location.hash))")
 expect(routes).toContain("import('../lib/render')")
})
