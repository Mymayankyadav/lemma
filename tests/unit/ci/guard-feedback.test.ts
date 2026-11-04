import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
// @ts-expect-error plain ESM script
import {renderFeedback,summaryOf,fastGateItems,hintFor,marker,isSuperseded} from '../../../scripts/ci/feedback.mjs'

describe('gate feedback for agents that cannot read logs',()=>{
 it('renders the failing rules as one marked comment and the same text as the check summary',()=>{
  const items=['[PROTECTED-PATH] This PR changes protected path(s): AGENTS.md. To comply: remove them.']
  const text=renderFeedback({gate:'scope',sha:'0123456789abcdef',ok:false,items})
  expect(text.startsWith(marker('scope'))).toBe(true)
  expect(text).toContain('scope: FAILED on `0123456`')
  expect(text).toContain('- [PROTECTED-PATH]')
  expect(text).toContain('To comply:')
  expect(summaryOf(text)).not.toContain('<!--')
  expect(summaryOf(text)).toContain('[PROTECTED-PATH]')
 })
 it('the merge status comment does not claim a check summary',()=>{
  const t=renderFeedback({gate:'merge',sha:'abcdef0123',ok:false,items:['x']})
  expect(t).not.toContain('check summary')
  expect(t).not.toContain('output summary')
 })
 it('the same comment is rewritten when the gate passes again',()=>{
  const text=renderFeedback({gate:'scope',sha:'abcdef0123',ok:true})
  expect(text.startsWith(marker('scope'))).toBe(true)
  expect(text).toContain('passes on `abcdef0`')
  expect(marker('scope')).not.toBe(marker('fast-gate'))
 })
 it('fast-gate: names each failed job and step with how to fix it, plus the failing test signatures',()=>{
  const jobs=[
   {name:'typecheck-lint',conclusion:'success',steps:[]},
   {name:'unit-affected',conclusion:'failure',steps:[{name:'Set up job',conclusion:'success'},{name:'Unit tests (affected)',conclusion:'failure'}]},
   {name:'e2e-affected-2-of-4',conclusion:'failure',steps:[]},
   {name:'fast-gate',conclusion:'failure',steps:[]},
   {name:'report',conclusion:'skipped',steps:[]}]
  const items=fastGateItems({jobs,signatures:['unit/tests/unit/a.test.ts::x :: expected 1']})
  expect(items).toHaveLength(3)
  expect(items[0]).toContain('`unit-affected` failed at step "Unit tests (affected)"')
  expect(items[0]).toContain('npx vitest run')
  expect(items[1]).toContain('npx playwright test')
  expect(items[2]).toContain('unit/tests/unit/a.test.ts::x :: expected 1')
  expect(hintFor('mystery')).toContain('first error')
  expect(fastGateItems({jobs:[{name:'fast-gate',conclusion:'failure'}]})[0]).toContain('no job reports a failure')
 })
 it('a run cancelled by a newer push writes no failure feedback',()=>{
  const jobs=[{name:'e2e-affected-1-of-4',conclusion:'cancelled'},{name:'typecheck-lint',conclusion:'success'},{name:'fast-gate',conclusion:'failure'}]
  expect(isSuperseded(jobs)).toBe(true)
  expect(fastGateItems({jobs,signatures:[]})[0]).toContain('no job reports a failure')
  expect(isSuperseded([...jobs,{name:'unit-affected',conclusion:'failure'}])).toBe(false)
  expect(isSuperseded([{name:'unit-affected',conclusion:'failure'}])).toBe(false)
 })
 it('the workflows grant what the feedback needs and write it after the gate finishes',()=>{
  const gate=readFileSync('.github/workflows/pr-gate.yml','utf8')
  expect(gate).toMatch(/feedback:\n[\s\S]*needs: \[fast-gate\][\s\S]*checks: write/)
  expect(gate).toContain('node scripts/ci/fast-gate-feedback.mjs')
  const scope=readFileSync('.github/workflows/scope.yml','utf8')
  expect(scope).toContain('issues: write')
  expect(scope).toContain('checks: write')
 })
})
