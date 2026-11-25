// Port of the 2026-11-20 Atlas handoff (scheduler/comparators.mjs).
import type { Legal, Option, PreparedTask, State, Window } from './types.ts';
import { chooseAgenda } from './lookahead.ts'
import { sessionQueue } from '../adaptive/kg.ts'
import { replay } from '../adaptive/measure.ts'
import { allocateProjects } from '../adaptive/scheduler.ts'
import { byDeadline, fitting, holdDecision, makeAction, nextBoundary, validatePrepared } from './constraints.ts'

const referenceEpoch = Date.UTC(2026,10,16)
const kinds = ['practice','review','teach','check','probe']
const academic = (task:PreparedTask) => task.kind === 'course' || task.kind === 'card'
const finite = Number.isFinite

function decision(state:State,window:Window,entry:Option) {
  const minutes = fitting(entry.task,state.now,window,nextBoundary(state,window)) || entry.full
  return {action:makeAction(entry.task,state.now,minutes),hold:null}
}

export function deadlineChoice(state:State,legal:Legal,importance=false) {
  if (!legal.options.length) return holdDecision(state,'No authorized task fits this window')
  const ranked = legal.options.slice().sort((a,b) =>
    (importance ? b.task.weight-a.task.weight : 0) || byDeadline(a.task,b.task))
  return decision(state,legal.window,ranked[0])
}

export function atlasChoice(state:State,legal:Legal) {
  if (!legal.options.length) return {...holdDecision(state,'No authorized task fits this window'),origin:'calendar guard'}
  const native = state.tasks.some(task => academic(task) && task.atlasAction)
  if (!native) return {...deadlineChoice(state,legal),origin:'compatibility deadline'}
  const todo = legal.options.filter(({task}) => academic(task) && task.atlasAction)
  const other = legal.options.filter(({task}) => !academic(task) || !task.atlasAction)
    .sort((a,b) => byDeadline(a.task,b.task))[0]
  const {window} = legal
  const block = window.end-state.now
  const model = state.input.atlasModel ?? replay({concepts:[],attempts:[]},{},referenceEpoch+state.now*60000)
  const at = (minute:number) => model.now+(minute-state.now)*60000
  const study = todo.map(({task,full}) => {
    const atlas = task.atlasAction!
    if (!kinds.includes(atlas.kind) || typeof atlas.concept_id !== 'string' ||
      !finite(atlas.p) || atlas.p < 0 || atlas.p > 1 ||
      atlas.needAt != null && !finite(atlas.needAt) ||
      atlas.weight != null && (!finite(atlas.weight) || atlas.weight < 0)) {
      throw new TypeError('Invalid Atlas action evidence')
    }
    const minutes = fitting(task,state.now,window,nextBoundary(state,window)) || full
    // An exam is a splittable study block. Native ranking reserves its usual
    // close time before choosing a block, just as it does for fixed-size lessons.
    const usable=atlas.exam?Math.min(minutes,Math.floor(block-Math.min(10,block*.1))-task.pending):minutes;
    return {...atlas,id:task.nativeId??task.id,minutes:usable>=task.minimum?usable+task.pending:minutes+task.pending,
      needAt:atlas.needAt ?? at(task.deadline),
      project_id:atlas.kind === 'review' ? undefined : task.projectId,home:task.projectId}
  })
  if (!finite(model.now)) throw new TypeError('Invalid Atlas measurement clock')
  const projects = new Map<string, import('../adaptive/scheduler.ts').ProjectNeed>()
  const evidence = new Map((state.input.atlasProjects ?? []).map(project => [project.id,project]))
  for (const {task} of todo) {
    if (!task.projectId) continue
    const external = evidence.get(task.projectId)
    const previous = projects.get(task.projectId)
    const supplied = (previous?.needMinutes ?? 0)+task.remaining+task.pending
    projects.set(task.projectId,{id:task.projectId,pCore:external?.pCore ?? 1,
      deadline:external?.deadline ?? new Date(at(task.deadline)).toISOString(),
      weight:external?.weight ?? 1,share_weight:external?.share_weight,needMinutes:supplied})
  }
  const shares = projects.size > 1 ? Object.fromEntries(allocateProjects([...projects.values()],block)
    .map(allocation => [allocation.id,allocation.minutes])) : undefined
  const queue = sessionQueue(model,study,block,state.input.cardCap ?? .125,shares)
  const first = queue.items[0]
  const nextStudy = todo.find(({task}) => first && (task.nativeId??task.id)===first.id &&
    (!task.nativeId || task.projectId===(first.project_id??first.home)))
  const pick = !nextStudy ? other : !other ? nextStudy
    : byDeadline(nextStudy.task,other.task) <= 0 ? nextStudy : other
  if (pick===nextStudy && pick?.task.atlasAction?.exam && first)
    return {action:makeAction(pick.task,state.now,first.minutes-pick.task.pending),hold:null,origin:'Atlas v3 exam study block'};
  if (pick) return {...decision(state,window,pick),
    origin:pick === nextStudy ? 'Atlas v3 session queue' : 'mixed calendar deadline merge'}
  return {...holdDecision(state,'Atlas v3 reserves this time for its study-session constraints'),
    origin:'Atlas v3 queue hold'}
}

export function agendaChoice(state:State,legal:Legal) {
  if (!legal.options.length) return holdDecision(state,'No authorized task fits this window')
  const fixed = state.windows.flatMap((window,index) => {
    const start = state.windows[index-1]?.end ?? state.now
    return start < window.start ? [{id:'unavailable:'+index,start,end:window.start}] : []
  })
  const last = state.windows.at(-1)?.end ?? state.now
  if (last < state.end) fixed.push({id:'unavailable:tail',start:last,end:state.end})
  const allowedNow = new Set(legal.options.map(row => row.task.id))
  const current = state.windows[0]
  const tasks = state.tasks.filter(task => task.release > state.now || allowedNow.has(task.id) ||
    current.projectId && task.projectId !== current.projectId).map(task => {
    const permittedLater = state.windows.find(window => window.start >= current.end &&
      (!window.projectId || window.projectId === task.projectId))
    const release = !allowedNow.has(task.id) && task.release <= state.now
      ? permittedLater?.start ?? state.end : task.release
    return {...task,release,due:task.deadline,remaining:task.remaining,
      importance:task.importance ?? 1,resumeMinutes:task.pending}
  })
  const proposed = chooseAgenda({checkDeadline:state.input.checkDeadline,now:state.now,end:state.end,fixed,tasks,activeId:state.activeId,
    protectedUntil:state.protectedUntil,resumeCost:state.resumeCost})
  return validatePrepared(state,proposed).length ? deadlineChoice(state,legal) : proposed
}
