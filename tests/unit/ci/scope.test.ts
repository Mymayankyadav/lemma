import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {evaluateScope,classifyTitle} from '../../../scripts/ci/scope.mjs'

const NEXT='# NEXT\n\n## N1 Fix deployment\nStage: Stable\nDone = x\nScope: a\nNot: b\n\n## N2 Other\nDone = y\n\n(More items are added by the priority run.)\n'
const NOW=new Date('2026-11-04T08:00:00Z')
const PROT={paths:['AGENTS.md','.github/**','ci/**','scripts/ci/**','scripts/stress-limits.ts','vitest.config.ts'],testGlobs:[]}
const line1=(agent='codex-1')=>`Agent: ${agent} · Item: N1\n\nbody`
const base=(over={})=>({title:'N1 fix it',body:line1(),files:[{filename:'src/a.ts',status:'modified',patch:'@@\n+x'}],baseNext:NEXT,headNext:NEXT,openPrs:[],protectedCfg:PROT,now:NOW,...over})
const rules=(ctx:any)=>evaluateScope(ctx).failures.map((f:any)=>f.rule)

describe('scope check',()=>{
 it('classifies titles',()=>{
  expect(classifyTitle('N2 split').split).toBe(true)
  expect(classifyTitle('N2.1 thing').id).toBe('2.1')
  expect(classifyTitle('bug #12 fix').number).toBe(12)
  expect(classifyTitle('incident #7 fix').kind).toBe('incident')
  expect(classifyTitle('revert #5').numbers).toEqual([5])
  expect(classifyTitle('revert #5 #6').numbers).toEqual([5,6])
  expect(classifyTitle('rules: guardrails v1').kind).toBe('rules')
  expect(classifyTitle('ci: perf calibration 2026-11-04').kind).toBe('calibration')
  expect(classifyTitle('Fix stuff').kind).toBeNull()
 })
 it('passes a clean item PR',()=>expect(rules(base())).toEqual([]))
 it('fails a bad title and a bad body line 1, with actionable messages',()=>{
  const r=evaluateScope(base({title:'fix things',body:'hello'}))
  expect(r.failures.map((f:any)=>f.rule)).toEqual(['TITLE','BODY-LINE-1'])
  expect(r.failures[0].msg).toContain('To comply:')
 })
 it('line 1 needs no lease; the old lease form is accepted and its value ignored (no LEASE rule any more)',()=>{
  expect(rules(base({body:'Agent: a · Item: N1'}))).toEqual([])
  expect(rules(base({body:'Agent: a · Item: N1 · Lease until 2026-11-04T13:00:00Z'}))).toEqual([])
  expect(rules(base({body:'Agent: a · Item: N1 · Lease until 2027-01-01T00:00:00Z'}))).toEqual([])
  const r=evaluateScope(base({body:'Agent: a'}))
  expect(r.failures.map((f:any)=>f.rule)).toEqual(['BODY-LINE-1'])
  expect(r.failures[0].msg).toContain('Agent: <name> · Item: <id>')
 })
 it('rejects an N id that is not in NEXT.md, unless it is an Owner task adding that item',()=>{
  expect(rules(base({title:'N9 new thing'}))).toContain('ITEM-ID')
  const ownerBody=line1()+'\nOwner task: "do the thing"'
  const headNext=NEXT.replace('## N2 Other','## N9 New\nDone = z\n\n## N2 Other')
  expect(rules(base({title:'N9 new thing',body:ownerBody,headNext,files:[{filename:'NEXT.md',status:'modified',patch:'@@\n+## N9 New'}]}))).toEqual([])
 })
 it('bug and incident PRs need matching issue labels',()=>{
  expect(rules(base({title:'bug #12 x',issue:{state:'open',isPr:false,labels:['bug']}}))).toContain('ISSUE-LABELS')
  expect(rules(base({title:'bug #12 x',issue:{state:'open',isPr:false,labels:['bug','confirmed']}}))).toEqual([])
  expect(rules(base({title:'incident #7 x',issue:{state:'closed',isPr:false,labels:['incident']}}))).toContain('ISSUE-STATE')
  expect(rules(base({title:'bug #12 x',issue:null}))).toContain('ISSUE')
 })
 it('limits: one PR per agent and at most 6 open PRs (CI exempt)',()=>{
  const open=(n:number,agent:string)=>({number:n,body:`Agent: ${agent} · Item: N1 · Lease until 2026-11-04T09:00:00Z`})
  expect(rules(base({openPrs:[open(2,'codex-1')]}))).toContain('ONE-PR-PER-AGENT')
  expect(rules(base({openPrs:[1,2,3,4,5,6].map((n)=>open(n,'a'+n))}))).toContain('MAX-OPEN-PRS')
  expect(rules(base({body:'Agent: ci · Item: N1 · Lease until 2026-11-04T09:00:00Z',openPrs:[1,2,3,4,5,6].map((n)=>open(n,'a'+n))}))).toEqual([])
 })
 it('protected paths, deleted tests and skipped tests fail unless titled rules:',()=>{
  expect(rules(base({files:[{filename:'AGENTS.md',status:'modified',patch:'@@\n+x'}]}))).toContain('PROTECTED-PATH')
  expect(rules(base({files:[{filename:'scripts/stress-limits.ts',status:'modified',patch:'@@\n+x'}]}))).toContain('PROTECTED-PATH')
  expect(rules(base({files:[{filename:'tests/unit/a.test.ts',status:'removed'}]}))).toContain('TEST-DELETED')
  expect(rules(base({files:[{filename:'tests/unit/a.test.ts',status:'modified',patch:'@@\n+it.skip("x",()=>{})'}]}))).toContain('TEST-SKIPPED')
  expect(rules(base({files:[{filename:'tests/e2e/a.spec.ts',status:'added',patch:'@@\n+test.fixme("x")'}]}))).toContain('TEST-SKIPPED')
  expect(rules(base({title:'rules: x',files:[{filename:'AGENTS.md',status:'modified',patch:'@@\n+x'},{filename:'tests/unit/a.test.ts',status:'removed'}]}))).toEqual([])
 })
 it('a dropped expect( count is only a warning for the reviewer',()=>{
  const r=evaluateScope(base({files:[{filename:'tests/unit/a.test.ts',status:'modified',patch:'@@\n-  expect(a).toBe(1)\n-  expect(b).toBe(2)\n+  expect(a).toBe(1)'}]}))
  expect(r.failures).toEqual([])
  expect(r.warnings[0]).toContain('tests/unit/a.test.ts')
 })
 it('NEXT.md: an item PR may only remove its own item; others change fails',()=>{
  const file={filename:'NEXT.md',status:'modified',patch:'@@\n-x'}
  const without=(id:string)=>NEXT.replace(new RegExp(`## N${id}[\\s\\S]*?(?=\\n## N|\\n\\()`),'')
  expect(rules(base({headNext:without('1'),files:[file]}))).toEqual([])
  expect(rules(base({headNext:without('2'),files:[file]}))).toContain('NEXT-MD')
  expect(rules(base({headNext:NEXT.replace('Done = x','Done = changed'),files:[file]}))).toContain('NEXT-MD')
  expect(rules(base({title:'bug #3 x',issue:{state:'open',isPr:false,labels:['bug','confirmed']},headNext:without('1'),files:[file]}))).toContain('NEXT-MD')
 })
 it('N<id> split: own item replaced by sub-items with Done/Scope/Not AND sub-item .1 implemented (code plus test) in the same PR',()=>{
  const sub=(id:string)=>`## N${id} part\nDone = a\nScope: s\nNot: n\n\n`
  const headNext=NEXT.replace(/## N1[\s\S]*?\n\n## N2/,sub('1.2')+sub('1.3')+'## N2')
  const file={filename:'NEXT.md',status:'modified',patch:'@@\n-x'}
  const code={filename:'src/a.ts',status:'modified',patch:'@@\n+x'}
  const test={filename:'tests/unit/a.test.ts',status:'added',patch:'@@\n+it("x",()=>{})'}
  const note={filename:'CURRENT.md',status:'modified',patch:'@@\n+x'}
  expect(rules(base({title:'N1 split',headNext,files:[file,code,test]}))).toEqual([])
  // the sub-item may be test + the CURRENT.md note its Done asks for, when the test passes on main
  expect(rules(base({title:'N1 split',headNext,files:[file,note,test]}))).toEqual([])
  // NEXT.md only: scope fails with a clear message
  const only=evaluateScope(base({title:'N1 split',headNext,files:[file]}))
  expect(only.failures.map((f:any)=>f.rule)).toEqual(['SPLIT-IMPLEMENTS'])
  expect(only.failures[0].msg).toContain('must also implement sub-item N1.1')
  expect(only.failures[0].msg).toContain('To comply:')
  expect(rules(base({title:'N1 split',headNext,files:[file,code]}))).toContain('SPLIT-IMPLEMENTS')
  expect(rules(base({title:'N1 split',headNext,files:[file,test]}))).toContain('SPLIT-IMPLEMENTS')
  // the sub-items still need Done/Scope/Not, and the other items stay untouched
  expect(rules(base({title:'N1 split',headNext:headNext.replace('Scope: s\n',''),files:[file,code,test]}))).toContain('NEXT-MD')
  expect(rules(base({title:'N1 split',headNext:headNext.replace('Done = y','Done = z'),files:[file,code,test]}))).toContain('NEXT-MD')
 })
 it('revert PRs from Agent: ci: Reverted: lines and restored items only; files limited to the reverted PR',()=>{
  const ciBody='Agent: ci · Item: revert · Lease until 2026-11-04T09:30:00Z'
  const targets={5:{files:['src/a.ts','NEXT.md'],nextPatch:'@@\n-## N1 Fix deployment\n-Done = x'}}
  const ok=base({title:'revert #5',body:ciBody,revertTargets:targets,files:[{filename:'src/a.ts',status:'modified',patch:'@@\n+y'},{filename:'NEXT.md',status:'modified',patch:'@@\n+## N1 Fix deployment\n+Done = x\n+Reverted: 2026-11-04 — sig'}]})
  expect(rules(ok)).toEqual([])
  expect(rules({...ok,files:[...ok.files,{filename:'src/other.ts',status:'modified',patch:'@@\n+z'}]})).toContain('REVERT-SCOPE')
  expect(rules({...ok,files:[ok.files[0],{filename:'NEXT.md',status:'modified',patch:'@@\n+## N7 sneaky'}]})).toContain('NEXT-MD')
  expect(rules({...ok,revertTargets:{}})).toContain('REVERT-TARGET')
  expect(rules({...ok,files:[{filename:'src/a.ts',status:'removed'},{filename:'tests/unit/new.test.ts',status:'removed'}],revertTargets:{5:{files:['src/a.ts','tests/unit/new.test.ts']}}})).toEqual([])
 })
 it('calibration PRs: Agent: ci and ci/perf-calibration.md only',()=>{
  const ci='Agent: ci · Item: calibration · Lease until 2026-11-04T09:30:00Z'
  const f=(name:string)=>({filename:name,status:'modified',patch:'@@\n+x'})
  expect(rules(base({title:'ci: perf calibration',body:ci,files:[f('ci/perf-calibration.md')]}))).toEqual([])
  expect(rules(base({title:'ci: perf calibration',body:ci,files:[f('ci/perf-calibration.md'),f('src/a.ts')]}))).toContain('CALIBRATION')
  expect(rules(base({title:'ci: perf calibration',files:[f('ci/perf-calibration.md')]}))).toContain('CALIBRATION')
 })
})
