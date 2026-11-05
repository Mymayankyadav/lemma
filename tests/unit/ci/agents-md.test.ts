import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'

const md=readFileSync('AGENTS.md','utf8')
describe('AGENTS.md v1.4 contract',()=>{
 it('is version 1.4 and dated',()=>expect(md.split('\n')[0]).toMatch(/^# Lemma agent rules — version 1\.4 \(2026-11-05\)$/))
 it('has the nine steps in the specified order',()=>{
  const run=md.slice(md.indexOf('## Each run'),md.indexOf('## Claiming and PRs'))
  const steps=[...run.matchAll(/^(\d)\. (.*)$/gm)].map((m)=>[m[1],m[2]])
  expect(steps.map((s)=>s[0])).toEqual(['1','2','3','4','5','6','7','8','9'])
  expect(steps[0][1]).toMatch(/S0 incident/)
  expect(steps[1][1]).toMatch(/failing check or the changes-requested label: fix it/)
  expect(steps[2][1]).toMatch(/Review one PR labelled needs-review that you did not author/)
  expect(steps[3][1]).toMatch(/Continue your own unfinished PR toward its Done.*Ready · Agent: <name>/)
  expect(steps[4][1]).toMatch(/S1 incident/)
  expect(steps[5][1]).toMatch(/bug \+ confirmed/)
  expect(steps[6][1]).toMatch(/top NEXT\.md item.*only if you have no open PR/)
  expect(steps[7][1]).toMatch(/without confirmed/)
  expect(steps[8][1]).toMatch(/end the run/)
  expect(run).toContain('After finishing a step, continue to the next applicable step in the same run.')
 })
 it('states the plan, names, one-PR-per-item and Ready rules',()=>{
  expect(md).toContain('A plan must include every applicable step; leaving one out is recorded.')
  expect(md).toContain('Plan · Agent: <name>: 1) … 2) … 3) …')
  expect(md).toContain('Result: 1) done|skipped because … 2) …')
  expect(md).toContain('Chat agents: at your first run, choose a 4-character tag')
  expect(md).toContain('chat-<n> is in use by session <tag> until <time>; pick another number')
  expect(md).toContain('never open a second PR for the item')
  expect(md).toContain('comment exactly `Ready · Agent: <your name>`')
  expect(md).toContain('Per agent only the latest verdict on the current head counts; duplicates are ignored.')
 })
 it('tells agents nothing about merging, leases or the old label wait',()=>{
  expect(md).not.toMatch(/squash-merge, then|Lease until|do not wait for it/i)
  expect(md).not.toMatch(/^\s*[-\d.]+\s.*\bmerge (it|the PR)\b/im)
 })
})
