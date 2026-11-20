// Port of the 2026-11-20 Atlas handoff (scheduler/portfolio.mjs).
import type { Evidence, Forecast, Legal, Observation, PreparedTask, Scenario, Selection, State } from './types.ts';
import { EPS, available, byDeadline, fitting, makeAction, nextBoundary, validatePrepared } from './constraints.ts'

const clamp = (value:number,lo:number,hi:number) => Math.max(lo,Math.min(hi,value))
const mean = (xs:number[]) => xs.length ? xs.reduce((a,b) => a+b,0)/xs.length : 0
const median = (xs:number[]) => xs.length ? xs.slice().sort((a,b) => a-b)[Math.floor(xs.length/2)] : 0
const quantile = (xs:number[],q:number) => xs.slice().sort((a,b) => a-b)[Math.floor((xs.length-1)*q)]
const sampleCount = 20
const important = (task:PreparedTask) => task.core || task.required || (task.kind === 'tutor' && task.severity === 3)

export function evidenceFrom(history:Observation[]=[]) {
  const durations = history.filter(row => Number.isFinite(row?.estimated) && row.estimated! > 0 &&
    Number.isFinite(row?.actual) && row.actual! > 0).slice(-24)
    .map(row => clamp(Math.log(row.actual!/row.estimated!),-1.4,1.4))
  const attendance = history.filter(row => typeof row?.kept === 'boolean').slice(-24)
  const sample = durations.length
  const center = median(durations)
  const shift = sample >= 8 ? Math.abs(median(durations.slice(-4))-median(durations.slice(0,-4))) : 0
  return {sample,center,shift,attendanceSample:attendance.length,
    kept:(attendance.filter(row => row.kept).length+3)/(attendance.length+4),
    spread:clamp(1.4826*median(durations.map(value => Math.abs(value-center)))+.09+shift/2,.12,.65),
    supported:sample >= 8 && shift <= .28}
}

function rngFor(index:number) {
  let value = Math.imul(0x9e3779b9,index+1)
  return () => {
    value += 0x6D2B79F5
    let next = Math.imul(value ^ (value >>> 15),value | 1)
    next ^= next + Math.imul(next ^ (next >>> 7),next | 61)
    return ((next ^ (next >>> 14)) >>> 0)/4294967296
  }
}

function normal(rng:()=>number) {
  return Math.sqrt(-2*Math.log(1-rng()))*Math.cos(2*Math.PI*rng())
}

export function makeScenarios(state:State,evidence:Evidence) {
  return Array.from({length:sampleCount},(_,index) => {
    const rng = rngFor(index)
    const shock = normal(rng)
    const required = state.tasks.map(task => Math.max(.25,task.remaining*
      Math.exp(clamp(evidence.center+evidence.spread*(.45*shock+.89*normal(rng)),-1.4,1.4))))
    const windows = state.windows.filter(window => window.start === state.now || rng() < evidence.kept)
    return {required,windows}
  })
}

export function forecastsFor(state:State,scenarios:Scenario[]) {
  return state.tasks.map((task,index) => {
    const accessibleMinutes = available(state.windows,task,state.now)
    const feasible = scenarios.filter(scenario => scenario.required[index]+task.pending <=
      available(scenario.windows,{...task,remaining:scenario.required[index]},state.now)+EPS).length
    return {id:task.id,accessibleMinutes,pFeasible:feasible/scenarios.length,
      estimatedMinutes:task.remaining,requiredP80:quantile(scenarios.map(sample => sample.required[index]),.8),
      meaning:task.split ? 'Task-alone capacity estimate allowing legal slices' : 'Task-alone contiguous capacity estimate'}
  })
}

function keyOf(decision:Selection) {
  const {action,hold} = decision
  return action ? [action.id,action.end,action.minutes].join('|') : 'hold:'+hold!.until
}

function candidateSet(state:State,legal:Legal,picks:Selection[],forecasts:Forecast[]) {
  const {window,options} = legal
  const byId = new Map(forecasts.map(forecast => [forecast.id,forecast]))
  const boundary = nextBoundary(state,window)
  const rows = [...picks]
  const short = options.slice().sort((a,b) => byDeadline(a.task,b.task)).slice(0,3)
  for (const {task,full} of short) {
    const basis = fitting(task,state.now,window,boundary) || full
    rows.push({action:makeAction(task,state.now,basis),hold:null})
    const cap = Math.min(task.deadline,window.end)-state.now-task.pending
    const next = Math.min(cap,byId.get(task.id)!.requiredP80)
    const buffer = Math.max(0,next-basis)
    if (basis >= task.remaining-EPS && buffer >= 1 && state.now+task.pending+basis+buffer <= boundary+EPS)
      rows.push({action:makeAction(task,state.now,basis,buffer),hold:null})
  }
  const distinct = new Map<string,Selection>()
  for (const row of rows) {
    if (!validatePrepared(state,row).length) distinct.set(keyOf(row),row)
  }
  return [...distinct.values()]
}

function simulate(state:State,scenario:Scenario,candidate:Selection) {
  state.input.checkDeadline?.()
  const work = state.tasks.map((task,i) => ({...task,initial:scenario.required[i],
    remaining:scenario.required[i],minimum:task.split ? task.minimum : scenario.required[i],complete:false}))
  const projects = new Map(work.filter(task => task.projectId).map(task => [task.projectId,0]))
  let active = state.activeId
  let at = state.now
  const apply = (task:typeof work[number],elapsed:number) => {
    if (active && active !== task.id) {
      const paused = work.find(item => item.id === active && item.remaining > EPS)
      if (paused) paused.pending += state.resumeCost
      active = undefined
    }
    const prep = Math.min(task.pending,elapsed)
    task.pending -= prep
    const productive = Math.min(task.remaining,elapsed-prep)
    if (task.split || productive+EPS >= task.remaining) {
      task.remaining -= productive
      if (task.projectId) projects.set(task.projectId,projects.get(task.projectId)!+productive)
      task.complete = task.remaining <= EPS
    }
  }
  if (candidate.action) {
    const chosen = work.find(task => task.id === candidate.action!.id)!
    const budget = candidate.action.end-at
    const elapsed = Math.min(budget,chosen.remaining+chosen.pending)
    apply(chosen,elapsed)
    at += elapsed
  } else at = candidate.hold!.until

  for (const window of scenario.windows) {
    at = Math.max(at,window.start)
    while (at+EPS < window.end) {
      const locked = at < state.protectedUntil && work.some(task => task.id === active && task.remaining > EPS)
      const ready = work.filter(task => task.remaining > EPS && (!locked || task.id === active))
        .map(task => ({task,amount:fitting(task,at,window),slack:0,urgent:false,value:0})).filter(row => row.amount > EPS)
      const release = Math.min(window.end,...work.filter(task => task.remaining > EPS && task.release > at)
        .map(task => task.release))
      const boundary = Math.min(release,locked ? state.protectedUntil : Infinity)
      if (!ready.length) {
        at = boundary
        continue
      }
      for (const row of ready) {
        const {task} = row
        row.slack = available(scenario.windows,task,at)-task.remaining-task.pending
        row.urgent = task.kind === 'tutor' && task.severity >= 3 && (task.required === true || row.slack <= 10)
        const coverage = task.projectId ? projects.get(task.projectId)! : 0
        row.value = task.weight/(task.remaining+task.pending) * (coverage <= EPS ? 1.08 : 1)
      }
      ready.sort((a,b) => Number(b.urgent)-Number(a.urgent) ||
        Number(b.slack >= -EPS)-Number(a.slack >= -EPS) ||
        (a.slack <= 8 || b.slack <= 8 ? a.slack-b.slack : b.value-a.value) ||
        byDeadline(a.task,b.task))
      const {task,amount} = ready[0]
      const minutes = fitting(task,at,window,boundary) || amount
      const elapsed = task.pending+minutes
      apply(task,elapsed)
      at += elapsed
    }
  }
  const weight = work.reduce((sum,task) => sum+task.weight,0) || 1
  const score = work.reduce((sum,task) => sum+task.weight*(task.complete ? 1 :
    task.progress*(1-task.remaining/task.initial)),0)/weight
  const cover = projects.size ? [...projects.values()].filter(value => value > EPS).length/projects.size : 0
  return {score:(1-.02)*score+.02*cover,
    important:new Set(work.filter(task => important(task) && task.complete).map(task => task.id))}
}

export function wilsonLower(wins:number,total:number,z=1.64485362695147) {
  const p = wins/total
  const zz = z*z/total
  return (p+zz/2-z*Math.sqrt((p*(1-p)+zz/4)/total))/(1+zz)
}

export function rankPortfolio(state:State,legal:Legal,baseline:Selection,alternatives:Selection[],scenarios:Scenario[],forecasts:Forecast[]) {
  const decisions = candidateSet(state,legal,[baseline,...alternatives],forecasts)
  const rows = decisions.map(decision => {
    const outcomes = scenarios.map(scenario => simulate(state,scenario,decision))
    return {decision,outcomes,value:mean(outcomes.map(outcome => outcome.score))}
  })
  const base = rows.find(row => keyOf(row.decision) === keyOf(baseline))!
  rows.sort((a,b) => b.value-a.value ||
    Number(keyOf(b.decision) === keyOf(baseline))-Number(keyOf(a.decision) === keyOf(baseline)))
  const best = rows[0]
  const deltas = best.outcomes.map((outcome,i) => outcome.score-base.outcomes[i].score)
  const wins = deltas.filter(delta => delta > EPS).length
  const losses = deltas.filter(delta => delta < -EPS).length
  const criticalLosses = best.outcomes.filter((outcome,i) =>
    [...base.outcomes[i].important].some(id => !outcome.important.has(id))).length
  const support = {scenarios:scenarios.length,candidates:rows.length,wins,losses,criticalLosses,
    gain:mean(deltas),probabilityOfStrictGain:wins/scenarios.length,wilsonLower:wilsonLower(wins,scenarios.length)}
  const approved = support.wilsonLower > .5 && support.gain >= .015 && !criticalLosses
  return {decision:best.decision,support,approved}
}
