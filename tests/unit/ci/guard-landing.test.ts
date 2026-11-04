import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {botTokenViolations} from '../../../scripts/ci/lib.mjs'
// @ts-expect-error plain ESM script
import {classifyMergeError,landingComment} from '../../../scripts/ci/automerge.mjs'
// @ts-expect-error plain ESM script
import {GhError} from '../../../scripts/ci/gh.mjs'
// @ts-expect-error plain ESM script
import {evaluateScope} from '../../../scripts/ci/scope.mjs'
import {readFileSync,readdirSync} from 'node:fs'

describe('CI_BOT_TOKEN guard',()=>{
 it('is allowed only in main-side workflows and never in a pull_request-triggered one',()=>{
  const push='on:\n  push:\n    branches: [main]\njobs: {}\n# CI_BOT_TOKEN'
  const pr='on:\n  pull_request:\n    types: [opened]\njobs: {}\n# CI_BOT_TOKEN'
  const prt='on:\n  pull_request_target:\njobs: {}\n# CI_BOT_TOKEN'
  expect(botTokenViolations([{name:'ci.yml',text:push},{name:'calibrate.yml',text:push}])).toEqual([])
  expect(botTokenViolations([{name:'pr-gate.yml',text:pr}]).length).toBe(2)
  expect(botTokenViolations([{name:'ci.yml',text:prt}]).length).toBe(1)
  expect(botTokenViolations([{name:'sweep.yml',text:push}]).length).toBe(1)
  expect(botTokenViolations([{name:'x.yml',text:'on: push'}])).toEqual([])
 })
 it('the real workflows satisfy it',()=>{
  const wf=readdirSync('.github/workflows').filter(n=>n.endsWith('.yml')).map(n=>({name:n,text:readFileSync('.github/workflows/'+n,'utf8')}))
  expect(botTokenViolations(wf)).toEqual([])
 })
})

describe('landing a CI-opened PR never bypasses the ruleset',()=>{
 it('a ruleset refusal is classified as blocked, a base-branch race as retry, anything else as fatal',()=>{
  const blocked=new GhError(405,'PUT','/pulls/1/merge',{message:'Repository rule violations found\n\nRequired status check "scope" is expected.'})
  expect(classifyMergeError(blocked)).toBe('blocked')
  expect(classifyMergeError(new GhError(405,'PUT','/x',{message:'Base branch was modified. Review and try the merge again.'}))).toBe('retry')
  expect(classifyMergeError(new GhError(409,'PUT','/x',{message:'Head branch was modified'}))).toBe('retry')
  expect(classifyMergeError(new GhError(500,'PUT','/x','boom'))).toBe('fatal')
  expect(classifyMergeError(new Error('network'))).toBe('fatal')
 })
 it('the blocked comment says CI will not bypass and what a human must do',()=>{
  const c=landingComment({result:'blocked-by-ruleset',message:'Repository rule violations found',states:{'fast-gate':'success',scope:'success'}})
  expect(c).toContain('blocked by ruleset')
  expect(c).toContain('will not bypass')
  expect(c).toContain('CI_BOT_TOKEN')
 })
})

describe('a dispatched scope run must target the PR head',()=>{
 const base={title:'rules: x',body:'Agent: a · Item: rules · Lease until 2026-11-04T09:00:00Z',files:[],baseNext:'',headNext:'',openPrs:[],protectedCfg:{paths:[],testGlobs:[]},now:new Date('2026-11-04T08:00:00Z')}
 it('fails on a mismatched commit, passes on a matching one and on non-dispatch events',()=>{
  const rules=(c:any)=>evaluateScope(c).failures.map((f:any)=>f.rule)
  expect(rules({...base,headSha:'a'.repeat(40),dispatchSha:'b'.repeat(40)})).toContain('DISPATCH-HEAD')
  expect(rules({...base,headSha:'a'.repeat(40),dispatchSha:'a'.repeat(40)})).toEqual([])
  expect(rules({...base,headSha:'a'.repeat(40)})).toEqual([])
 })
})
