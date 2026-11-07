import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {reconcilePlan,prune} from '../../../scripts/ci/incident.mjs'

const hash=(s:string)=>createHash('sha1').update(s).digest('hex').slice(0,12)
const SIG='unit/tests/unit/contract/capability-registry.test.ts::N40 complete cap'
const NOW=Date.parse('2026-11-07T10:00:00Z')
const iso=(h:number)=>new Date(NOW-h*3600e3).toISOString()
const ctx=(h:number)=>({run:'1',at:iso(h),sha:'x'})
const issue=(n:number,sig=SIG,extra='')=>({number:n,labels:[{name:'incident'},{name:'S0'}],body:`<!-- sig:${hash(sig)} -->\n${extra}**Signature:** \`${sig}\``})
const reg=(contexts:Record<string,any>)=>({version:1,signatures:{[SIG]:{first:iso(30),contexts}}})
const prs=(...a:[number,number|null][])=>a.map(([number,h])=>({number,headDate:h===null?null:iso(h)}))

describe('v2.3 reconcile: PR-origin incidents do not outlive their failure (#1013)',()=>{
 it('keeps the incident while 2+ open PRs still fail with the signature on their current head',()=>{
  const r=reconcilePlan(reg({'pr:1':ctx(3),'pr:2':ctx(2)}),[issue(10)],prs([1,4],[2,3]),NOW)
  expect(r.close).toEqual([])
  expect(r.drop).toEqual([])
 })
 it('S1 -> S0 -> resolved: PRs pushed a newer head after the failing run, the fix landed',()=>{
  const r=reconcilePlan(reg({'pr:1':ctx(5),'pr:2':ctx(5),'pr:3':ctx(5)}),[issue(997),issue(998),issue(999)],prs([1,1],[2,1],[3,1]),NOW)
  expect(r.close.map((c)=>c.number)).toEqual([997,998,999])
  expect(r.drop.map(([,c])=>c).sort()).toEqual(['pr:1','pr:2','pr:3'])
 })
 it('closes when the reporting PRs are gone (not open any more)',()=>{
  const r=reconcilePlan(reg({'pr:1':ctx(5),'pr:2':ctx(5)}),[issue(10)],[],NOW)
  expect(r.close.map((c)=>c.number)).toEqual([10])
 })
 it('closes when the signature has vanished from the registry',()=>{
  expect(reconcilePlan({version:1,signatures:{}},[issue(10)],[],NOW).close.map((c)=>c.number)).toEqual([10])
 })
 it('closes when only one open PR is left (the rule that opened it needs 2)',()=>{
  const r=reconcilePlan(reg({'pr:1':ctx(2),'pr:2':ctx(5)}),[issue(10)],prs([1,3],[2,1]),NOW)
  expect(r.close.map((c)=>c.number)).toEqual([10])
  expect(r.drop).toEqual([[SIG,'pr:2']])
 })
 it('keeps an incident whose signature is also reported by main',()=>{
  const r=reconcilePlan(reg({main:ctx(1),'pr:1':ctx(5)}),[issue(10)],prs([1,1]),NOW)
  expect(r.close).toEqual([])
 })
 it('never touches main incidents, deploy incidents, or pull requests',()=>{
  const main=issue(20,SIG,'<!-- main-incident -->\n')
  const deploy={number:21,labels:[{name:'incident'}],body:'<!-- deploy-incident -->\nSupabase deploy failed'}
  const pr={...issue(22),pull_request:{}}
  const r=reconcilePlan(reg({}),[main,deploy,pr],[],NOW)
  expect(r.close).toEqual([])
 })
 it('ignores contexts older than the 7 day registry window',()=>{
  const r=reconcilePlan(reg({'pr:1':ctx(24*8),'pr:2':ctx(24*8)}),[issue(10)],prs([1,null],[2,null]),NOW)
  expect(r.close.map((c)=>c.number)).toEqual([10])
 })
 it('treats an unknown head commit date as live (never closes on missing data)',()=>{
  const r=reconcilePlan(reg({'pr:1':ctx(5),'pr:2':ctx(5)}),[issue(10)],prs([1,null],[2,null]),NOW)
  expect(r.close).toEqual([])
 })
 it('prune still forgets closed PRs, so a vanished signature is reconciled next run',()=>{
  const d=reg({'pr:1':{run:'1',at:new Date().toISOString(),sha:'x'}})
  prune(d,new Set())
  expect(d.signatures).toEqual({})
 })
})

describe('v2.3 wiring',()=>{
 const read=(f:string)=>readFileSync(f,'utf8')
 it('main-green and the sweep both reconcile, before the sweep escalates',()=>{
  const inc=read('scripts/ci/incident.mjs')
  expect(inc).toMatch(/mode === 'main-green' \|\| mode === 'reconcile'/)
  const sweep=read('.github/workflows/sweep.yml')
  expect(sweep.indexOf('incident.mjs reconcile')).toBeGreaterThan(0)
  expect(sweep.indexOf('incident.mjs reconcile')).toBeLessThan(sweep.indexOf('node scripts/ci/sweep.mjs'))
  expect(sweep).not.toMatch(/CI_BOT_TOKEN/)
 })
 it('main-green closes only main incidents; reconcile skips them', ()=>{
  const inc=read('scripts/ci/incident.mjs')
  expect(inc).toMatch(/includes\(MAIN_TAG\)\)\) \{/)
  expect(inc).toMatch(/if \(body\.includes\(MAIN_TAG\)\) continue/)
 })
})
