import {describe,expect,it} from 'vitest'
import {readFileSync,existsSync} from 'node:fs'
// @ts-expect-error plain ESM script
import {evaluateScope,addsCurrentSection,CURRENT_NOTE_CUTOVER} from '../../../scripts/ci/scope.mjs'

const NEXT='# NEXT\n\n## N8 Top\nDone = y\nScope: a\nNot: b\n\n## N9 Other\nDone = z\n'
const PROT={paths:['AGENTS.md','.github/**','ci/**','scripts/ci/**'],testGlobs:['tests/**']}
const appended={filename:'CURRENT.md',status:'modified',patch:'@@ -1,2 +1,5 @@\n x\n+\n+## N8 thing\n+what it does'}
const corrected={filename:'CURRENT.md',status:'modified',patch:'@@ -3,2 +3,2 @@\n ## N7 old\n-wrong\n+right'}
const note={filename:'docs/current/N8.md',status:'added',patch:'@@\n+## N8 thing\n+what it does'}
const code=[{filename:'src/a.ts',status:'modified',patch:'@@\n+x'},{filename:'tests/unit/a.test.ts',status:'added',patch:'@@\n+it("x",()=>{})'}]
const ctx=(files:any[],createdAt='2026-11-07T16:00:00Z',title='N8 thing',body='Agent: lemma-1 · Item: N8\n\nbody')=>({title,body,
 files:[...code,...files],baseNext:NEXT,headNext:NEXT.replace(/## N8 [\s\S]*?\n\n/,''),openPrs:[],protectedCfg:PROT,now:new Date('2026-11-07T17:00:00Z'),createdAt})
const rules=(c:any)=>evaluateScope(c).failures.map((f:any)=>f.rule)

describe('v2.6 item notes in docs/current, not appended to CURRENT.md',()=>{
 it('detects a new CURRENT.md section, not an in-place correction or a too-large diff',()=>{
  expect(addsCurrentSection([appended])).toBe(true)
  expect(addsCurrentSection([corrected])).toBe(false)
  expect(addsCurrentSection([{filename:'CURRENT.md',status:'modified'}])).toBe(false)
  expect(addsCurrentSection([note])).toBe(false)
 })
 it('fails a new PR that appends to CURRENT.md and tells it where the note goes',()=>{
  const f=evaluateScope(ctx([appended])).failures.find((x:any)=>x.rule==='CURRENT-NOTE')
  expect(f).toBeTruthy()
  expect(f.msg).toMatch(/docs\/current\/N8\.md/)
 })
 it('passes the same PR with a docs/current note, or a correction in place',()=>{
  expect(rules(ctx([note]))).not.toContain('CURRENT-NOTE')
  expect(rules(ctx([note,corrected]))).not.toContain('CURRENT-NOTE')
 })
 it('PRs opened before the cutover keep the old way; rules and CI PRs are exempt',()=>{
  expect(rules(ctx([appended],'2026-11-07T14:00:00Z'))).not.toContain('CURRENT-NOTE')
  expect(CURRENT_NOTE_CUTOVER).toBe('2026-11-07T15:30:00Z')
  expect(rules(ctx([appended],'2026-11-07T16:00:00Z','rules: x','Agent: owner-setup · Item: rules\n\nb'))).not.toContain('CURRENT-NOTE')
 })
 it('bug PRs name a bug note',()=>{
  const c=ctx([appended],'2026-11-07T16:00:00Z','bug #1109 fix undo','Agent: lemma-1 · Item: bug #1109\n\nb')
  const f=evaluateScope(c).failures.find((x:any)=>x.rule==='CURRENT-NOTE')
  if(f)expect(f.msg).toMatch(/docs\/current\/bug-1109\.md/)
 })
 it('AGENTS.md, CURRENT.md and docs/current/README.md describe the convention',()=>{
  const md=readFileSync('AGENTS.md','utf8')
  expect(md).toContain('Read CURRENT.md, the notes in docs/current/ and NEXT.md')
  expect(md).toContain('Never add a section to CURRENT.md')
  expect(md).not.toContain('update CURRENT.md in the same PR')
  expect(readFileSync('CURRENT.md','utf8').slice(0,400)).toContain('docs/current/')
  expect(existsSync('docs/current/README.md')).toBe(true)
 })
})
