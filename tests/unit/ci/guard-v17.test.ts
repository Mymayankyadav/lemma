import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {waitingPrNumbers} from '../../../scripts/ci/approve.mjs'
// @ts-expect-error plain ESM script
import {botTokenViolations} from '../../../scripts/ci/lib.mjs'

const ci=readFileSync('.github/workflows/ci.yml','utf8')
const job=(name:string)=>{
 const start=ci.indexOf('\n  '+name+':\n')
 if(start<0)throw Error('Missing CI job: '+name)
 const rest=ci.slice(start+1)
 const end=rest.slice(1).search(/\n  [\w-]+:\n/)
 return end<0?rest:rest.slice(0,end+1)
}

describe('v1.7: approved PRs are not left waiting after an S0 freeze',()=>{
 it('lists open PRs only, oldest first',()=>{
  const issues=[{number:30,pull_request:{}},{number:7,pull_request:{}},{number:12},{number:21,pull_request:{}}]
  expect(waitingPrNumbers(issues)).toEqual([7,21,30])
  expect(waitingPrNumbers([])).toEqual([])
  expect(waitingPrNumbers(undefined)).toEqual([])
 })
 it('main-green re-evaluates after closing the incident, on the default branch only',()=>{
  const y=job('main-green')
  expect(y.indexOf('incident.mjs main-green')).toBeGreaterThan(-1)
  expect(y.indexOf('node scripts/ci/approve.mjs')).toBeGreaterThan(y.indexOf('incident.mjs main-green'))
  expect(y).toContain("ALL_OPEN: '1'")
  expect(y).toContain('github.ref_name == github.event.repository.default_branch')
  for(const p of ['pull-requests: write','checks: read','actions: read'])expect(y).toContain(p)
 })
 it('the bot token stays on main-side workflows only',()=>{
  const files=['ci.yml','review-merge.yml','calibrate.yml'].map((n)=>({name:n,text:readFileSync('.github/workflows/'+n,'utf8')}))
  expect(botTokenViolations(files)).toEqual([])
 })
})

describe('v1.7: an e2e-only red main is re-run once on fresh runners before any incident or revert',()=>{
 const y=job('revert')
 const step=(name:string)=>{const i=y.indexOf('- name: '+name);if(i<0)throw Error('no step '+name);const n=y.indexOf('\n      - ',i+1);return y.slice(i,n<0?undefined:n)}
 it('ci.yml accepts the recheck input',()=>{
  expect(ci).toMatch(/workflow_dispatch:\n    inputs:\n      recheck:/)
 })
 it('the recheck step is first, only for e2e-only failures, never for a recheck run',()=>{
  const r=step('Re-run once on fresh runners before declaring main red (e2e-only failure)')
  expect(y.indexOf(r)).toBeLessThan(y.indexOf('uses: actions/checkout@v4'))
  expect(r).toContain("inputs.recheck != 'true'")
  expect(r).toContain("needs.check.result != 'failure'")
  expect(r).toContain("needs.mcp-sql.result != 'failure'")
  expect(r).toContain('github.ref_name == github.event.repository.default_branch')
  expect(r).toContain('gh workflow run ci.yml --ref "$GITHUB_REF_NAME" -f recheck=true')
 })
 it('the incident, signatures and revert are skipped when a recheck was started',()=>{
  expect(step('Open or update the S0 incident')).toContain("steps.recheck.outputs.rechecking != 'true'")
  expect(step('Revert the merge(s) since the last green run')).toContain("steps.recheck.outputs.rechecking != 'true'")
  expect(y).toContain("node scripts/ci/signatures.mjs junit signatures.json")
  expect(y.slice(y.indexOf('node scripts/ci/signatures.mjs')-80,y.indexOf('node scripts/ci/signatures.mjs'))).toContain("rechecking != 'true'")
 })
 it('the job still has the permission to start the re-run, and the selftest branch reverts at once',()=>{
  expect(y).toContain('actions: write')
  expect(job('revert')).toContain("github.ref_name == 'selftest/main'")
 })
})
