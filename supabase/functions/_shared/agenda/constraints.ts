// Port of the 2026-11-20 Atlas handoff (scheduler/constraints.mjs).
import type { Fixed, Legal, Pick, PreparedTask, Selection, Snapshot, State, Window } from './types.ts';
import { errorMessage } from './types.ts';
import { freeIntervals } from './lookahead.ts'
import { tutorState } from './authority.ts'

export const EPS = 1e-8
export const byDeadline = (a:PreparedTask,b:PreparedTask) => a.deadline-b.deadline || b.weight-a.weight || a.id.localeCompare(b.id)
export const supportedKinds = ['course','card','personal','tutor']
const finite = Number.isFinite
const text = (value:unknown) => typeof value === 'string' && value.length > 0
const positive = (value:unknown): value is number => typeof value === 'number' && finite(value) && value >= 0
const permit = (window:Window,task:PreparedTask) => !window.projectId || window.projectId === task.projectId

function requireInput(condition:unknown,message:string): asserts condition {
  if (!condition) throw new TypeError(message)
}

function normalizeFixed(fixed:Fixed[]) {
  const authoritative = new Map<string, Fixed & {revision:number;before:number;after:number}>()
  const conflicts = new Set()
  for (const record of fixed) {
    const id = record.occurrenceKey ?? record.id
    requireInput(text(id) && positive(record.revision ?? 0), 'Invalid fixed occurrence identity')
    if (record.role === 'studyWindow') continue
    const previous = authoritative.get(id)
    const revision = record.revision ?? 0
    if (previous && previous.revision > revision) continue
    const event = {id,revision,start:record.start,end:record.end,before:record.before ?? 0,
      after:record.after ?? 0,cancelled:!!record.cancelled}
    if (previous?.revision === revision) {
      if (JSON.stringify(previous) !== JSON.stringify(event)) conflicts.add(id)
      continue
    }
    conflicts.delete(id)
    authoritative.set(id,event)
  }
  requireInput(!conflicts.size,'Fixed occurrence copies conflict')
  const events = [...authoritative.values()].filter(event => !event.cancelled)
  for (const event of events) {
    requireInput(finite(event.start) && finite(event.end) && event.end > event.start &&
      positive(event.before) && positive(event.after), 'Invalid fixed interval')
  }
  return events
}

export function prepare(input:Snapshot):State {
  const {now,end} = input
  requireInput(finite(now) && finite(end) && end >= now, 'Invalid horizon')
  const fixed = normalizeFixed(input.fixed ?? [])
  const calendar = freeIntervals({now,end,fixed})
  const declared = (input.availability ?? [{start:now,end}]).slice().sort((a,b) => a.start-b.start)
  let previousEnd = -Infinity
  for (const interval of declared) {
    requireInput(finite(interval.start) && finite(interval.end) && interval.end >= interval.start &&
      interval.start >= previousEnd && (interval.projectId == null || text(interval.projectId)),
      'Invalid or overlapping availability')
    previousEnd = interval.end
  }
  const windows = []
  for (const free of calendar.freeIntervals) {
    for (const interval of declared) {
      const start = Math.max(free.start,interval.start)
      const stop = Math.min(free.end,interval.end)
      if (stop > start) windows.push({start,end:stop,projectId:interval.projectId})
    }
  }
  const studyReturnAt = input.studyReturnAt ?? now
  const protectedUntil = input.protectedUntil ?? now
  const resumeCost = input.resumeCost ?? 0
  requireInput(finite(studyReturnAt) && finite(protectedUntil) && positive(resumeCost), 'Invalid working boundary')
  const ids = new Set()
  const tasks = []
  const pendingTutor = []
  const expired = []
  for (const original of input.tasks ?? []) {
    if (original?.unannounced && finite(original.release) && original.release! > now) continue
    requireInput(text(original.id) && !ids.has(original.id), 'Invalid or duplicate task ID')
    ids.add(original.id)
    const {id,kind,remaining} = original
    const release = original.release ?? now
    const due = (kind === 'card' ? (original.needBy ?? original.due) : original.due) ?? end
    const expiry = original.expiry ?? end
    const importance = original.importance ?? 1
    const severity = original.severity ?? 0
    const split = original.splittable ?? (kind === 'course')
    const minimum = original.minChunk ?? 5
    const pending = original.resumeMinutes ?? 0
    const progress = original.progressWeight ?? (kind === 'course' ? .15 : 0)
    requireInput(supportedKinds.includes(kind) && positive(remaining) && positive(importance) &&
      positive(severity) && severity <= 3 && finite(release) && finite(due) && finite(expiry) &&
      typeof split === 'boolean' && finite(minimum) && minimum > 0 && positive(pending) &&
      positive(progress) && progress <= 1, 'Invalid task fields')
    if (remaining <= EPS) continue
    const task = {...original,id,kind,remaining,due,expiry,severity,split,pending,
      release:kind === 'personal' ? release : Math.max(release,studyReturnAt),
      minimum:split ? minimum : remaining, deadline:Math.min(due,expiry,end),
      weight:importance * (kind === 'tutor' ? 1+severity/3 : 1),progress}
    if (kind === 'tutor') {
      const state = tutorState(task,now)
      if (state !== 'authorized') {
        pendingTutor.push({id,state})
        if (task.deadline <= now) expired.push(id)
        continue
      }
    }
    if (task.deadline <= now) {
      expired.push(id)
      continue
    }
    tasks.push(task)
  }
  tasks.sort((a,b) => a.id.localeCompare(b.id))
  return {now,end,fixed,windows,tasks,expired,pendingTutor,calendar,
    activeId:input.activeId,protectedUntil,resumeCost,input}
}

export function available(windows:Window[],task:PreparedTask,now:number) {
  const sizes = windows.filter(window => permit(window,task)).map(window =>
    Math.max(0,Math.min(task.deadline,window.end)-Math.max(task.release,window.start,now)))
  if (!task.split) return Math.max(0,...sizes)
  const minimum = Math.min(task.minimum,task.remaining)
  let capacity = 0
  let finalTail = 0
  for (const size of sizes) {
    if (size+EPS >= minimum) capacity += size
    else if (capacity >= minimum-EPS && capacity+size+EPS >= task.remaining+task.pending)
      finalTail = Math.max(finalTail,size)
  }
  return capacity+finalTail
}

export function fitting(task:PreparedTask,now:number,window:Window,boundary=window.end) {
  if (task.release > now || !permit(window,task)) return 0
  const room = Math.min(task.deadline,window.end,boundary)-now-task.pending
  if (room+EPS < Math.min(task.minimum,task.remaining)) return 0
  return Math.max(0,Math.min(task.remaining,room))
}

export function nextBoundary(state:State,window:Window) {
  const releases = state.tasks.filter(task => task.release > state.now).map(task => task.release)
  return Math.min(window.end,...releases,
    state.protectedUntil > state.now && state.tasks.some(task => task.id === state.activeId)
      ? state.protectedUntil : Infinity)
}

export function safeOptions(state:State):Legal {
  const window = state.windows[0]
  if (!window || window.start > state.now) return {window,options:[],urgent:null}
  const protectedNow = state.now < state.protectedUntil && state.tasks.some(task => task.id === state.activeId)
  const raw = state.tasks.filter(task => !protectedNow || task.id === state.activeId).map(task =>
    ({task,full:fitting(task,state.now,window)})).filter(row => row.full > EPS)
  const urgent = raw.filter(({task}) => task.kind === 'tutor' && task.severity >= 3 &&
    (task.required || available(state.windows,task,state.now)-task.remaining-task.pending <= 10))
    .sort((a,b) => byDeadline(a.task,b.task))[0] ?? null
  return {window,options:urgent ? [urgent] : raw,urgent}
}

export function makeAction(task:PreparedTask,now:number,minutes:number,buffer=0) {
  const action:Pick = {id:task.id,kind:task.kind,start:now,end:now+task.pending+minutes+buffer,
    minutes,resumeMinutes:task.pending}
  if (buffer > 0) action.bufferMinutes = buffer
  return action
}

export function holdDecision(state:State,reason:string) {
  const window = state.windows[0]
  const until = !window ? state.end : window.start > state.now ? window.start : nextBoundary(state,window)
  return {action:null,hold:{until,reason}}
}

export function validatePrepared(state:State,decision:Selection) {
  if (!decision || (decision.action == null && decision.hold == null)) return ['Missing action or hold']
  if (decision.action == null) {
    if (safeOptions(state).urgent) return ['An authorized urgent tutor repair fits now']
    const until = decision.hold?.until ?? NaN
    return finite(until) && until <= holdDecision(state,'').hold.until+EPS &&
      (until > state.now || state.end === state.now)
      ? [] : ['Invalid hold boundary']
  }
  const {action} = decision
  const {options,window} = safeOptions(state)
  const option = options.find(row => row.task.id === action.id)
  if (!option) return ['Action violates release, authority, availability, urgency, or protection']
  const {task,full} = option
  const buffer = action.bufferMinutes ?? 0
  if (decision.hold || !positive(buffer) ||
      (buffer > 0 && Math.abs(action.minutes-task.remaining) > EPS) ||
      action.end > Math.min(window.end,task.deadline)+EPS || action.kind !== task.kind || action.start !== state.now ||
      !finite(action.minutes) || action.minutes < Math.min(task.minimum,task.remaining)-EPS ||
      action.minutes > full+EPS || action.resumeMinutes !== task.pending ||
      !finite(action.end) || Math.abs(action.end-action.start-action.minutes-task.pending-buffer) > EPS) {
    return ['Action duration violates a hard constraint']
  }
  return []
}

export function validateDecision(input:Snapshot,decision:Selection) {
  try {
    return validatePrepared(prepare(input),decision)
  } catch (error) {
    return [errorMessage(error)]
  }
}
