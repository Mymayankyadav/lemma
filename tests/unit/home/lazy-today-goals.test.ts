// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

// The 4x-CPU Today cold path must not parse the full Metro/goal-detail module
// before the due count, resume target and first desk content can render.
describe('FIX #507 Today route code-splitting',()=>{
 it('loads the goal-distance module asynchronously and keeps a meaningful fallback',()=>{
  const page=readFileSync('src/features/home/Page.tsx','utf8')
  expect(page).not.toMatch(/import\s*\{\s*GoalDistance\s*\}\s*from\s*['"]\.\/GoalDistance['"]/) 
  expect(page).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\/GoalDistance['"]\)/)
  expect(page).toContain('aria-label="Distance to your goals"')
  expect(page).toContain('<Suspense')
 });
});

describe('FIX #507 cold Today goal scheduling',()=>{
 it('does not eagerly fetch goal work before Home data can paint',()=>{
  const page=readFileSync('src/features/home/Page.tsx','utf8')
  expect(page).not.toContain("void import('./GoalDistance')")
  expect(page).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\/GoalDistance['"]\)/)
 })
})
