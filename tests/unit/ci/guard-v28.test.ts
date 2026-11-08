import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
// @ts-expect-error plain ESM script
import {issueClosedByMerge} from '../../../scripts/ci/approve.mjs'

describe('v2.8 merging a bug or incident fix closes its issue (#1149)',()=>{
 it('names the issue for bug and incident PRs only',()=>{
  expect(issueClosedByMerge('incident #1149 prevent duplicate approval')).toBe(1149)
  expect(issueClosedByMerge('bug #1110 guard fixture')).toBe(1110)
  expect(issueClosedByMerge('N41 presets')).toBeNull()
  expect(issueClosedByMerge('rules: x')).toBeNull()
  expect(issueClosedByMerge('revert #12')).toBeNull()
 })
 it('closes right after the squash merge, never before, and does not fail the merge if closing fails',()=>{
  const src=readFileSync('scripts/ci/approve.mjs','utf8')
  const merged=src.indexOf("squash-merged`)")
  const close=src.indexOf("state: 'closed', state_reason: 'completed'")
  expect(merged).toBeGreaterThan(0)
  expect(close).toBeGreaterThan(merged)
  expect(src.slice(merged,close)).toMatch(/try \{/)
  expect(readFileSync('AGENTS.md','utf8')).toContain('it closes issue #<n> (v2.8)')
 })
})
