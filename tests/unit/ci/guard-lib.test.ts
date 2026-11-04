import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {matches,matchesAny,parseNext,diffNext,patchLines,addsSkipOnly,countExpects,isTestFile} from '../../../scripts/ci/lib.mjs'
// @ts-expect-error plain ESM script
import {parseLine1} from '../../../scripts/ci/gh.mjs'

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
 it('parses line 1 of the PR body',()=>{
  expect(parseLine1('Agent: codex-1 · Item: N1 · Lease until 2026-11-04T09:30:00Z\nmore')?.agent).toBe('codex-1')
  expect(parseLine1('Agent: ci · Item: revert · Lease until 2026-11-04T09:30:00+05:30')?.agent).toBe('ci')
  expect(parseLine1('Agent: a · Item: N1 · Lease until tomorrow')).toBeNull()
  expect(parseLine1('Hello\nAgent: a · Item: N1 · Lease until 2026-11-04T09:30:00Z')).toBeNull()
  expect(parseLine1('')).toBeNull()
 })
})
