import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {splitSections,resolveHunk,resolveDiff3,mergeSections,effectiveHeadDate,verifiesBookkeeping,COMMIT_PREFIX} from '../../../scripts/ci/bookkeeping.mjs'
// @ts-expect-error plain ESM script
import {planFor} from '../../../scripts/ci/autoresolve.mjs'
// @ts-expect-error plain ESM script
import {botTokenViolations} from '../../../scripts/ci/lib.mjs'

const doc=(...secs:string[])=>'# Title\n\nIntro.\n\n'+secs.map((s)=>`## ${s}\n${s} body.\n`).join('\n')

describe('v1.9 bookkeeping merge: sections',()=>{
 it('splits at ## headings, keeps a closing "(…)" note separate, and rejoins exactly',()=>{
  const t='# T\n\n## A\na\n\n## B\nb\n\n\n(Next free ID: N15.)\n'
  const s=splitSections(t)
  expect(s.map((x:any)=>x.key)).toEqual(['\u0000pre','## A','## B','\u0000trailer'])
  expect(s.map((x:any)=>x.text).join('')).toBe(t)
 })
 it('both sides appended a section at the end (the #888 case): keeps main\'s, then the PR\'s',()=>{
  const base=doc('A','B'), main=doc('A','B','N14.1 Focus'), pr=doc('A','B','N11.3 undo')
  const r=mergeSections(base,pr,main)
  expect(r.error).toBeUndefined()
  expect(r.text).toBe(doc('A','B','N14.1 Focus','N11.3 undo'))
 })
 it('adjacent deletions and a PR insertion in the middle (NEXT.md items)',()=>{
  const base=doc('N1','N2','N3','N4'), main=doc('N1','N3','N4'), pr=doc('N1','N2','N2.2','N4')
  expect(mergeSections(base,pr,main).text).toBe(doc('N1','N2.2','N4'))
 })
 it('keeps the closing note last',()=>{
  const base='# T\n\n## A\na\n\n(note)\n', main='# T\n\n## A\na\n\n## B\nb\n\n(note)\n', pr='# T\n\n## A\na\n\n## C\nc\n\n(note)\n'
  expect(mergeSections(base,pr,main).text).toBe('# T\n\n## A\na\n\n## B\nb\n\n## C\nc\n\n(note)\n')
 })
 it('refuses a section deleted on one side and changed on the other',()=>{
  const base=doc('A','B'), main=doc('A'), pr=doc('A','B').replace('B body.','B changed.')
  expect(mergeSections(base,pr,main).error).toContain('"## B" was deleted on one side and changed on the other')
 })
 it('refuses the same line edited differently on both sides',()=>{
  const base=doc('A'), main=doc('A').replace('A body.','A main.'), pr=doc('A').replace('A body.','A pr.')
  expect(mergeSections(base,pr,main).error).toContain('"## A" was edited differently on both sides')
 })
 it('merges two additions inside one section (two new table rows) with git',()=>{
  const base='# T\n\n## F\n| a | 1 |\n| b | 2 |\n', main='# T\n\n## F\n| a | 1 |\n| b | 2 |\n| c | 3 |\n', pr='# T\n\n## F\n| a | 1 |\n| b | 2 |\n| d | 4 |\n'
  expect(mergeSections(base,pr,main).text).toBe('# T\n\n## F\n| a | 1 |\n| b | 2 |\n| c | 3 |\n| d | 4 |\n')
 })
 it('hunk rule: additions only',()=>{
  expect(resolveHunk({ours:['x'],base:[],theirs:['y']})).toEqual(['y','x'])
  expect(resolveHunk({ours:['b','x'],base:['b'],theirs:['b','y']})).toEqual(['b','y','x'])
  expect(resolveHunk({ours:['x','b'],base:['b'],theirs:['y','b']})).toEqual(['y','x','b'])
  expect(resolveHunk({ours:['x'],base:['b'],theirs:['y']})).toBeNull()
  expect(resolveDiff3('a\n<<<<<<< ours\nx\n||||||| base\n=======\ny\n>>>>>>> theirs\nz\n')).toBe('a\ny\nx\nz\n')
  expect(resolveDiff3('<<<<<<< ours\nx\n||||||| base\nb\n=======\ny\n>>>>>>> theirs\n')).toBeNull()
 })
})

describe('v1.9 autoresolve plan and verification',()=>{
 it('resolves only when every conflicted file is CURRENT.md or NEXT.md',()=>{
  expect(planFor(['CURRENT.md']).action).toBe('resolve')
  expect(planFor(['CURRENT.md','NEXT.md']).action).toBe('resolve')
  expect(planFor(['CURRENT.md','src/a.ts'])).toEqual({action:'author',why:'conflicts outside bookkeeping files: src/a.ts'})
  expect(planFor([]).action).toBe('skip')
 })
 it('Ready and approvals are measured against the newest commit that is not a verified CI merge',()=>{
  const c=(sha:string,date:string)=>({sha,commit:{committer:{date}}})
  const commits=[c('a','2026-11-06T01:00:00Z'),c('b','2026-11-06T02:00:00Z'),c('m','2026-11-06T03:00:00Z')]
  expect(effectiveHeadDate(commits,new Set(['m']))).toBe(Date.parse('2026-11-06T02:00:00Z'))
  expect(effectiveHeadDate(commits,new Set())).toBe(Date.parse('2026-11-06T03:00:00Z'))
 })
 it('only a successful bookkeeping-merge check run from the Actions app verifies a commit',()=>{
  expect(verifiesBookkeeping([{name:'bookkeeping-merge',app:{slug:'github-actions'},conclusion:'success'}])).toBe(true)
  expect(verifiesBookkeeping([{name:'bookkeeping-merge',app:{slug:'some-app'},conclusion:'success'}])).toBe(false)
  expect(verifiesBookkeeping([{name:'bookkeeping-merge',app:{slug:'github-actions'},conclusion:'failure'}])).toBe(false)
  expect(verifiesBookkeeping([])).toBe(false)
  expect(COMMIT_PREFIX).toBe('ci: merge main (bookkeeping only:')
 })
 it('the workflow runs on the default branch with the bot token, never on pull_request',()=>{
  const y=readFileSync('.github/workflows/autoresolve.yml','utf8')
  expect(y).toContain('ref: ${{ github.event.repository.default_branch }}')
  expect(y).toContain('checks: write')
  expect(y).toContain('node scripts/ci/autoresolve.mjs')
  expect(y).not.toMatch(/^\s{2}pull_request(_target)?:/m)
  const files=['ci.yml','review-merge.yml','calibrate.yml','autoresolve.yml'].map((n)=>({name:n,text:readFileSync('.github/workflows/'+n,'utf8')}))
  expect(botTokenViolations(files)).toEqual([])
 })
})
