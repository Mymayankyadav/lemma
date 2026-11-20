// Port of the 2026-11-20 Atlas handoff (scheduler/selector.mjs).
import type { Detail, Evidence, Forecast, Legal, Options, Ranked, Selection, Snapshot, State } from './types.ts';
import { errorMessage } from './types.ts';
import { canOfferTip } from './authority.ts'
import { EPS, holdDecision, makeAction, prepare, safeOptions, validateDecision, validatePrepared } from './constraints.ts'
import { agendaChoice, atlasChoice, deadlineChoice } from './comparators.ts'
import { evidenceFrom, forecastsFor, makeScenarios, rankPortfolio } from './portfolio.ts'

export { validateDecision }
export const policies = ['v3','agenda','deadline','importance','portfolio','conservative']

function disagreements(state:State,forecast:Forecast) {
  const task = state.tasks.find(item => item.id === forecast.id)!
  if (forecast.accessibleMinutes+EPS >= task.remaining+task.pending && forecast.pFeasible >= .8) return []
  if (task.importance === 0 && !task.core && !task.required) return []
  const reason = forecast.accessibleMinutes+EPS < task.remaining+task.pending
    ? 'Estimated work exceeds eligible calendar capacity'
    : 'Duration or attendance uncertainty puts this task at risk'
  return [{id:task.id,reason,pFeasible:forecast.pFeasible,
    choices:['Add time','Move the deadline with approval','Reduce named scope with approval']}]
}

function tipFor(state:State,forecasts:Forecast[],legal:Legal) {
  const tip = state.input.interleaving
  if (!tip || legal.urgent || forecasts.some(row => row.pFeasible < .8) || !legal.window ||
      legal.window.start > state.now || state.protectedUntil > state.now) return null
  const timings = [tip.typicalMinutes,tip.alternativeMinutes,tip.promptMinutes,tip.switchMinutes]
  if (timings.some(value => !Number.isFinite(value) || value < 0)) return null
  const headroom = Math.min(tip.headroom ?? Infinity,legal.window.end-state.now)
  return canOfferTip({...tip,headroom}) ? {id:tip.id,kind:'optional interleaving',
    reason:'A related problem fits at this boundary without reducing the planned full problem count'} : null
}

function decorate(state:State,decision:Selection,{policy,reason,forecasts=[],evidence={},legal}: {policy:string;reason:string;forecasts?:Forecast[];evidence?:Partial<Evidence> & Detail;legal:Legal}) {
  return {...decision,policy,reason,forecasts,evidence,
    risks:forecasts.flatMap(forecast => disagreements(state,forecast)),
    pendingTutor:state.pendingTutor,expired:state.expired,
    fixedConflicts:state.calendar.conflicts,currentFixed:state.calendar.currentFixed,
    nextFixed:state.calendar.nextFixed,freeIntervals:state.windows,
    interleavingTip:tipFor(state,forecasts,legal)}
}

export function selectSchedule(input:Snapshot,options:Options={}):Ranked {
  let state
  try {
    state = prepare(input)
  } catch (error) {
    const until = Number.isFinite(input?.end) ? input.end : input?.now ?? null
    return {policy:'hold',reason:'Invalid calendar or task input',action:null,
      hold:{until,reason:'Correct the conflicting input before scheduling'},
      evidence:{error:errorMessage(error)},forecasts:[],risks:[]}
  }
  const requested = options.policy ?? 'conservative'
  const legal = safeOptions(state)
  let baseline:Selection
  try {
    baseline = atlasChoice(state,legal)
    const errors = validatePrepared(state,baseline)
    if (errors.length && !legal.urgent) throw new Error(errors[0])
  } catch (error) {
    baseline = {...deadlineChoice(state,legal),origin:'compatibility deadline',baselineError:errorMessage(error)}
  }
  let forecasts:Forecast[] = []
  let support:Partial<Evidence> & Detail = {}
  const finish = (decision:Selection,policy:string,reason:string,evidence:Detail={}) =>
    decorate(state,decision,{policy,reason,forecasts,evidence:{...support,...evidence},legal})

  try {
    const evidence = evidenceFrom(input.history)
    support = {...evidence,baselineOrigin:baseline.origin,baselineError:baseline.baselineError ?? null}
    const stochastic = requested === 'portfolio' ||
      requested === 'conservative' && evidence.supported && !baseline.baselineError
    const bounded = state.tasks.length <= 20 && state.windows.length <= 36
    const needScenarios = bounded && (options.includeForecasts !== false || stochastic && legal.options.length)
    const scenarios = needScenarios ? makeScenarios(state,evidence) : null
    if (scenarios) forecasts = forecastsFor(state,scenarios)

    if (!policies.includes(requested)) return finish(baseline,'v3','Unknown policy. Using the feasible baseline')
    if (legal.urgent) {
      const {task,full} = legal.urgent
      return finish({action:makeAction(task,state.now,full),hold:null},'urgent',
        'An authorized severe tutor repair fits at this boundary')
    }
    if (!legal.options.length) return finish(baseline,'hold',baseline.hold!.reason)
    if (requested === 'v3') return finish(baseline,'v3','Atlas v3 with the mixed calendar guard')
    const deadline = deadlineChoice(state,legal)
    if (requested === 'deadline') return finish(deadline,'deadline','First feasible deadline')
    const importance = deadlineChoice(state,legal,true)
    if (requested === 'importance') return finish(importance,'importance','Highest declared priority that fits')
    if (requested === 'conservative' && baseline.baselineError)
      return finish(baseline,'v3','Atlas evidence could not be used. Applying the feasible compatibility action')
    if (requested === 'conservative' && !evidence.supported)
      return finish(baseline,'v3',evidence.sample < 8 ? 'Too little observed duration history' : 'Recent duration behavior shifted')
    if (!bounded) return finish(baseline,'v3','Calendar exceeds bounded portfolio support')
    const previous = agendaChoice(state,legal)
    if (requested === 'agenda') return finish(previous,'agenda','Previous agenda calendar lookahead')
    const result = rankPortfolio(state,legal,baseline,[deadline,importance,previous,holdDecision(state,'Wait until the next known boundary')],
      scenarios!,forecasts)
    if (requested === 'portfolio' || result.approved && !validatePrepared(state,result.decision).length)
      return finish(result.decision,'portfolio',requested === 'portfolio' ? 'Highest modeled portfolio return' :
        'The gain clears the paired probability, effect, and critical-task gates',result.support)
    return finish(baseline,'v3','Projected evidence does not clear all selection gates',result.support)
  } catch (error) {
    if (legal.urgent) {
      const {task,full} = legal.urgent
      return finish({action:makeAction(task,state.now,full),hold:null},'urgent',
        'An authorized severe tutor repair fits at this boundary',{error:errorMessage(error)})
    }
    return finish(baseline,'v3',errorMessage(error) === 'Decision budget exceeded' ? 'Decision budget exceeded' : 'Decision evidence failed. Using the feasible baseline',{error:errorMessage(error)})
  }
}
