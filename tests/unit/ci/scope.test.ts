import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {evaluateScope,classifyTitle} from '../../../scripts/ci/scope.mjs'
// @ts-expect-error plain ESM script
import {checkSession,touchSession,lockMessage} from '../../../scripts/ci/sessions.mjs'

const NEXT='# NEXT\n\n## N1 Fix deployment\nStage: Stable\nDone = x\nScope: a\nNot: b\n\n## N2 Other\nDone = y\n\n(More items are added by the priority run.)\n'
const NOW=new Date('2026-11-04T08:00:00Z')
const PROT={paths:['AGENTS.md','.github/**','ci/**','scripts/ci/**','scripts/stress-limits.ts','vitest.config.ts'],testGlobs:[]}
const line1=(agent='lemma-1')=>`Agent: ${agent} · Item: N1\n\nbody`
// v1.7: an item PR removes its own item from NEXT.md (NEXT-MD-DONE), so the default head has N1 removed
const NEXT_DONE=NEXT.replace(/## N1[\s\S]*?(?=\n## N)/,'')
const base=(over={})=>({title:'N1 fix it',body:line1(),files:[{filename:'src/a.ts',status:'modified',patch:'@@\n+x'}],baseNext:NEXT,headNext:NEXT_DONE,openPrs:[],protectedCfg:PROT,now:NOW,...over})
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
  expect(rules(base({body:'Agent: lemma-9 · Item: N1'}))).toEqual([])
  expect(rules(base({body:'Agent: lemma-9 · Item: N1 · Lease until 2026-11-04T13:00:00Z'}))).toEqual([])
  expect(rules(base({body:'Agent: lemma-9 · Item: N1 · Lease until 2027-01-01T00:00:00Z'}))).toEqual([])
  const r=evaluateScope(base({body:'Agent: lemma-9'}))
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
  expect(rules(base({openPrs:[open(2,'lemma-1')]}))).not.toContain('ONE-PR-PER-AGENT') // v2.0: 2 per agent
  expect(rules(base({openPrs:[open(2,'lemma-1'),open(3,'lemma-1')]}))).toContain('ONE-PR-PER-AGENT')
  expect(rules(base({openPrs:[1,2,3,4,5,6,7,8,9,10,11].map((n)=>open(n,'lemma-'+(10+n)))}))).not.toContain('MAX-OPEN-PRS')
  expect(rules(base({openPrs:[1,2,3,4,5,6,7,8,9,10,11,12].map((n)=>open(n,'lemma-'+(10+n)))}))).toContain('MAX-OPEN-PRS')
  expect(rules(base({body:'Agent: ci · Item: N1 · Lease until 2026-11-04T09:00:00Z',openPrs:[1,2,3,4,5,6].map((n)=>open(n,'lemma-'+(10+n)))}))).toEqual([])
 })
 it('one PR per item: a second PR for an Item that already has an open PR fails',()=>{
  const open=(n:number,agent:string,item:string)=>({number:n,body:`Agent: ${agent} · Item: ${item}`})
  const r=evaluateScope(base({body:'Agent: lemma-1 · Item: N2',openPrs:[open(5,'lemma-2','N2')]}))
  expect(r.failures.map((f:any)=>f.rule)).toEqual(['ONE-PR-PER-ITEM'])
  expect(r.failures[0].msg).toContain('#5')
  expect(r.failures[0].msg).toContain('push commits to the existing PR')
  expect(rules(base({body:'Agent: lemma-1 · Item: N2',openPrs:[open(5,'lemma-2','N3')]}))).toEqual([])
  // CI PRs and the Owner's rules item are exempt
  expect(rules(base({body:'Agent: ci · Item: N2',openPrs:[open(5,'lemma-2','N2')]}))).toEqual([])
  expect(rules(base({title:'rules: x',body:'Agent: owner-setup · Item: rules',openPrs:[open(5,'owner-setup-2','rules')]}))).toEqual([])
 })
 it('agent names: an invalid name fails with the valid formats; identities compare by key',()=>{
  const r=evaluateScope(base({body:'Agent: ChatGPT · Item: N1'}))
  expect(r.failures.map((f:any)=>f.rule)).toEqual(['AGENT-NAME'])
  expect(r.failures[0].msg).toContain('chat-<n>#<tag>')
  expect(rules(base({body:'Agent: chat-2#k7q3 · Item: N1'}))).toEqual([])
  expect(rules(base({body:'Agent: chat-2 · Item: N1'}))).toContain('AGENT-NAME')
  // the same chat session twice is the same agent; two sessions on one number are two agents
  const open=(n:number,agent:string)=>({number:n,body:`Agent: ${agent} · Item: N${n}`})
  expect(rules(base({body:'Agent: chat-2#k7q3 · Item: N1',openPrs:[open(5,'chat-2#k7q3'),open(6,'chat-2#k7q3')]}))).toContain('ONE-PR-PER-AGENT')
  expect(rules(base({body:'Agent: chat-2#k7q3 · Item: N1',openPrs:[open(5,'chat-2#zzzz')]}))).not.toContain('ONE-PR-PER-AGENT')
 })
 it('session lock: a second tag on a chat number within 3 hours fails with the explanation',()=>{
  const sessions={'chat-2':{tag:'aaaa',seen:'2026-11-04T07:00:00Z'}}
  const r=evaluateScope(base({body:'Agent: chat-2#bbbb · Item: N1',sessions}))
  expect(r.failures.map((f:any)=>f.rule)).toEqual(['SESSION-LOCK'])
  expect(r.failures[0].msg).toContain('chat-2 is in use by session aaaa until 2026-11-04T10:00:00.000Z; pick another number')
  expect(rules(base({body:'Agent: chat-2#aaaa · Item: N1',sessions}))).toEqual([])
  expect(rules(base({body:'Agent: chat-2#bbbb · Item: N1',sessions:{'chat-2':{tag:'aaaa',seen:'2026-11-04T04:59:00Z'}}}))).toEqual([])
  expect(rules(base({body:'Agent: chat-3#bbbb · Item: N1',sessions}))).toEqual([])
  expect(rules(base({body:'Agent: lemma-2 · Item: N1',sessions}))).toEqual([])
 })
 it('the session registry is plain data: check, touch, lock message',()=>{
  const map:any={}
  const t=new Date('2026-11-04T08:00:00Z').getTime()
  expect(checkSession(map,'chat-2#aaaa',t).ok).toBe(true)
  expect(touchSession(map,'chat-2#aaaa',t)).toBe(true)
  expect(touchSession(map,'chat-2#aaaa',t-1000)).toBe(false)
  expect(touchSession(map,'lemma-1',t)).toBe(false)
  const lock=checkSession(map,'chat-2#bbbb',t+3600e3)
  expect(lock.ok).toBe(false)
  expect(lockMessage(lock)).toBe('chat-2 is in use by session aaaa until 2026-11-04T11:00:00.000Z; pick another number')
  expect(checkSession(map,'chat-2#bbbb',t+3*3600e3).ok).toBe(true)
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
 it('N<id> split (v1.6): other items may only have Needs: N<id> rewritten to sub-items, and none may be left needing N<id> (#866)',()=>{
  const B='# NEXT\n\n## N1 Fix\nStage: Build · Status: open · Needs: — · Assigned: —\nDone = x\nScope: a\nNot: b\n\n## N2 Other\nStage: Build · Status: open · Needs: N9, N1 · Assigned: —\nDone = y\n\n(More items are added by the priority run.)\n'
  const sub=(id:string,needs='—')=>`## N${id} part\nStage: Build · Status: open · Needs: ${needs} · Assigned: —\nDone = a\nScope: s\nNot: n\n\n`
  const split=(n2:string)=>B.replace(/## N1[\s\S]*?\n\n## N2/,sub('1.2')+sub('1.3','N1.2')+'## N2').replace('Needs: N9, N1 ·',`Needs: ${n2} ·`)
  const file={filename:'NEXT.md',status:'modified',patch:'@@\n-x'}
  const code={filename:'src/a.ts',status:'modified',patch:'@@\n+x'}
  const test={filename:'tests/unit/a.test.ts',status:'added',patch:'@@\n+it("x",()=>{})'}
  const run=(headNext:string)=>evaluateScope(base({title:'N1 split',baseNext:B,headNext,files:[file,code,test]}))
  const r=(h:string)=>run(h).failures.map((f:any)=>f.rule)
  // the reviewer-requested repair passes: N1 -> N1.3, other ids kept
  expect(r(split('N9, N1.3'))).toEqual([])
  expect(r(split('N1.3, N9'))).toEqual([])
  expect(r(split('N9, N1.2, N1.3'))).toEqual([])
  // leaving N2 needing the removed N1 fails, and the message names it
  const left=run(split('N9, N1'))
  expect(left.failures.map((f:any)=>f.rule)).toEqual(['NEXT-MD'])
  expect(left.failures[0].msg).toContain('still needing N1: N2')
  // anything else in another item still fails
  expect(r(split('N1.3'))).toContain('NEXT-MD')                 // dropped N9
  expect(r(split('N9, N1.3, N4'))).toContain('NEXT-MD')         // added an unrelated id
  expect(r(split('N9, N7.2'))).toContain('NEXT-MD')             // not a sub-item of this split
  expect(r(split('N9, N1.3').replace('Done = y','Done = z'))).toContain('NEXT-MD')
  expect(r(split('N9, N1.3').replace('Needs: N9, N1.3 · Assigned: —','Needs: N9, N1.3 · Assigned: lemma-1'))).toContain('NEXT-MD')
  // an item that never needed N1 may not be edited at all
  const B2=B.replace('Needs: N9, N1 ·','Needs: N9 ·')
  expect(evaluateScope(base({title:'N1 split',baseNext:B2,headNext:split('N9, N1.3'),files:[file,code,test]})).failures.map((f:any)=>f.rule)).toContain('NEXT-MD')
  // a non-split item PR still may not touch other items' Needs
  expect(rules(base({baseNext:B,headNext:B.replace(/## N1[\s\S]*?\n\n## N2/,'## N2').replace('Needs: N9, N1 ·','Needs: N9 ·'),files:[file]}))).toContain('NEXT-MD')
 })
 it('v1.7 NEXT-MD-DONE: an item PR must remove its own item; splits, Owner tasks, bugs and rules are exempt',()=>{
  const r=evaluateScope(base({headNext:NEXT}))
  expect(r.failures.map((f:any)=>f.rule)).toEqual(['NEXT-MD-DONE'])
  expect(r.failures[0].msg).toContain('delete the whole "## N1 …" block')
  expect(r.failures[0].msg).toContain('To comply:')
  expect(rules(base())).toEqual([])
  expect(rules(base({title:'bug #3 x',body:'Agent: lemma-1 · Item: bug #3',issue:{state:'open',isPr:false,labels:['bug','confirmed']},headNext:NEXT}))).not.toContain('NEXT-MD-DONE')
  expect(rules(base({title:'rules: x',body:'Agent: owner-setup · Item: rules',headNext:NEXT}))).not.toContain('NEXT-MD-DONE')
  expect(rules(base({body:'Agent: lemma-1 · Item: N1\nOwner task: "do it"',headNext:NEXT}))).not.toContain('NEXT-MD-DONE')
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
