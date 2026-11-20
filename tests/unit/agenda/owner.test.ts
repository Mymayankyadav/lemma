// Golden decision and invariant fixtures from the 2026-11-20 Atlas handoff.
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { adaptOwnerMemoryWeight,atlasGainComponents,selectOwnerPolicy } from '../../../supabase/functions/_shared/agenda/owner'
import { validateDecision } from '../../../supabase/functions/_shared/agenda/selector'
import { replay } from '../../../supabase/functions/_shared/adaptive/measure'
import { knowledgeGain,sessionQueue } from '../../../supabase/functions/_shared/adaptive/kg'

const now = Date.UTC(2026,10,18)
const yesterday = '2026-11-17T00:00:00Z'
const model = replay({
  concepts:[{id:'concept',name:'Lemma',kind:'topic',parent_id:null}],
  attempts:[{id:'first',occurred_at:yesterday,novelty:'novel',
    tags:[{concept_id:'concept',facet:'use',role:'target',stage:'E',result:'ok',hint_level:0}]}],
  cards:[{id:'card',concept_id:'concept',stability:2,difficulty:5,last_review:yesterday}],
}, {}, now)
const review = {id:'review',kind:'review',concept_id:'concept',card_id:'card',p:.75,weight:2,minutes:5}
const practice = {id:'practice',kind:'practice',concept_id:'concept',p:.74,weight:3,minutes:12}
const asTask = action => ({id:action.id,kind:action.kind === 'review' ? 'card' : 'course',
  remaining:action.minutes,due:60,atlasAction:{...action}})
const calendar = {now:0,end:60,tasks:[asTask(review),asTask(practice)],atlasModel:model}
const taskActions = input => input.tasks.map(task => ({...task.atlasAction,id:task.id,minutes:task.remaining,
  needAt:task.atlasAction.needAt ?? input.atlasModel.now+(task.due-input.now)*60000}))
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-12,`${a} and ${b} differ`)

test('decomposition matches the pinned native 0.4 score for review, practice and coupling',() => {
  for (const hypothesis of [model,{...model,pi:[1,0]},{...model,pi:[0,1]}]) {
    for (const action of taskActions(calendar)) {
      const {card,skill} = atlasGainComponents(hypothesis,action)
      close((.4*card+.6*skill)*action.weight,knowledgeGain(hypothesis,action))
      assert.ok(action.kind === 'review' ? card >= 0 : skill > 0)
      if (action.kind === 'review' && hypothesis.pi[1] === 0) assert.equal(skill,0)
    }
  }
})

test('explicit native value and absent owner preference preserve identity',() => {
  assert.equal(adaptOwnerMemoryWeight(calendar).input,calendar)
  assert.equal(adaptOwnerMemoryWeight(calendar,.4).input,calendar)
  const viaState = {...calendar,ownerPreferences:{cardWeight:.4}}
  assert.equal(selectOwnerPolicy(viaState,{policy:'v3'}).ownerWeight.status,'native value')
})

test('owner weight produces the requested native-equivalent gain without mutating source tasks',() => {
  for (const value of [0,.13,.8,1]) {
    const {input,ownerWeight} = adaptOwnerMemoryWeight(calendar,value)
    assert.equal(ownerWeight.status,'evaluated')
    const adjusted = taskActions(input)
    for (const [i,action] of taskActions(calendar).entries()) {
      const {card,skill} = atlasGainComponents(model,action)
      const expected = (value*card+(1-value)*skill)*action.weight
      close(knowledgeGain(model,adjusted[i]),expected)
    }
  }
  assert.equal(calendar.tasks[0].atlasAction.weight,2)
})

test('missing measurement state and malformed preferences are disclosed',() => {
  const input = {...calendar,atlasModel:undefined}
  assert.equal(adaptOwnerMemoryWeight(input,.7).ownerWeight.status,'missing Atlas state')
  assert.equal(adaptOwnerMemoryWeight(calendar,1.4).ownerWeight.status,'invalid owner preference')
  assert.equal(adaptOwnerMemoryWeight(calendar,null).ownerWeight.status,'invalid owner preference')
})

test('forced action fields, queue caps and remaining minutes stay native',() => {
  const teach = {...asTask({...practice,id:'teach',kind:'teach',minutes:13,forced:true}),core:true}
  const input = {...calendar,tasks:[teach,...calendar.tasks],cardCap:.01}
  const {input:adapted} = adaptOwnerMemoryWeight(input,1)
  assert.equal(adapted.tasks[0],teach)
  assert.equal(adapted.tasks[1].remaining,calendar.tasks[0].remaining)
  const queue = sessionQueue(model,taskActions(adapted),60,.01)
  assert.equal(queue.items[0].id,'teach')
  assert.ok(!queue.items.some(action => action.id === 'review'))
  assert.equal(selectOwnerPolicy(input,{policy:'v3',cardWeight:1}).action.id,'teach')
})

const day = 1440
const low = {now:0,end:2*day,fixed:[],tasks:[
  {id:'urgent-form',kind:'personal',importance:4,remaining:15,due:day+30},
  {id:'optional',kind:'course',remaining:17,minChunk:17,due:30,importance:7,
    atlasAction:{kind:'practice',concept_id:'concept',p:.75}},
],availability:[{start:0,end:18},{start:day,end:day+22}],
history:[...Array.from({length:18},()=>({estimated:10,actual:10,kept:true})),
  ...Array.from({length:6},()=>({estimated:10,actual:10,kept:false}))]}

test('low attendance vetoes an otherwise approved optional portfolio switch',() => {
  const observe = selectOwnerPolicy(low,{policy:'observe-repair'})
  assert.equal(observe.action.id,'optional')
  assert.equal(observe.attendanceGuard.protects,true)
  assert.equal(observe.attendanceGuard.applied,false)
  const enforced = selectOwnerPolicy(low,{policy:'repair'})
  assert.equal(enforced.action.id,'urgent-form')
  assert.equal(enforced.attendanceGuard.applied,true)
  assert.deepEqual(validateDecision(low,enforced),[])
})

test('reliable attendance preserves the switch',() => {
  const reliable = {...low,history:low.history.map(row=>({...row,kept:true}))}
  const enforced = selectOwnerPolicy(reliable,{policy:'repair'})
  assert.equal(enforced.action.id,'optional')
  assert.equal(enforced.attendanceGuard.applied,false)
})

test('explicitly confirmed alternatives are outside the attendance veto',() => {
  const input = {...low,confirmedDeadlines:['optional']}
  const enforced = selectOwnerPolicy(input,{policy:'repair'})
  assert.equal(enforced.action.id,'optional')
  assert.equal(enforced.attendanceGuard.status,'bypassed')
})

test('current confirmed repair wins and a fixed appointment can still hold',() => {
  const tutor = {id:'repair',kind:'tutor',remaining:6,due:18,required:true,severity:3,authority:'confirmed'}
  const input = {...low,tasks:[...low.tasks,tutor]}
  const free = selectOwnerPolicy(input,{policy:'repair'})
  assert.equal(free.action.id,'repair')
  assert.equal(free.attendanceGuard.status,'bypassed')
  const busy = selectOwnerPolicy({...input,fixed:[{id:'exam',start:0,end:12}]},{policy:'repair'})
  assert.equal(busy.action,null)
  assert.equal(busy.hold.until,12)
})

test('effective personal reservations take precedence over attendance and owner weighting',() => {
  const input = {...low,atlasModel:model,personalReservations:[{taskId:'urgent-form',start:0,end:16}]}
  const reserved = selectOwnerPolicy(input,{policy:'repair',cardWeight:1})
  assert.equal(reserved.action.id,'urgent-form')
  assert.equal(reserved.policy,'reservation')
  assert.equal(reserved.attendanceGuard.status,'bypassed')
})

test('invalid calendar falls through to its hard safe hold',() => {
  const result = selectOwnerPolicy({now:0,end:40,tasks:{}},{cardWeight:.7})
  assert.equal(result.action,null)
  assert.equal(result.policy,'hold')
})

test('confirmed native action wins before the attendance guard',() => {
  const teach = {...asTask({...practice,id:'teach',kind:'teach',minutes:24,forced:true}),core:true,
    due:36,splittable:false,importance:8}
  const card = {...asTask(review),due:15,importance:2}
  const input = {...calendar,end:120,tasks:[teach,card],fixed:[{id:'class',start:34,end:100}]}
  const verifiedAtlasCommitment = id => id === 'teach' ? {taskId:id,source:'atlas-v3',phase:'teaching',
    confirmedCore:true,forced:true,actionKind:'teach',conceptId:'concept',maxMinutes:30,deadline:36} : null
  const result = selectOwnerPolicy(input,{policy:'agenda',cardWeight:.8,verifiedAtlasCommitment})
  assert.equal(result.policy,'atlas_commitment')
  assert.equal(result.action.id,'teach')
  assert.equal(result.attendanceGuard.status,'bypassed')
})
