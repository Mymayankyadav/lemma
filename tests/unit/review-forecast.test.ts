import {describe,expect,it} from 'vitest'
import {reviewForecast} from '../../src/lib/review-forecast'
const utc={timeZone:'UTC',rolloverHour:4}
const now=Date.parse('2026-10-30T12:00:00Z')
const card=(due:string,state=2)=>({due,state})
describe('complete scheduled-card forecast',()=>{
 it('counts more than 100 scheduled cards, including card siblings and overdue cards',()=>{
  const cards=[...Array.from({length:135},()=>card('2026-10-31T12:00:00Z')),card('2026-10-29T12:00:00Z'),card('2026-10-31T12:00:00Z',0)]
  const days=reviewForecast(cards,utc,now)
  expect(days).toHaveLength(7)
  expect(days[0]).toEqual({day:'2026-10-30',due:1})
  expect(days[1]).toEqual({day:'2026-10-31',due:135})
  expect(days[6].day).toBe('2026-11-05')
 })
 it('uses the configured study rollover, including the end-exclusive boundary',()=>{
  const days=reviewForecast([card('2026-10-31T03:59:59Z'),card('2026-10-31T04:00:00Z'),card('2026-11-06T04:00:00Z')],utc,now)
  expect(days[0].due).toBe(1)
  expect(days[1].due).toBe(1)
  expect(days.reduce((n,d)=>n+d.due,0)).toBe(2)
 })
 it('preserves civil dates across the fall DST change',()=>{
  const days=reviewForecast([card('2026-11-01T08:59:59Z'),card('2026-11-01T09:00:00Z')],{timeZone:'America/New_York',rolloverHour:4},Date.parse('2026-10-31T12:00:00Z'))
  expect(days.slice(0,2)).toEqual([{day:'2026-10-31',due:1},{day:'2026-11-01',due:1}])
 })
})
