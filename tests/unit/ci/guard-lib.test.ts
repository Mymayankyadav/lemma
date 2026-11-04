import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {matches,matchesAny,parseNext,diffNext,patchLines,addsSkipOnly,countExpects,isTestFile} from '../../../scripts/ci/lib.mjs'
// @ts-expect-error plain ESM script
import {parseLine1} from '../../../scripts/ci/gh.mjs'
// @ts-expect-error plain ESM script
import {commentAgent} from '../../../scripts/ci/lib.mjs'

const NEXT=`# NEXT

## N1 Fix deployment
Stage: Stable · Status: open · Needs: — · Assigned: —
Done = x
Scope: a
Not: b

## N2 Other
Done = y

(More items are added by the priority run.)
`

describe('guardrail helpers',()=>{
 it('globs: ** crosses folders, * does not, patterns without / match the basename',()=>{
  expect(matches('src/ui/a/b.tsx','src/ui/**')).toBe(true)
  expect(matches('src/ui/a.tsx','src/*.tsx')).toBe(false)
  expect(matches('docs/x/y.md','*.md')).toBe(true)
  expect(matchesAny('ci/test-map.json',['.github/**','ci/**'])).toBe(true)
 })
 it('parses NEXT.md items and diffs them',()=>{
  const a=parseNext(NEXT)
  expect([...a.blocks.keys()]).toEqual(['1','2'])
  expect(a.trailer).toContain('priority run')
  const d=diffNext(NEXT,NEXT.replace(/## N1[\s\S]*?\n\n## N2/,'## N2'))
  expect(d.removed).toEqual(['1'])
  expect(d.added).toEqual([])
  expect(d.changed).toEqual([])
  expect(d.otherChanged).toBe(false)
  expect(diffNext(NEXT,NEXT.replace('Done = y','Done = z')).changed).toEqual(['2'])
 })
 it('patch helpers',()=>{
  const p='@@ -1,2 +1,2 @@\n-  expect(a).toBe(1)\n+  expect(a).toBeTruthy()\n+  it.skip("x",()=>{})\n context'
  const {added,removed}=patchLines(p)
  expect(removed).toHaveLength(1)
  expect(addsSkipOnly(added)).toHaveLength(1)
  expect(countExpects(removed)).toBe(1)
  expect(addsSkipOnly(['test.fixme("x")','test.only("y")','const only = 1','describe("skipping")'])).toHaveLength(2)
  expect(isTestFile('tests/e2e/a.spec.ts')).toBe(true)
  expect(isTestFile('src/a.ts')).toBe(false)
 })
 it('parses line 1 of the PR body (v1.3: no lease; the old lease form is still accepted and ignored)',()=>{
  expect(parseLine1('Agent: lemma-3 · Item: N1')).toEqual({agent:'lemma-3',item:'N1',legacyLease:null})
  expect(parseLine1('Agent: lemma-3 · Item: N1\n\nbody')?.item).toBe('N1')
  expect(parseLine1('Agent: lemma-3 · Item: N1 · Lease until 2026-11-04T16:07:00Z')).toEqual({agent:'lemma-3',item:'N1',legacyLease:'2026-11-04T16:07:00Z'})
  expect(parseLine1('Agent: lemma-3 · Item: N1 ·')).toBeNull()
  expect(parseLine1('Agent: lemma-3')).toBeNull()
  expect(parseLine1('Agent: codex-1 · Item: N1 · Lease until 2026-11-04T09:30:00Z\nmore')?.agent).toBe('codex-1')
  expect(parseLine1('Agent: ci · Item: revert · Lease until 2026-11-04T09:30:00+05:30')?.agent).toBe('ci')
  expect(parseLine1('Agent: a · Item: N1 · Lease until tomorrow')).toBeNull()
  expect(parseLine1('Hello\nAgent: a · Item: N1 · Lease until 2026-11-04T09:30:00Z')).toBeNull()
  expect(parseLine1('')).toBeNull()
 })
 it('names the Agent that wrote a comment',()=>{
  expect(commentAgent('Done: pushed\nPending: -\nNext: -\nAgent: lemma-1')).toBe('lemma-1')
  expect(commentAgent('Approve · Agent: lemma-2')).toBe('lemma-2')
  expect(commentAgent('Changes requested · Agent: lemma-2: fix the test')).toBe('lemma-2')
  expect(commentAgent('No progress: · Agent: lemma-4 · tried X')).toBe('lemma-4')
  expect(commentAgent('Taking over: Agent lemma-5')).toBe('lemma-5')
  expect(commentAgent('just chatting')).toBeNull()
  expect(commentAgent('')).toBeNull()
 })
})
