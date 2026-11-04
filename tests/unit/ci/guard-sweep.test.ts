import {describe,expect,it} from 'vitest'
// @ts-expect-error plain ESM script
import {lastAgentActivity,isLeaseExpired,wantsNeedsReview} from '../../../scripts/ci/sweep.mjs'

const H=3600e3
const t0=new Date('2026-11-04T10:00:00Z').getTime()
describe('sweep: lease-expired without a lease timestamp',()=>{
 it('counts commits and the PR Agent\'s own comments, not other agents\' comments',()=>{
  const a=lastAgentActivity({agent:'lemma-1',createdAt:'2026-11-04T10:00:00Z',commitDates:['2026-11-04T10:30:00Z'],comments:[
   {body:'Done: x\nAgent: lemma-1',created_at:'2026-11-04T11:00:00Z'},
   {body:'Approve · Agent: lemma-2',created_at:'2026-11-04T12:30:00Z'},
   {body:'status\nAgent: lemma-9',created_at:'2026-11-04T12:40:00Z'}]})
  expect(a).toBe(new Date('2026-11-04T11:00:00Z').getTime())
  expect(isLeaseExpired({lastActivity:a,now:a+3*H-1})).toBe(false)
  expect(isLeaseExpired({lastActivity:a,now:a+3*H})).toBe(true)
 })
 it('a new PR is not expired and activity renews it',()=>{
  const created=lastAgentActivity({agent:'x',createdAt:'2026-11-04T10:00:00Z'})
  expect(created).toBe(t0)
  expect(isLeaseExpired({lastActivity:created,now:t0+2*H})).toBe(false)
  const renewed=lastAgentActivity({agent:'x',createdAt:'2026-11-04T10:00:00Z',commitDates:['2026-11-04T12:50:00Z']})
  expect(isLeaseExpired({lastActivity:renewed,now:t0+4*H})).toBe(false)
 })
 it('an unsigned comment or a comment from another Agent is not activity from the PR Agent',()=>{
  const a=lastAgentActivity({agent:'lemma-1',createdAt:'2026-11-04T10:00:00Z',comments:[{body:'looks fine',created_at:'2026-11-04T12:00:00Z'},{body:'Taking over: Agent lemma-5',created_at:'2026-11-04T12:10:00Z'}]})
  expect(a).toBe(t0)
 })
})
describe('sweep: needs-review is a visual aid',()=>{
 const ok={'fast-gate':'success',scope:'success'}
 it('is wanted when both checks passed, not for drafts, CI PRs or changes-requested',()=>{
  expect(wantsNeedsReview({labels:new Set(),checks:ok,draft:false,isCi:false})).toBe(true)
  expect(wantsNeedsReview({labels:new Set(),checks:{...ok,scope:'failure'},draft:false,isCi:false})).toBe(false)
  expect(wantsNeedsReview({labels:new Set(),checks:{...ok,'fast-gate':'pending'},draft:false,isCi:false})).toBe(false)
  expect(wantsNeedsReview({labels:new Set(['changes-requested']),checks:ok,draft:false,isCi:false})).toBe(false)
  expect(wantsNeedsReview({labels:new Set(),checks:ok,draft:true,isCi:false})).toBe(false)
  expect(wantsNeedsReview({labels:new Set(),checks:ok,draft:false,isCi:true})).toBe(false)
 })
})
