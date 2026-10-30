import {beforeEach,describe,expect,it,vi} from 'vitest'
import {LiveAdapter} from '../../../src/data/live/adapter'
import {buildInsights} from '../../../src/lib/insights'
import type {InsightAggregate} from '../../../src/data/types'
import type {InsightDays} from '../../../src/data/api'

const mock=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn()}))
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({rpc:mock.rpc,auth:{getUser:mock.getUser}}),
}))

const date=(daysAgo:number)=>new Date(Date.UTC(2026,9,31)-daysAgo*86_400_000)
 .toISOString().slice(0,10)
const subject={id:'s1',name:'Analysis',glyph:'∫' as const,hue:'amber' as const,position:0}
const aggregate=(days:InsightDays):InsightAggregate=>({
 days,reviews:3,right:2,
 reviewDays:Array.from({length:days},(_,i)=>{
  const ago=days-1-i
  return {date:date(ago),count:ago===0?2:ago===1?1:0,
   again:ago===0?1:0,hard:0,good:ago===0?1:0,easy:ago===1?1:0,
   right:ago<=1?1:0}
 }),
 calibration:[
  {confidence:'sure',total:2,right:1},
  {confidence:'unsure',total:0,right:0},
  {confidence:'guess',total:1,right:1},
 ],
 sessions:2,minutes:90,typicalSession:45,
 subjectMinutes:[{subject,minutes:90}],
 checkpointDays:Array.from({length:28},(_,i)=>({
  date:date(27-i),demonstrated:i===27?1:0,rechecked:i===27?2:0,
 })),
 mostRevisited:{label:'Continuity',times:4,conceptName:'Uniform continuity'},
})

describe('ST-5 Insights aggregate (one bounded RPC)',()=>{
 beforeEach(()=>{
  mock.rpc.mockReset()
  mock.getUser.mockReset()
  mock.getUser.mockResolvedValue({data:{user:{id:'owner-1'}},error:null})
 })
 it.each([7,30,90] as const)('loads %i days without whole-table reads',async(days)=>{
  const value=aggregate(days)
  mock.rpc.mockResolvedValue({data:value,error:null})
  const payload=await new LiveAdapter().getInsightData(days)
  expect(payload.aggregate).toEqual(value)
  expect(payload.reviews).toEqual([])
  expect(payload.sessions).toEqual([])
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('insights',{p_days:days})
  expect(mock.getUser).toHaveBeenCalledOnce()
  const charts=buildInsights(payload,days)
  expect(charts).toMatchObject({
   days,reviews:3,recall:2/3,sessions:2,minutes:90,typicalSession:45,
   mostRevisited:{label:'Continuity',times:4},
  })
  expect(charts.reviewBuckets).toHaveLength(days===90?13:days)
  expect(charts.recallBuckets).toHaveLength(days===7?7:Math.ceil(days/7))
  expect(charts.reviewBuckets.reduce((n,b)=>n+b.count,0)).toBe(3)
  expect(charts.reviewBuckets.reduce((n,b)=>n+b.again,0)).toBe(1)
  expect(charts.reviewBuckets.reduce((n,b)=>n+b.good,0)).toBe(1)
  expect(charts.reviewBuckets.reduce((n,b)=>n+b.easy,0)).toBe(1)
  expect(charts.reviewBuckets[0].date).toBe(date(days-1))
  expect(charts.reviewBuckets.at(-1)?.endDate).toBe(date(0))
  expect(charts.calibration[0]).toEqual({confidence:'sure',total:2,right:1,rate:0.5})
  expect(charts.calibration[1].rate).toBeNull()
  expect(charts.subjects[0]).toEqual({subject,minutes:90})
  expect(charts.checkpointWeeks[3]).toMatchObject({label:'This week',demonstrated:1,rechecked:2})
 })
 it('keeps empty history honest (no invented recall or median)',()=>{
  const value=aggregate(7)
  value.reviews=0
  value.right=0
  value.reviewDays=value.reviewDays.map(day=>({...day,count:0,again:0,hard:0,good:0,easy:0,right:0}))
  value.calibration=[]
  value.sessions=0
  value.minutes=0
  value.typicalSession=null
  value.subjectMinutes=[]
  value.mostRevisited=null
  const charts=buildInsights({
   aggregate:value,reviews:[],sessions:[],checkpointEvents:[],projects:[],misconceptions:[],
  },7)
  expect(charts.recall).toBeNull()
  expect(charts.calibrationMessage).toBeNull()
  expect(charts.calibration.every(row=>row.rate===null)).toBe(true)
  expect(charts.typicalSession).toBeNull()
  expect(charts.mostRevisited).toBeNull()
 })
 it('surfaces RPC failures instead of showing misleading zero charts',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'not permitted'}})
  await expect(new LiveAdapter().getInsightData(30)).rejects.toMatchObject({code:'auth'})
 })
})
