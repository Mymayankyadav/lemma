// Port of the 2026-11-20 Atlas handoff (engine/owner_policy.mjs).
import type { Detail, Guard, Options, Snapshot, Ranked } from './types.ts';
import { selectWithCommitments } from './commitments.ts'
import { selectProtectedSchedule } from './fairness.ts'
import { prepare } from './constraints.ts'
import { deadlineGuard } from './deadline.ts'
import { DAY } from '../adaptive/math.ts'
import { knowledgeGain } from '../adaptive/kg.ts'
import { memoryAt,memoryStep } from '../adaptive/measure.ts'

import type { Action } from '../adaptive/kg.ts';
import type { MeasurementState, Memory } from '../adaptive/measure.ts';

const nativeCardWeight = .4
const finite = Number.isFinite
const expected = (p:number,success:number,failure:number) => p*success+(1-p)*failure
const actionKinds = ['practice','review','teach','check','probe']

function modeled(model:Snapshot['atlasModel']) {
  return !!model && finite(model.now) && Array.isArray(model.hypotheses) && model.hypotheses.length > 0 &&
    Array.isArray(model.pi) && model.pi.length === model.hypotheses.length &&
    model.pi.every(value => finite(value) && value >= 0) &&
    Math.abs(model.pi.reduce((sum,value) => sum+value,0)-1) < 1e-6 &&
    model.hypotheses.every(hypothesis => hypothesis?.memory && hypothesis.cards && hypothesis.counts)
}

export function atlasGainComponents(model:MeasurementState,action:Action) {
  const {concept_id:concept, p, needAt = model.now+7*DAY} = action
  let card = 0
  let skill = 0
  const gain = (old:Memory|undefined,amount=1,reset=true) => expected(p,
    memoryAt(memoryStep(old,model.now,3,amount,reset),needAt),
    memoryAt(memoryStep(old,model.now,1,amount,reset),needAt))
  for (const [index,hypothesis] of model.hypotheses.entries()) {
    const old = hypothesis.memory[concept]
    const before = memoryAt(old,needAt)
    if (action.kind === 'review') {
      const reviewCard = action.card_id ? hypothesis.cards[action.card_id] : undefined
      card += model.pi[index]*Math.max(0,gain(reviewCard)-memoryAt(reviewCard,needAt))
      if (index === 1 && old) skill += model.pi[index]*Math.max(0,gain(old,.3,false)-before)
    } else {
      const count = hypothesis.counts[concept] ?? 0
      const learning = .3*(Math.log1p(count+1)-Math.log1p(count))
      skill += model.pi[index]*Math.max(0,gain(old)-before+learning*.1)
    }
  }
  return {card,skill}
}

export function adaptOwnerMemoryWeight(input:Snapshot,explicitWeight=input?.ownerPreferences?.cardWeight) {
  const atlasStateAvailable = modeled(input?.atlasModel)
  const unchanged = (status:string,detail:Detail={}) => ({input,ownerWeight:{status,atlasStateAvailable,...detail}})
  if (explicitWeight === undefined) return unchanged('not specified')
  if (!finite(explicitWeight) || explicitWeight < 0 || explicitWeight > 1)
    return unchanged('invalid owner preference')
  if (explicitWeight === nativeCardWeight) return unchanged('native value',{value:explicitWeight})
  if (!atlasStateAvailable) return unchanged('missing Atlas state',{value:explicitWeight})
  try {
    const state = prepare(input)
    const byId = new Map(state.tasks.map(task => [task.id,task]))
    const model = input.atlasModel!
    let adjusted = 0
    let skipped = 0
    const tasks = (input.tasks ?? []).map(task => {
      const atlas = task.atlasAction
      const active = byId.get(task.id)
      if (!atlas || atlas.forced || !active) return task
      const weight = atlas.weight ?? 1
      const needAt = atlas.needAt ?? model.now+(active.deadline-state.now)*60000
      if (!actionKinds.includes(atlas.kind) || typeof atlas.concept_id !== 'string' ||
          !finite(atlas.p) || atlas.p < 0 || atlas.p > 1 || !finite(needAt) || !finite(weight) || weight < 0) {
        skipped++
        return task
      }
      const action = {...atlas,id:task.id,needAt,minutes:active.remaining,weight:1}
      const {card,skill} = atlasGainComponents(model,action)
      const base = knowledgeGain(model,action)
      const target = explicitWeight*card+(1-explicitWeight)*skill
      if (base === 0 && target === 0) return task
      const normalized = weight*(target/base)
      if (!finite(normalized) || normalized < 0) {
        skipped++
        return task
      }
      adjusted++
      return {...task,atlasAction:{...atlas,weight:normalized}}
    })
    return {input:adjusted ? {...input,tasks} : input,ownerWeight:{status:'evaluated',
      atlasStateAvailable,value:explicitWeight,adjusted,skipped}}
  } catch {
    return unchanged('invalid Atlas or calendar evidence',{value:explicitWeight})
  }
}

export function selectOwnerPolicy(state:Snapshot,options:Options={}) {
  const {input,ownerWeight} = adaptOwnerMemoryWeight(state,Object.hasOwn(options,'cardWeight') ? options.cardWeight : undefined)
  const requested = options.policy ?? 'conservative'
  const policy = ['repair','observe-repair'].includes(requested) ? 'conservative' : requested
  const proposed = selectWithCommitments(input,{...options,policy})
  const finish = (decision:Ranked,attendanceGuard:Guard) => ({...decision,ownerWeight,attendanceGuard})
  if (proposed.policy !== 'portfolio') return finish(proposed,{status:'bypassed',applied:false})
  const id = proposed.action?.id
  const task = input.tasks.find(row => row.id === id)
  if (!task?.atlasAction || task.core || task.required ||
      (input.confirmedDeadlines ?? []).includes(id!) || (input.protectedPersonal ?? []).includes(id!) ||
      (input.activeId && (input.protectedUntil ?? input.now) > input.now))
    return finish(proposed,{status:'bypassed',applied:false})
  try {
    const baseline = selectProtectedSchedule(input,{...options,policy:'v3',includeForecasts:false})
    const eligible = {...input,availability:proposed.freeIntervals ?? input.availability}
    const result = deadlineGuard(eligible,proposed,baseline)
    if (!result) return finish(proposed,{status:'unavailable',applied:false})
    const applied = result.protects && requested !== 'observe-repair'
    const attendanceGuard = {...result,status:applied ? 'vetoed' : 'checked',applied}
    if (!applied) return finish(proposed,attendanceGuard)
    return finish({...baseline,commitment:proposed.commitment,
      reason:'Preserve the baseline deadline commitment before optional study'},attendanceGuard)
  } catch {
    return finish(proposed,{status:'unavailable',applied:false})
  }
}
