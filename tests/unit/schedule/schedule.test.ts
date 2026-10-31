import {describe,it,expect} from 'vitest'
import type {CheckpointView} from '../../../src/data/types'
import {buildSchedule,scheduleHeadline,scheduleDetail} from '../../../src/lib/schedule'
const now=new Date('2026-11-10T12:00:00Z')
function cp(code:string,overrides:Partial<CheckpointView>={}):CheckpointView{
 return {id:code,code,title:code,position:1,ui:'locked',currentStep:0,stepsTotal:4,
  recheckDue:null,dueCards:0,...overrides}
}
describe('UI-6b schedule-aware Metro',()=>{
 it('classifies early, on-time and late using calendar days',()=>{
  const rows=buildSchedule([
   cp('CP1',{ui:'done',dueOn:'2026-11-12',demonstratedAt:'2026-11-09'}),
   cp('CP2',{ui:'done',dueOn:'2026-11-12',demonstratedAt:'2026-11-10'}),
   cp('CP3',{ui:'done',dueOn:'2026-11-07',demonstratedAt:'2026-11-10'}),
  ],{now})
  expect(rows.map(row=>row.state)).toEqual(['early','on_time','late'])
  expect(rows.map(row=>row.deltaDays)).toEqual([-3,-2,3])
  expect(scheduleDetail(rows[0])).toBe('Planned 12 Nov, done 9 Nov: 3 days early')
 })
 it('spreads only missing unfinished dates by remaining step weights',()=>{
  const rows=buildSchedule([
   cp('done',{ui:'done'}),
   cp('small',{ui:'next',stepsTotal:2}),
   cp('large',{ui:'locked',stepsTotal:6}),
   cp('fixed',{ui:'locked',dueOn:'2026-11-17'}),
  ],{now,targetDate:'2026-11-18'})
  expect(rows.map(row=>row.dueOn)).toEqual([null,'2026-11-11','2026-11-15','2026-11-17'])
  expect(rows.map(row=>row.inferred)).toEqual([false,true,true,false])
 })
 it('projects the current checkpoint from remaining steps and pace',()=>{
  const rows=buildSchedule([cp('now',{ui:'now',stepsTotal:4,currentStep:3,dueOn:'2026-11-12'})],
   {now,pacePerWeek:2})
  expect(rows[0].actualOn).toBe('2026-11-12')
  expect(rows[0].state).toBe('on_time')
  expect(scheduleHeadline(rows)).toBe('On schedule')
 })
 it('never invents schedule colours without a target or due dates',()=>{
  const rows=buildSchedule([cp('now',{ui:'now'}),cp('later')],{now})
  expect(rows.every(row=>row.state==='unscheduled'&&row.dueOn===null)).toBe(true)
  expect(scheduleHeadline(rows)).toBeNull()
 })
 it('flags missed future stations but leaves upcoming ones muted',()=>{
  const rows=buildSchedule([cp('past',{dueOn:'2026-11-06'}),cp('future',{dueOn:'2026-11-20'})],{now})
  expect(rows.map(row=>row.state)).toEqual(['late','future'])
 })
})
