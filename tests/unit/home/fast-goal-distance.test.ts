// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {shouldUseFastGoals} from '../../../src/features/home/fastGoalPolicy'
import type {ProjectSummary} from '../../../src/data/types'

const project=(status:ProjectSummary['status']='active')=>({status}) as ProjectSummary

describe('FIX #507 cold Today goal-summary entry',()=>{
 it('selects the eager bounded summary only for desks with more than four active projects',()=>{
  expect(shouldUseFastGoals(Array.from({length:60},()=>project()))).toBe(true)
  expect(shouldUseFastGoals(Array.from({length:5},()=>project()))).toBe(true)
  expect(shouldUseFastGoals(Array.from({length:4},()=>project()))).toBe(false)
  // GoalDistance renders active goals only; planning does not create a fifth
  // visible card or justify loading the eager large-desk summary.
  expect(shouldUseFastGoals([...Array.from({length:4},()=>project()),project('planning')])).toBe(false)
  expect(shouldUseFastGoals([...Array.from({length:5},()=>project()),project('planning')])).toBe(true)
  expect(shouldUseFastGoals([...Array.from({length:4},()=>project()),project('archived')])).toBe(false)
  expect(shouldUseFastGoals([])).toBe(false)
 })
 it('keeps small desks on the existing lazy interactive GoalDistance path',()=>{
  const page=readFileSync('src/features/home/Page.tsx','utf8')
  expect(page).toContain('shouldUseFastGoals(projects)')
  expect(page).toContain('<FastGoalDistance projects={projects}/>')
  expect(page).toContain('<GoalDistance projects={projects} variant="metro"/>')
  expect(page).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\/GoalDistance['"]\)/)
 })
 it('large desks retain a real labelled Goal card, Metro summary and accessible Show all control',()=>{
  const fast=readFileSync('src/features/home/FastGoalDistance.tsx','utf8')
  expect(fast).toContain("aria-label={'Goal progress for '+project.title}")
  expect(fast).toContain('<MiniStageBar project={project}/>')
  expect(fast).toContain("showRest?'Show fewer':'Show all '+rest.length+' projects'")
  expect(fast).toContain("lazy(()=>import('./GoalCard'))")
 })

 it('times the first actually painted, visible data-backed goal rather than Playwright screenshot preparation',()=>{
  const fast=readFileSync('src/features/home/FastGoalDistance.tsx','utf8')
  const stress=readFileSync('tests/e2e/stress.spec.ts','utf8')
  expect(fast).toContain("document.querySelector<HTMLElement>('[data-summary-goal]')")
  expect(fast).toContain('getBoundingClientRect()')
  expect(fast).toContain('rect.top<window.innerHeight')
  expect(fast).toContain('rect.left<window.innerWidth')
  expect(fast).toContain("performance.mark('lemma-stress-first-goal-paint')")
  expect(fast).toContain('requestAnimationFrame')
  expect(stress).toContain("performance.getEntriesByName('lemma-stress-first-goal-paint','mark')")
  expect(stress).toContain('coldWallClockMs')
  expect(stress).toContain('firstGoalPaintMs')
  // The original hard 1.5s budget and every route readiness assertion remain.
  expect(readFileSync('scripts/stress-limits.ts','utf8')).toContain('m.durationMs >= 1500')
  expect(stress).toContain("await expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0")
 })

 it('preserves merged LOOK-5b quiet ink and removes duplicate Today Projects in the fast path',()=>{
  const fast=readFileSync('src/features/home/FastGoalDistance.tsx','utf8')
  const regular=readFileSync('src/features/home/GoalDistance.tsx','utf8')
  const page=readFileSync('src/features/home/Page.tsx','utf8')
  // Passive percentages, section navigation and Show all are not red-pencil
  // marks. The large-desk optimized path must match the audited small desk.
  expect(fast).toContain('text-title-s tabular-nums text-ink-2')
  expect(fast).toContain('text-label text-ink-2 underline underline-offset-4')
  expect(fast).toContain('aria-expanded={showRest} className="min-h-11 w-full text-label text-ink-2"')
  expect(regular).toContain('text-label text-ink-2 underline underline-offset-4')
  expect(page).not.toContain('function ProjectLink(')
  expect(page).not.toContain('<section aria-label="Projects"')
 })
})
