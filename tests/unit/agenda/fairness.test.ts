// Golden decision and invariant fixtures from the 2026-11-20 Atlas handoff.
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { selectProtectedSchedule } from '../../../supabase/functions/_shared/agenda/fairness'

const errand = {id:'errand',kind:'personal',remaining:15,due:55,importance:2}
const course = {id:'course',kind:'course',remaining:23,due:60,importance:5}
const reservation = {taskId:'errand',start:25,end:45}
const make = extra => ({now:0,end:60,tasks:[errand,course],personalReservations:[reservation],...extra})

test('future reservation prevents other flexible work overrunning it',() => {
  const result = selectProtectedSchedule(make({tasks:[errand,{...course,remaining:42}]}))
  assert.ok(result.action.end <= 25)
  assert.deepEqual(result.freeIntervals.map(({start,end}) => [start,end]),[[0,25],[45,60]])
})

test('current reservation chooses protected personal work and budgets overrun',() => {
  const result = selectProtectedSchedule(make({now:25}))
  assert.equal(result.policy,'reservation')
  assert.equal(result.action.id,'errand')
  assert.equal(result.action.end,45)
  assert.equal(result.action.bufferMinutes,5)
})

test('an earlier fixed appointment takes precedence and conflicting booking is explained',() => {
  const result = selectProtectedSchedule(make({now:25,fixed:[{id:'exam',start:20,end:29}]}))
  assert.equal(result.floor.status,'fallback')
  assert.equal(result.action,null)
  assert.equal(result.hold.until,29)
})

test('a protected professional study action takes precedence',() => {
  const result = selectProtectedSchedule(make({now:25,activeId:'course',protectedUntil:35}))
  assert.equal(result.floor.status,'fallback')
  assert.equal(result.action.id,'course')
})

test('authorized severe tutor action remains the current hard priority',() => {
  const result = selectProtectedSchedule(make({now:25,tasks:[errand,course,
    {id:'tutor',kind:'tutor',remaining:7,due:35,authority:'confirmed',required:true,severity:3}]}))
  assert.equal(result.floor.status,'fallback')
  assert.equal(result.policy,'urgent')
  assert.equal(result.action.id,'tutor')
})

test('a slot too short for the task triggers an explained safe fallback',() => {
  const result = selectProtectedSchedule(make({now:34}))
  assert.equal(result.floor.status,'fallback')
  assert.match(result.floor.reason,/conflicts/)
})

test('invalid times trigger an explained safe fallback',() => {
  const result = selectProtectedSchedule(make({personalReservations:[{...reservation,end:NaN}]}))
  assert.equal(result.floor.status,'fallback')
  assert.match(result.floor.reason,/Invalid personal reservation/)
})

test('released slots become available after the protected work leaves the input',() => {
  const result = selectProtectedSchedule(make({now:25,tasks:[course]}))
  assert.equal(result.action.id,'course')
  assert.equal(result.floor.status,'not evaluated')
})
