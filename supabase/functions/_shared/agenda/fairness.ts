// Port of the 2026-11-20 Atlas handoff (scheduler/fairness.mjs).
import type { Detail, Guard, Options, PreparedTask, Ranked, Reservation, Scenario, Selection, Snapshot, State } from './types.ts';
import { errorMessage } from './types.ts';
import { EPS, available, makeAction, prepare, validateDecision } from './constraints.ts'
import { evidenceFrom,makeScenarios } from './portfolio.ts'
import { selectSchedule } from './selector.ts'

function outcomes(state:State,scenarios:Scenario[],decision:Selection,index:number) {
  const task = state.tasks[index]
  const {action,hold} = decision
  const next = action?.end ?? hold!.until
  return scenarios.map(scenario => {
    const effort = scenario.required[index]
    const spent = action?.id === task.id ? Math.max(0,action.end-action.start-task.pending) : 0
    if (spent+EPS >= effort) return true
    return available(scenario.windows,{...task,remaining:effort},next)+EPS >= effort+task.pending
  })
}

function reserve(input:Snapshot,reservations:Reservation[]) {
  const state = prepare(input)
  const byId = new Map(state.tasks.map(task => [task.id,task]))
  for (const row of reservations) {
    if (typeof row?.taskId !== 'string' || !Number.isFinite(row.start) ||
        !Number.isFinite(row.end) || row.end <= row.start)
      throw new Error('Invalid personal reservation')
  }
  const booked = reservations.map(row => ({...row,task:byId.get(row.taskId)}))
    .filter((row): row is Reservation & {task:PreparedTask} => !!row.task && row.end > input.now).sort((a,b) => a.start-b.start)
  const ids = new Set()
  let priorEnd = -Infinity
  for (const row of booked) {
    const {task,start,end} = row
    if (ids.has(task.id) || task.kind !== 'personal' || start < priorEnd ||
        start < task.release || end > task.deadline ||
        end-Math.max(start,state.now)+EPS < task.remaining+task.pending ||
        !state.windows.some(window => window.start <= Math.max(start,state.now) && window.end >= end && !window.projectId)) {
      throw new Error('An explicit personal reservation conflicts with the available calendar or expected work')
    }
    ids.add(task.id)
    priorEnd = end
  }
  const current = booked.find(row => row.start <= state.now)
  if (current) {
    const {task,end} = current
    const action = makeAction(task,state.now,task.remaining,end-state.now-task.remaining-task.pending)
    if (validateDecision(input,{action,hold:null}).length)
      throw new Error('A stronger current constraint takes precedence over the personal reservation')
    return {current:{action,hold:null},input}
  }
  const fixed = booked.map(row => ({id:'personal-reservation:'+row.taskId,start:row.start,end:row.end}))
  if (fixed.some(row => (input.fixed ?? []).some(event => (event.occurrenceKey ?? event.id) === row.id)))
    throw new Error('A reservation identity conflicts with an existing fixed occurrence')
  return {current:null,input:{...input,fixed:[...(input.fixed ?? []),...fixed]}}
}

export function selectProtectedSchedule(input:Snapshot,options:Options={}) {
  const decorate = (decision:Ranked,floor:Guard) => ({...decision,floor})
  const baseline = (request:Snapshot,reason:string,extra:Detail={}) => decorate(selectSchedule(request,{...options,policy:'v3'}),
    {status:'fallback',reason,...extra})
  try {
    const reservation = reserve(input,input.personalReservations ?? [])
    if (reservation.current) {
      const base = selectSchedule(input,{...options,policy:'v3'})
      return decorate({...base,...reservation.current,policy:'reservation',
        reason:'The user reserved this eligible interval for a personal commitment'},
      {status:'reserved',taskId:reservation.current.action.id})
    }
    const request = reservation.input
    const proposed = selectSchedule(request,options)
    const ids = new Set(input.protectedPersonal ?? [])
    if (!ids.size || proposed.policy !== 'portfolio')
      return decorate(proposed,{status:'not evaluated',reason:'No portfolio switch with protected personal work'})
    const state = prepare(request)
    const protectedRows = state.tasks.flatMap((task,index) => ids.has(task.id) && task.kind === 'personal' ? [{task,index}] : [])
    if (!protectedRows.length)
      return decorate(proposed,{status:'not evaluated',reason:'No visible protected personal task'})
    const original = selectSchedule(request,{...options,policy:'v3'})
    const first = original.action
    const alternate = proposed.action
    const reserved = protectedRows.some(({task}) => first?.id === task.id &&
      (alternate?.id !== task.id || alternate.end+EPS < first.end))
    const evidence = evidenceFrom(request.history)
    const scenarios = makeScenarios(state,{...evidence,spread:Math.max(.23,evidence.spread),kept:Math.min(.8,evidence.kept)})
    const harmed = protectedRows.filter(({index}) => {
      const reference = outcomes(state,scenarios,original,index)
      const candidate = outcomes(state,scenarios,proposed,index)
      return reference.some((success,i) => success && !candidate[i])
    }).map(({task}) => task.id)
    if (reserved || harmed.length) return decorate(original,{status:'fallback',
      reason:reserved ? 'Keep the v3 personal action' : 'The alternate loses a protected deadline in a pessimistic scenario',
      harmed})
    return decorate(proposed,{status:'passed',protected:protectedRows.map(({task}) => task.id)})
  } catch (error) {
    return baseline(input,errorMessage(error))
  }
}
