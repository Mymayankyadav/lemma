// Golden decision and invariant fixtures from the 2026-11-20 Atlas handoff.
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { selectSchedule,validateDecision } from '../../../supabase/functions/_shared/agenda/selector'
import { available,prepare } from '../../../supabase/functions/_shared/agenda/constraints'

const course = (id='proof',extra={}) => ({id,kind:'course',remaining:20,due:60,...extra})
const personal = (id='errand',extra={}) => ({id,kind:'personal',remaining:10,due:55,...extra})
const tutor = (extra={}) => ({
  id:'repair',kind:'tutor',remaining:8,due:30,expiry:35,severity:3,authority:'delegated',required:true,...extra
})
const card = (extra={}) => ({id:'recall',kind:'card',remaining:4,due:50,...extra})
const input = (tasks=[course()],extra={}) => ({now:0,end:60,tasks,...extra})
const action = (x,y) => {
  const found = selectSchedule(x,y)
  assert.deepEqual(validateDecision(x,found),[])
  return found
}
const observed = (ratio=1,n=12) => Array.from({length:n},() => ({estimated:10,actual:ratio*10,kept:true}))
const auth = (kind='practice',extra={}) => ({kind,concept_id:'proof-concept',p:.8,...extra})

test('empty calendar and empty work returns the next horizon boundary',() => {
  const found = action(input([]))
  assert.equal(found.action,null)
  assert.equal(found.hold.until,60)
})

test('zero horizon cleanly returns a terminal hold',() => {
  assert.equal(action(input([],{end:0})).hold.until,0)
})

test('fixed event plus before and after reservations use half-open ranges',() => {
  const fixed = [{id:'class',start:8,end:24,before:8,after:4}]
  assert.equal(action(input([course()],{fixed})).hold.until,28)
  assert.equal(action(input([course()],{now:28,fixed})).action.start,28)
})

test('overlapping fixed commitments consume time once and expose the conflict',() => {
  const fixed = [{id:'seminar',start:0,end:16},{id:'appointment',start:7,end:20}]
  const result = action(input([course()],{fixed}))
  assert.equal(result.hold.until,20)
  assert.equal(result.fixedConflicts[0].kind,'fixed')
  assert.deepEqual(result.currentFixed.map(event => event.id),['seminar'])
})

test('buffer overlap is distinct from simultaneous fixed appointments',() => {
  const fixed = [{id:'class',start:3,end:18,after:8},{id:'exam',start:23,end:31}]
  assert.equal(action(input([course()],{fixed})).fixedConflicts[0].kind,'buffer')
})

test('mirrored recurrence records deduplicate by occurrence key',() => {
  const fixed = ['A','B'].map(id => ({id,occurrenceKey:'class-instance',revision:2,start:0,end:30}))
  const result = action(input([course()],{fixed}))
  assert.equal(result.currentFixed.length,1)
  assert.equal(result.hold.until,30)
})

test('a later cancellation supersedes a mirrored event',() => {
  const fixed = [{id:'old',occurrenceKey:'class-1',revision:1,start:0,end:45},
    {id:'new',occurrenceKey:'class-1',revision:2,cancelled:true}]
  assert.equal(action(input([course()],{fixed})).action.id,'proof')
})

test('conflicting highest revision holds safely',() => {
  const fixed = [{id:'a',occurrenceKey:'X',revision:2,start:0,end:33},
    {id:'b',occurrenceKey:'X',revision:2,start:2,end:19}]
  const result = selectSchedule(input([course()],{fixed}))
  assert.equal(result.action,null)
  assert.match(result.evidence.error,/copies conflict/)
})

test('stale conflicting revisions do not affect the latest event',() => {
  const stale = [7,15].map(end => ({id:'class',revision:1,start:0,end}))
  const latest = {id:'class',revision:2,start:1,end:22}
  const a = action(input([course()],{fixed:[...stale,latest]}))
  const b = action(input([course()],{fixed:[latest,...stale]}))
  assert.deepEqual(a,b)
})

test('unknown future task cannot change visible evidence or duplicate-id validation',() => {
  const tasks = [course()]
  const hidden = [...tasks,{id:'proof',kind:'unknown',remaining:NaN,release:20,unannounced:true}]
  assert.deepEqual(selectSchedule(input(tasks)),selectSchedule(input(hidden)))
})

test('known future release is a wait boundary',() => {
  const result = action(input([course('later',{release:20})]))
  assert.equal(result.hold.until,20)
})

test('study-only leave preserves personal work and delays proof work',() => {
  const result = action(input([course(),personal()],{studyReturnAt:31}))
  assert.equal(result.action.id,'errand')
  assert.equal(action(input([course()],{studyReturnAt:31})).hold.until,31)
})

test('availability ownership excludes personal work and other study projects',() => {
  const availability = [{start:0,end:30,projectId:'A'},{start:35,end:60}]
  const result = action(input([personal(),course('B',{projectId:'B'}),course('A',{projectId:'A'})],{availability}))
  assert.equal(result.action.id,'A')
})

test('declared zero capacity reports the stranded core',() => {
  const result = action(input([course('core',{core:true})],{availability:[]}))
  assert.equal(result.action,null)
  assert.equal(result.forecasts[0].pFeasible,0)
  assert.equal(result.risks[0].id,'core')
})

test('disjoint time cannot satisfy an atomic work estimate',() => {
  const availability = [{start:0,end:13},{start:25,end:38}]
  const result = action(input([personal('atomic',{remaining:20})],{availability}))
  assert.equal(result.action,null)
  assert.equal(result.forecasts[0].accessibleMinutes,13)
})

test('a legal split can finish in a smaller final tail',() => {
  const x = input([course('proof',{remaining:15,minChunk:10})],
    {availability:[{start:0,end:10},{start:20,end:25}]})
  const state = prepare(x)
  assert.equal(available(state.windows,state.tasks[0],0),15)
  assert.equal(action(x).action.minutes,10)
})

test('effective card need date supersedes its ordinary review date',() => {
  const result = action(input([course(),card({needBy:5})]),{policy:'deadline'})
  assert.equal(result.action.id,'recall')
  assert.ok(result.action.end <= 5)
})

test('expired cards and tutor tasks remain visible in the expired list',() => {
  const result = action(input([tutor({expiry:1}),card({needBy:2})],{now:3}))
  assert.ok(result.expired.includes('repair'))
  assert.ok(result.expired.includes('recall'))
})

test('tutor request awaiting approval never becomes runnable',() => {
  const result = action(input([course(),tutor({authority:'ask',acknowledged:true})]))
  assert.equal(result.action.id,'proof')
  assert.equal(result.pendingTutor[0].state,'awaiting approval')
})

test('declining an otherwise confirmed repair excludes it',() => {
  const result = action(input([course(),tutor({authority:'confirmed',declined:true})]))
  assert.equal(result.pendingTutor[0].state,'declined')
  assert.equal(result.action.id,'proof')
})

test('delegation is capped at ten minutes',() => {
  const result = action(input([tutor({remaining:11})]))
  assert.equal(result.action,null)
  assert.equal(result.pendingTutor[0].state,'awaiting approval')
})

test('authorized severe tutor action is common to every policy',() => {
  for (const policy of ['v3','agenda','deadline','importance','portfolio','conservative']) {
    const result = action(input([course(),tutor()]),{policy})
    assert.equal(result.policy,'urgent')
    assert.equal(result.action.id,'repair')
  }
})

test('urgent tutor action cannot start in a fixed event or its buffer',() => {
  const fixed = [{id:'exam',start:0,end:15,after:4}]
  const result = action(input([course(),tutor()],{fixed}))
  assert.equal(result.hold.until,19)
})

test('protected proof takes precedence until the allowed boundary',() => {
  const tasks = [course(),tutor()]
  assert.equal(action(input(tasks,{activeId:'proof',protectedUntil:12})).action.id,'proof')
  assert.equal(action(input(tasks,{now:12,activeId:'proof',protectedUntil:12})).action.id,'repair')
})

test('an infeasible protected proof yields a hold instead of skipping protection',() => {
  const result = action(input([course('proof',{minChunk:22,remaining:25}),personal()],
    {activeId:'proof',protectedUntil:8,fixed:[{id:'call',start:18,end:25}]}))
  assert.equal(result.hold.until,8)
})

test('resume debt reserves real minutes and is validated',() => {
  const x = input([course('proof',{resumeMinutes:7})])
  const result = action(x)
  assert.equal(result.action.end-result.action.minutes,7)
  assert.notDeepEqual(validateDecision(x,{...result,action:{...result.action,resumeMinutes:0}}),[])
})

test('duplicate task IDs fail before scheduling',() => {
  const result = selectSchedule(input([course('repeat'),personal('repeat')]))
  assert.equal(result.action,null)
  assert.match(result.evidence.error,/duplicate task/)
})

test('invalid time input holds and exposes the reason',() => {
  const result = selectSchedule(input([course()],{fixed:[{id:'bad',start:18,end:3}]}))
  assert.equal(result.action,null)
  assert.match(result.evidence.error,/Invalid fixed interval/)
})

test('an external wait proposal cannot jump past a known release boundary',() => {
  const x = input([course('future',{release:17})])
  assert.deepEqual(validateDecision(x,{action:null,hold:{until:17}}),[])
  assert.notDeepEqual(validateDecision(x,{action:null,hold:{until:18}}),[])
})

test('cold start uses authentic v3 study priority where action evidence is present',() => {
  const tasks = [course('teach',{remaining:20,atlasAction:auth('teach',{forced:true})}),card({atlasAction:auth('review',{card_id:'recall-card'})})]
  const result = action(input(tasks))
  assert.equal(result.policy,'v3')
  assert.equal(result.evidence.baselineOrigin,'Atlas v3 session queue')
  assert.equal(result.action.id,'teach')
})

test('an invalid Atlas measurement clock recovers to guarded compatibility',() => {
  const tasks = [course('teach',{atlasAction:auth('teach',{forced:true})}),personal()]
  const result = action(input(tasks,{atlasModel:{},history:observed()}))
  assert.equal(result.policy,'v3')
  assert.equal(result.evidence.baselineOrigin,'compatibility deadline')
  assert.match(result.evidence.baselineError,/measurement clock/)
})

test('insufficient calibrated support serves v3',() => {
  const result = action(input([course(),personal()],{history:observed(1,7)}))
  assert.equal(result.policy,'v3')
  assert.match(result.reason,/Too little/)
})

test('observed distribution shift falls back to v3',() => {
  const result = action(input([course(),personal()],{history:[...observed(1,12),...observed(2,4)]}))
  assert.equal(result.policy,'v3')
  assert.match(result.reason,/shifted/)
})

test('probability gate approves a bounded duration reserve when supported',() => {
  const x = input([course(),personal('short',{due:30,remaining:15})],{history:observed(1.2)})
  const result = action(x)
  assert.equal(result.policy,'portfolio')
  assert.ok(result.action.bufferMinutes >= 1)
  assert.ok(result.evidence.wilsonLower > .5)
  assert.equal(result.evidence.criticalLosses,0)
})

test('probability gate defaults to baseline if there is no strict gain',() => {
  const result = action(input([course()],{history:observed(.88)}))
  assert.equal(result.policy,'v3')
  assert.equal(result.evidence.gain,0)
})

test('overload emits choices while preserving high-priority deadline and capacity limits',() => {
  const result = action(input([course('impossible',{core:true,remaining:50,due:12}),personal()],{history:observed()}))
  assert.ok(result.risks.find(risk => risk.id === 'impossible').choices.some(choice => /approval/.test(choice)))
})

test('a model error cannot bypass urgent or fixed calendar guards',() => {
  const result = action(input([tutor()],{history:{invalid:true}}))
  assert.equal(result.policy,'urgent')
  assert.equal(result.action.id,'repair')
})

test('interleaving is offered once at an eligible boundary with headroom',() => {
  const x = input([course()],{interleaving:{id:'related',atBoundary:true,headroom:60,
    typicalMinutes:15,alternativeMinutes:11,promptMinutes:1,switchMinutes:1}})
  assert.equal(action(x).interleavingTip.id,'related')
  assert.equal(action({...x,interleaving:{...x.interleaving,offered:true}}).interleavingTip,null)
})

test('interleaving is declined if switching would displace planned full problems',() => {
  const interleaving = {id:'related',atBoundary:true,headroom:30,typicalMinutes:15,
    alternativeMinutes:20,promptMinutes:2,switchMinutes:2}
  assert.equal(action(input([course()],{interleaving})).interleavingTip,null)
})

test('every supplied policy is deterministic and does not mutate input records',() => {
  const x = input([course(),personal(),card()],{history:observed(1.15),fixed:[{id:'call',start:30,end:40}]})
  const before = structuredClone(x)
  for (const policy of ['v3','agenda','deadline','importance','portfolio','conservative']) {
    assert.deepEqual(action(x,{policy}),action(x,{policy}))
  }
  assert.deepEqual(x,before)
})
