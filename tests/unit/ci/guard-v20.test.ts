import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {reviewRequired,flagsTurnedOn} from '../../../scripts/ci/review-policy.mjs'
// @ts-expect-error plain ESM script
import {canReuse,greenGate} from '../../../scripts/ci/reuse.mjs'
// @ts-expect-error plain ESM script
import {evaluateMerge} from '../../../scripts/ci/approve.mjs'
// @ts-expect-error plain ESM script
import {needsReviewWanted} from '../../../scripts/ci/verdicts.mjs'

const T0='2026-11-06T01:00:00Z'
const c=(body:string,at:string)=>({id:Math.random(),body,created_at:at,author_association:'OWNER'})
const ctx=(over:any={})=>({pr:{number:7,title:'N1 thing',body:'Agent: lemma-2 · Item: N1',draft:false,state:'open',baseRef:'main',headSha:'abc',headRepo:'o/r',labels:[]},
 defaultBranch:'main',repo:'o/r',comments:[],headCommitDate:T0,checks:{'fast-gate':'success',scope:'success'},s0:[],now:Date.parse('2026-11-06T03:00:00Z'),...over})

describe('v2.0 review policy',()=>{
 it('requires review only for supabase/** or a flag turned on by default',()=>{
  expect(reviewRequired([{filename:'src/features/a.tsx'},{filename:'CURRENT.md'}]).required).toBe(false)
  expect(reviewRequired([{filename:'supabase/migrations/2026_x.sql'}]).required).toBe(true)
  expect(reviewRequired([{filename:'supabase/functions/mcp/index.ts'}]).why[0]).toContain('deploys to production')
  expect(reviewRequired([{filename:'src/flags.ts',patch:'@@\n+  v6Calendar: false,\n'}]).required).toBe(false)
  expect(reviewRequired([{filename:'src/flags.ts',patch:'@@\n-  v6Shell: false,\n+  v6Shell: true,\n'}]).required).toBe(true)
  expect(flagsTurnedOn('@@\n+  a: true,\n+  b: false,\n-  c: true,\n')).toEqual(['a: true,'])
 })
 it('a PR that needs no review merges on Ready + green checks, with no approval',()=>{
  const ready=c('Ready · Agent: lemma-2','2026-11-06T02:00:00Z')
  expect(evaluateMerge(ctx({reviewRequired:false,comments:[ready]})).merge).toBe(true)
  const none=evaluateMerge(ctx({reviewRequired:false,comments:[]}))
  expect(none.merge).toBe(false)
  expect(none.reasons.join(' ')).toContain('has not commented exactly "Ready · Agent: lemma-2" after the last push')
  // Ready before the last push does not count
  expect(evaluateMerge(ctx({reviewRequired:false,comments:[c('Ready · Agent: lemma-2','2026-11-06T00:30:00Z')]})).merge).toBe(false)
  // red checks, changes requested and an S0 still block
  expect(evaluateMerge(ctx({reviewRequired:false,comments:[ready],checks:{'fast-gate':'failure',scope:'success'}})).merge).toBe(false)
  expect(evaluateMerge(ctx({reviewRequired:false,comments:[ready,c('Changes requested · Agent: lemma-7: broken','2026-11-06T02:10:00Z')]})).merge).toBe(false)
  expect(evaluateMerge(ctx({reviewRequired:false,comments:[ready],s0:[900]})).merge).toBe(false)
  // and it never gets the needs-review label
  expect(evaluateMerge(ctx({reviewRequired:false,comments:[ready]})).needsReview).toBe(false)
 })
 it('a PR that needs review still needs an approval from another agent',()=>{
  const ready=c('Ready · Agent: lemma-2','2026-11-06T02:00:00Z')
  expect(evaluateMerge(ctx({reviewRequired:true,comments:[ready]})).merge).toBe(false)
  expect(evaluateMerge(ctx({reviewRequired:true,comments:[ready]})).needsReview).toBe(true)
  expect(evaluateMerge(ctx({reviewRequired:true,comments:[ready,c('Approve · Agent: lemma-7','2026-11-06T02:20:00Z')]})).merge).toBe(true)
  expect(evaluateMerge(ctx({comments:[ready]})).merge).toBe(false) // default: review required
 })
 it('needsReviewWanted is false when no review is required',()=>{
  const args={authorKey:'lemma-2',comments:[c('Ready · Agent: lemma-2','2026-11-06T02:00:00Z')],headAt:Date.parse(T0),checks:{'fast-gate':'success',scope:'success'},labels:new Set<string>(),draft:false,isCi:false,sessions:{},now:Date.parse('2026-11-06T03:00:00Z')}
  expect(needsReviewWanted(args)).toBe(true)
  expect(needsReviewWanted({...args,reviewRequired:false})).toBe(false)
 })
})

describe('v2.0 fast-gate reuse',()=>{
 it('reuses only when every changed file is CURRENT.md or NEXT.md',()=>{
  expect(canReuse(['CURRENT.md'])).toBe(true)
  expect(canReuse(['CURRENT.md','NEXT.md'])).toBe(true)
  expect(canReuse(['CURRENT.md','src/a.ts'])).toBe(false)
  expect(canReuse([])).toBe(false)
 })
 it('takes the newest completed fast-gate run',()=>{
  expect(greenGate([{name:'fast-gate',status:'completed',conclusion:'failure',completed_at:'2026-11-06T01:00:00Z'},{name:'fast-gate',status:'completed',conclusion:'success',completed_at:'2026-11-06T02:00:00Z'}])).toBe(true)
  expect(greenGate([{name:'fast-gate',status:'completed',conclusion:'success',completed_at:'2026-11-06T01:00:00Z'},{name:'fast-gate',status:'completed',conclusion:'failure',completed_at:'2026-11-06T02:00:00Z'}])).toBe(false)
  expect(greenGate([])).toBe(false)
 })
 it('the PR gate skips every test job on reuse and fast-gate accepts that',()=>{
  const y=readFileSync('.github/workflows/pr-gate.yml','utf8')
  expect(y).toContain("reuse: ${{ steps.reuse.outputs.reuse || 'false' }}")
  expect(y).toContain('run: node scripts/ci/reuse.mjs')
  expect(y).toContain("if: steps.reuse.outputs.reuse != 'true'")
  for(const j of ['typecheck-lint','smoke-e2e']){
   const i=y.indexOf('\n  '+j+':\n'); expect(y.slice(i,i+200)).toContain("if: needs.changes.outputs.reuse != 'true'")
  }
  expect(y).toContain(`must='["changes"]'`)
  expect(y).toContain(`must='["changes","typecheck-lint","smoke-e2e"]'`)
 })
})
