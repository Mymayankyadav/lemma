// Port of the 2026-11-20 Atlas handoff (scheduler/commitments.mjs).
import type { Commitment, Detail, Options, Pick, PreparedTask, Ranked, Snapshot, State, Window } from './types.ts';
import { errorMessage } from './types.ts';
import { EPS, available, byDeadline, prepare, validateDecision } from './constraints.ts'
import { evidenceFrom,makeScenarios } from './portfolio.ts'
import { selectProtectedSchedule } from './fairness.ts'

const phaseFor:Record<string,string> = {teach:'teaching',check:'certification'}
const higherTutor = (task:PreparedTask) => task.kind === 'tutor' &&
  (task.authority === 'confirmed' || task.required || task.severity === 3)

function trustedCore(task:PreparedTask,pick:Pick,lookup:(id:string)=>Commitment|undefined) {
  const notice = lookup(task.id)
  return notice && notice.taskId === task.id && notice.source === 'atlas-v3' &&
    notice.confirmedCore === true && task.core === true && notice.forced === true &&
    task.atlasAction?.forced === true && notice.actionKind === task.atlasAction.kind &&
    notice.conceptId === task.atlasAction.concept_id && Number.isFinite(notice.maxMinutes) &&
    pick.end-pick.start <= notice.maxMinutes+EPS &&
    phaseFor[task.atlasAction.kind] === notice.phase && Boolean(notice.phase) &&
    Number.isFinite(notice.deadline) && Math.abs(notice.deadline-task.deadline) <= EPS
}

function room(task:PreparedTask,window:Window,at:number) {
  if (window.projectId && window.projectId !== task.projectId) return null
  const start = Math.max(at,task.release,window.start)
  return {start,limit:Math.min(task.deadline,window.end),windowEnd:window.end}
}

function nativeStillPossible(task:PreparedTask,windows:Window[],at:number,effort:number) {
  return windows.some(window => {
    const free = room(task,window,at)
    if (!free || free.limit-free.start+EPS < effort) return false
    const block = free.windowEnd-free.start
    return task.atlasAction!.kind === 'teach' ? block+EPS >= effort+10 : block+EPS >= effort*4
  })
}

function certificate(tasks:PreparedTask[],windows:Window[],at:number) {
  const ordered = tasks.slice().sort(byDeadline)
  const slots = []
  let cursor = at
  for (const task of ordered) {
    const effort = task.remaining+task.pending
    const free = windows.map(window => room(task,window,cursor))
      .find(window => window && window.limit-window.start+EPS >= effort)
    if (!free) return null
    cursor = free.start+effort
    slots.push({id:task.id,start:free.start,end:cursor,deadline:task.deadline})
  }
  return slots
}

function protectsFloor(state:State,windows:Window[],personal:{task:PreparedTask;index:number}[],reference:Ranked,pick:Pick) {
  if (!personal.length) return true
  if (personal.some(({task}) => task.id === reference.action?.id)) return false
  const evidence = evidenceFrom(state.input.history)
  const scenarios = makeScenarios({...state,windows},
    {...evidence,spread:Math.max(.23,evidence.spread),kept:Math.min(.8,evidence.kept)})
  const at = reference.action?.end ?? reference.hold!.until
  return personal.every(({task,index}) => scenarios.every(scenario => {
    const effort = scenario.required[index]
    const demand = {...task,remaining:effort}
    const feasible = (point:number) => available(scenario.windows,demand,point)+EPS >= effort+task.pending
    return !feasible(at) || feasible(pick.end)
  }))
}

export function selectWithCommitments(input:Snapshot,options:Options={}) {
  const reference = selectProtectedSchedule(input,options)
  const describe = (status:string,reason:string,extra:Detail={}) => ({...reference,commitment:{status,reason,...extra}})
  const lookup = options.verifiedAtlasCommitment
  if (typeof lookup !== 'function') return describe('disabled','The host supplied no verified Atlas commitment reader')
  if (reference.policy === 'urgent' || reference.policy === 'reservation')
    return describe('precedence','A stronger current commitment is served')
  try {
    const state = prepare(input)
    const v3 = selectProtectedSchedule(input,{...options,policy:'v3'})
    const pick = v3.action
    if (!pick || v3.evidence.baselineOrigin !== 'Atlas v3 session queue' || v3.floor?.status === 'fallback')
      return describe('unchanged','The native queue has no eligible confirmed candidate in this window')
    const task = state.tasks.find(row => row.id === pick.id)
    if (!task || task.remaining > pick.minutes+EPS || !trustedCore(task,pick,lookup))
      return describe('unchanged','Native action, confirmed core phase and deadline do not agree')
    if (reference.action?.id === task.id) return describe('unchanged','The advisor already selected the Atlas commitment')
    const offeredUntil = reference.action?.end ?? reference.hold!.until
    if (nativeStillPossible(task,v3.freeIntervals!,offeredUntil,pick.end-pick.start))
      return describe('unchanged','The proposed action leaves a usable native Atlas window')
    const confirmed = new Set(input.confirmedDeadlines ?? [])
    const stronger = state.tasks.filter(row => row.id !== task.id && (higherTutor(row) || confirmed.has(row.id)))
    if (stronger.some(row => row.id === reference.action?.id))
      return describe('precedence','The advisor already serves a confirmed higher-precedence deadline')
    const planned = certificate(stronger,v3.freeIntervals!,pick.end)
    if (!planned) return describe('precedence','A joint stronger-deadline continuation could not be certified')
    const ids = new Set(input.protectedPersonal ?? [])
    const personal = state.tasks.flatMap((row,index) => ids.has(row.id) && row.kind === 'personal' ? [{task:row,index}] : [])
    if (!protectsFloor(state,v3.freeIntervals!,personal,reference,pick))
      return describe('precedence','The personal-commitment floor rejected the native override')
    if (validateDecision(input,{action:pick,hold:null}).length)
      return describe('precedence','The native override failed the current hard guard')
    return {...v3,policy:'atlas_commitment',reason:'The confirmed core action is in its last usable native Atlas window',
      commitment:{status:'preserved',taskId:task.id,continuation:planned}}
  } catch (error) {
    return describe('unchanged','Commitment evidence could not be validated',{error:errorMessage(error)})
  }
}
