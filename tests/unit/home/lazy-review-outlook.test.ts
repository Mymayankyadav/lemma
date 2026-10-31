// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

// The first 4x-CPU Today paint must not evaluate the entire deck-tree and
// seven-day forecast before the actual Goal progress card is visible.
// The outlook remains available after the deferred module resolves.
describe('FIX #507 defer below-the-fold review outlook',()=>{
 it('code-splits ReviewOutlook but keeps a labelled nonblank fallback',()=>{
  const page=readFileSync('src/features/home/Page.tsx','utf8')
  expect(page).not.toMatch(/import\s*\{\s*ReviewOutlook\s*\}\s*from\s*['"]\.\/ReviewOutlook['"]/)
  expect(page).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\/ReviewOutlook['"]\)/)
  expect(page).toContain('aria-label="Seven-day review forecast"')
  expect(page).toContain('<ReviewOutlook/>')
 });
});
