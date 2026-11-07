import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
// @ts-expect-error plain ESM script
import {evaluateScope} from '../../../scripts/ci/scope.mjs'
// @ts-expect-error plain ESM script
import {isLeaseExpired,waitingOnCi,LEASE_HOURS} from '../../../scripts/ci/sweep.mjs'

const H=3600e3
const NEXT='# NEXT\n\n## N7.2 Hard part\nDone = x\nScope: a\nNot: b\n\n## N8 Top\nDone = y\nScope: a\nNot: b\n\n## N9 Other\nDone = z\n'
const NOW=new Date('2026-11-07T10:00:00Z')
const PROT={paths:['AGENTS.md','.github/**','ci/**','scripts/ci/**'],testGlobs:[]}
const sub=(id:string)=>`## N${id} part\nDone = a\nScope: s\nNot: n\n\n`
const files=[{filename:'NEXT.md',status:'modified',patch:'@@\n-x'},{filename:'src/a.ts',status:'modified',patch:'@@\n+x'},{filename:'tests/unit/a.test.ts',status:'added',patch:'@@\n+it("x",()=>{})'}]
const ctx=(id:string,agent='lemma-1')=>({title:`N${id} split`,body:`Agent: ${agent} · Item: N${id}\n\nbody`,files,baseNext:NEXT,
 headNext:NEXT.replace(new RegExp(`## N${id.replace('.','\\.')} [\\s\\S]*?\\n\\n(?=## N)`),sub(id+'.2')+sub(id+'.3')),openPrs:[],protectedCfg:PROT,now:NOW})
const rules=(c:any)=>evaluateScope(c).failures.map((f:any)=>f.rule)

describe('v2.4 restrict splitting',()=>{
 it('a top-level item may still be split',()=>expect(rules(ctx('8'))).not.toContain('SPLIT-DEPTH'))
 it('a sub-item may not be split again',()=>{
  const f=evaluateScope(ctx('7.2')).failures.find((x:any)=>x.rule==='SPLIT-DEPTH')
  expect(f?.msg).toMatch(/only a top-level item may be split/)
  expect(f?.msg).toMatch(/finish N7\.2 in it/)
 })
 it('the priority run may still restructure sub-items',()=>expect(rules(ctx('7.2','priority'))).not.toContain('SPLIT-DEPTH'))
 it('finishing a sub-item is unaffected',()=>{
  const c={...ctx('7.2'),title:'N7.2 hard part',headNext:NEXT.replace(/## N7\.2[\s\S]*?\n\n(?=## N)/,'')}
  expect(rules(c)).not.toContain('SPLIT-DEPTH')
 })
})

describe('v2.4 one-hour lease',()=>{
 it('expires after 1 hour without activity',()=>{
  expect(LEASE_HOURS).toBe(1)
  expect(isLeaseExpired({lastActivity:0,now:H-1})).toBe(false)
  expect(isLeaseExpired({lastActivity:0,now:H})).toBe(true)
 })
 it('a Ready PR waiting on CI is not up for takeover; a failed check makes it stalled again',()=>{
  const ready={agent:'lemma-1'}
  expect(isLeaseExpired({lastActivity:0,now:5*H,waiting:waitingOnCi({ready,checks:{'fast-gate':'pending',scope:'success'}})})).toBe(false)
  expect(isLeaseExpired({lastActivity:0,now:5*H,waiting:waitingOnCi({ready,checks:{'fast-gate':'failure',scope:'success'}})})).toBe(true)
  expect(isLeaseExpired({lastActivity:0,now:5*H,waiting:waitingOnCi({ready:null,checks:{'fast-gate':'success',scope:'success'}})})).toBe(true)
 })
 it('AGENTS.md states the 1 hour lease, takeover in step 4 and the split limits',()=>{
  const md=readFileSync('AGENTS.md','utf8')
  expect(md).toContain('no commit and no comment for 1 hour, CI adds the label lease-expired')
  expect(md).toContain('take over one open PR labelled lease-expired')
  expect(md).toContain('A sub-item (an id with a dot) is never split again')
  expect(md).toContain('sub-item .1 must contain the hardest part of the item end to end')
  expect(md).not.toMatch(/for 3 hours, CI adds the label lease-expired/)
 })
})
