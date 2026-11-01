// @vitest-environment node
import {describe,expect,it,vi} from 'vitest'
import {reviewForecast} from '../../../src/lib/review-forecast'

// Regression-first slice of FIX #507: 30,000 cards with only a handful of
// distinct due timestamps must not perform 30,000 Intl civil-day conversions.
describe('FIX-507d bounded seven-day forecast',()=>{
 it('memoizes repeated due dates without changing any seven-day counts',()=>{
  const now=Date.parse('2026-10-31T12:00:00Z')
  const cards=Array.from({length:30_000},(_,i)=>({
   state:i%5===0?0:2,
   due:i%2===0?'2026-10-31T12:00:00Z':'2026-11-01T12:00:00Z',
  }))
  const spy=vi.spyOn(Intl.DateTimeFormat.prototype,'formatToParts')
  try{
   const days=reviewForecast(cards,{timeZone:'UTC',rolloverHour:4},now)
   expect(days).toHaveLength(7)
   expect(days[0].due).toBe(12_000)
   expect(days[1].due).toBe(12_000)
   expect(days.reduce((n,d)=>n+d.due,0)).toBe(24_000)
   expect(spy.mock.calls.length).toBeLessThan(20)
  }finally{spy.mockRestore()}
 })
 it('accepts a one-pass iterable without materializing another card-state array',()=>{
  const now=Date.parse('2026-10-31T12:00:00Z')
  function* cards(){
   yield {state:2,due:'2026-10-31T12:00:00Z'}
   yield {state:2,due:'2026-10-31T12:00:00Z'}
   yield {state:0,due:'2026-10-31T12:00:00Z'}
  }
  expect(reviewForecast(cards(),{timeZone:'UTC',rolloverHour:4},now)[0].due).toBe(2)
 })
})
