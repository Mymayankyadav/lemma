import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'

const source=readFileSync('tests/mcp/notif1b-stress.mjs','utf8')

describe('FIX #739 deterministic NOTIF X study-day rollover acceptance',()=>{
 it('exercises both sides of UTC midnight and 04:00 after the original cold X timing gate',()=>{
  const coldGate=source.indexOf("assert.ok(elapsed<150")
  const boundaries=source.indexOf('const boundaryInstants')
  expect(coldGate).toBeGreaterThan(0)
  expect(boundaries).toBeGreaterThan(coldGate)
  for(const clock of ['23:59:59','00:00:01','03:59:59','04:00:01'])
   expect(source.slice(boundaries)).toContain(clock)
  expect(source.slice(boundaries)).toMatch(/for\s*\(const\s+\[label,instant,expectedTomorrow\]\s+of\s+boundaryInstants\)/)
  expect(source.slice(boundaries)).toContain('public.notify_candidates($1,$2::timestamptz)')
  expect(source.slice(boundaries)).toContain('new Set(boundary.tomorrow.map(row=>row.slug)).size')
 })
 it('distinguishes owner UTC 04:00 rollover from UTC calendar midnight',()=>{
  const utcDay='2026-11-02'
  const before='2026-11-01'
  const studyTomorrow=(instant:string)=>{
   const shifted=new Date(Date.parse(instant)-4*60*60*1000)
   const studyDay=shifted.toISOString().slice(0,10)
   return new Date(Date.parse(studyDay+'T00:00:00Z')+86400000).toISOString().slice(0,10)
  }
  expect(studyTomorrow(before+'T23:59:59Z')).toBe(utcDay)
  expect(studyTomorrow(utcDay+'T00:00:01Z')).toBe(utcDay)
  expect(studyTomorrow(utcDay+'T03:59:59Z')).toBe(utcDay)
  expect(studyTomorrow(utcDay+'T04:00:01Z')).toBe('2026-11-03')
 })
})
