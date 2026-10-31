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
  expect(shouldUseFastGoals([...Array.from({length:4},()=>project()),project('planning')])).toBe(true)
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
})
