// Golden decision and invariant fixtures from the 2026-11-20 Atlas handoff.
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { selectWithCommitments } from '../../../supabase/functions/_shared/agenda/commitments'
import { validateDecision } from '../../../supabase/functions/_shared/agenda/selector'

const lesson = {id:'lesson',kind:'course',remaining:24,due:36,importance:8,core:true,splittable:false,
  atlasAction:{kind:'teach',concept_id:'lesson-concept',p:.7,forced:true}}
const cue = {id:'cue',kind:'card',remaining:5,due:15,importance:2,
  atlasAction:{kind:'review',concept_id:'lesson-concept',card_id:'cue',p:.7}}
const errand = {id:'personal',kind:'personal',remaining:8,due:120}
const calendar = {
  now:0,end:120,fixed:[{id:'class',start:34,end:100}],tasks:[lesson,cue],
  history:Array.from({length:12},()=>({estimated:10,actual:10,kept:true})),
}
const auth = {source:'atlas-v3',phase:'teaching',confirmedCore:true,forced:true,actionKind:'teach',
  taskId:'lesson',conceptId:'lesson-concept',maxMinutes:30,deadline:36}
const run = (input=calendar,notice=auth) => selectWithCommitments(input,{
  policy:'agenda',verifiedAtlasCommitment:id => id === 'lesson' ? notice : null,
})

test('host opt-in is required despite an input claiming forced core status',() => {
  const result = selectWithCommitments(calendar,{policy:'agenda'})
  assert.equal(result.action.id,'cue')
  assert.equal(result.commitment.status,'disabled')
})

test('last feasible native teaching action needs trusted authority and passes the common hard validator',() => {
  const result = run()
  assert.equal(result.policy,'atlas_commitment')
  assert.equal(result.action.id,'lesson')
  assert.equal(result.action.end,24)
  assert.deepEqual(validateDecision(calendar,result),[])
})

test('untrusted namespaces, stale due dates, substituted concepts and excess duration do not elevate teaching',() => {
  for (const change of [{source:'ui'},{deadline:35},{conceptId:'other'},{maxMinutes:20},{forced:false},{phase:'certification'}]) {
    const result = run(calendar,{...auth,...change})
    assert.equal(result.action.id,'cue')
    assert.equal(result.commitment.status,'unchanged')
  }
})

test('the actual native forced flag and independently confirmed core are both required',() => {
  assert.equal(run({...calendar,tasks:[{...lesson,core:false},cue]}).action.id,'cue')
  assert.equal(run({...calendar,tasks:[{...lesson,atlasAction:{...lesson.atlasAction,forced:false}},cue]}).action.id,'cue')
  assert.equal(run(calendar,{...auth,confirmedCore:false}).action.id,'cue')
})

test('certification checks use their native one-quarter slot rule',() => {
  const check = {...lesson,remaining:5,due:20,atlasAction:{...lesson.atlasAction,kind:'check'}}
  const short = {...cue,remaining:2,due:4}
  const input = {...calendar,fixed:[{id:'class',start:20,end:100}],tasks:[check,short]}
  const result = run(input,{...auth,phase:'certification',actionKind:'check',deadline:20})
  assert.equal(result.action.id,'lesson')
  assert.equal(result.commitment.status,'preserved')
})

test('known fixed events make an overlapping native action unavailable',() => {
  const result = run({...calendar,fixed:[{id:'exam',start:4,end:100}]})
  assert.notEqual(result.action?.id,'lesson')
  assert.notEqual(result.commitment.status,'preserved')
})

test('a current explicit personal reservation has hard precedence',() => {
  const result = run({...calendar,tasks:[...calendar.tasks,errand],
    personalReservations:[{taskId:'personal',start:0,end:12}]})
  assert.equal(result.policy,'reservation')
  assert.equal(result.action.id,'personal')
  assert.equal(result.commitment.status,'precedence')
})

test('a future personal reservation cannot be consumed by a curriculum action',() => {
  const result = run({...calendar,tasks:[...calendar.tasks,errand],
    personalReservations:[{taskId:'personal',start:12,end:23}]})
  assert.notEqual(result.action?.id,'lesson')
  assert.ok((result.action?.end ?? result.hold.until) <= 12)
})

test('current confirmed severe tutor repair has precedence',() => {
  const repair = {id:'repair',kind:'tutor',remaining:5,due:15,required:true,severity:3,authority:'confirmed'}
  const result = run({...calendar,tasks:[...calendar.tasks,repair]})
  assert.equal(result.policy,'urgent')
  assert.equal(result.action.id,'repair')
  assert.equal(result.commitment.status,'precedence')
})

test('future confirmed repair can veto a native override',() => {
  const repair = {id:'repair',kind:'tutor',remaining:5,release:8,due:19,severity:2,authority:'confirmed'}
  const result = run({...calendar,tasks:[...calendar.tasks,repair]})
  assert.notEqual(result.action?.id,'lesson')
  assert.match(result.commitment.reason,/certified/)
})

test('explicitly confirmed competing deadline wins against the override',() => {
  const result = run({...calendar,confirmedDeadlines:['cue']})
  assert.equal(result.action.id,'cue')
  assert.equal(result.commitment.status,'precedence')
})

test('the decision exposes a concrete continuation certificate',() => {
  const personal = {...errand,release:26,due:34,remaining:5}
  const input = {...calendar,tasks:[...calendar.tasks,personal],confirmedDeadlines:['personal']}
  const result = run(input)
  assert.equal(result.commitment.status,'preserved')
  assert.deepEqual(result.commitment.continuation,[{id:'personal',start:26,end:31,deadline:34}])
  assert.ok(result.commitment.continuation[0].start >= result.action.end)
})

test('individually feasible stronger tasks still need a disjoint joint continuation',() => {
  const personal = {...errand,release:26,due:34,remaining:5}
  const more = {...personal,id:'another'}
  const input = {...calendar,tasks:[...calendar.tasks,personal,more],confirmedDeadlines:['personal','another']}
  const result = run(input)
  assert.notEqual(result.action?.id,'lesson')
  assert.match(result.commitment.reason,/joint stronger/)
})

test('a personal floor still vetoes the override when the earlier protected task loses feasibility',() => {
  const personal = {...errand,release:5,due:19,remaining:5}
  const input = {...calendar,tasks:[...calendar.tasks,personal],protectedPersonal:['personal']}
  const result = run(input)
  assert.notEqual(result.action?.id,'lesson')
  assert.match(result.commitment.reason,/personal-commitment floor/)
})
