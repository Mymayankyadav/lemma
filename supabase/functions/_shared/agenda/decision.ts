import type { AgendaDecision, AgendaOutcome, SchedulingAlgorithm } from './contract.ts';
import { selectProtectedSchedule } from './fairness.ts';
import { selectOwnerPolicy } from './owner.ts';
import { prepare, validateDecision } from './constraints.ts';
import type { Commitment, Ranked, Snapshot } from './types.ts';

export const POLICY_VERSION = 'atlas-owner-2026-11-20.1';
export const BASELINE_VERSION = 'atlas-v3-mixed-calendar.1';
export interface DecisionFacts {
  asOf:string; watermark:string; state:Snapshot; capacityKnown:boolean;
  verifiedCommitments?: ReadonlyMap<string,Commitment>; blockedReason?:string;
}
export interface ShadowResult {
  served: AgendaDecision; candidate: AgendaDecision; elapsedMs:number; hardViolations:number;
}
const held = (kind:Exclude<AgendaOutcome['kind'],'action'>, until:number|null):AgendaOutcome => ({kind,until});

/** Recheck the actual returned interval against the owner's original declarations, including reservations. */
function legal(state:Snapshot, result:Ranked): boolean {
  const {action,hold} = result;
  if (validateDecision(state,result).length) return false;
  if (!action) return !!hold;
  return !(state.personalReservations ?? []).some(reservation =>
    state.tasks.some(task => task.id === reservation.taskId && task.remaining > 0) &&
    reservation.taskId !== action.id && action.start < reservation.end && action.end > reservation.start);
}
function outcome(state:Snapshot,result:Ranked):AgendaOutcome {
  if (result.action) {
    const {id,start,end} = result.action;
    return {kind:'action',taskId:id,start,end};
  }
  const until = result.hold?.until ?? null;
  const fixed = prepare(state).fixed.some(event => event.start-(event.before ?? 0) <= state.now && event.end+(event.after ?? 0) > state.now);
  if (fixed) return held('fixed',until);
  if (state.protectedUntil !== undefined && state.protectedUntil > state.now) return held('protected',until);
  if (!state.availability?.length) return held('no-capacity',until);
  return held('hold',until);
}
export function holdReceipt(asOf:string,watermark:string,requested:SchedulingAlgorithm,reason:string,
  until:number|null=null,kind:Exclude<AgendaOutcome['kind'],'action'>='unavailable'):AgendaDecision {
  const outcome=held(kind,until);
  return {asOf,snapshotVersion:watermark,requested,effective:'hold',policyVersion:BASELINE_VERSION,reason,outcome,baseline:outcome};
}
/** Both policies see exactly the same snapshot. This operation never edits a session, queue or assignment. */
export function decideAgenda(facts:DecisionFacts,requested:SchedulingAlgorithm,
  clock:()=>number=()=>performance.now(),budgetMs=100):ShadowResult {
  const started=clock(), {asOf,watermark,state} = facts;
  let violations=0;
  const finish=(candidate:AgendaDecision,served=candidate):ShadowResult =>
    ({served,candidate,elapsedMs:Math.max(0,clock()-started),hardViolations:violations});
  if (facts.blockedReason || !watermark || !Number.isFinite(state.now) || Math.abs(Date.parse(asOf)/60000-state.now)>1e-7 ||
      !Number.isFinite(Date.parse(asOf)) || !Number.isFinite(state.end) || state.end<=state.now)
    return finish(holdReceipt(asOf,watermark,requested,facts.blockedReason ?? 'Snapshot clock or horizon unavailable'));
  if (!facts.capacityKnown || !Array.isArray(state.availability)) return finish(holdReceipt(asOf,watermark,requested,'Available study time has not been declared'));
  try {
    const prepared=prepare(state);
    // A withdrawn or missing active task may not dissolve a still-protected interval.
    if (state.activeId && prepared.protectedUntil>state.now && !prepared.tasks.some(t =>
        t.id===state.activeId && t.release<=state.now && !t.declined))
      return finish(holdReceipt(asOf,watermark,requested,'Protected activity needs an explicit release',Math.min(state.end,prepared.protectedUntil),'protected'));
    const baseline=selectProtectedSchedule(state,{policy:'v3',includeForecasts:false});
    if (!legal(state,baseline)) {
      violations++;
      return finish(holdReceipt(asOf,watermark,requested,'No validated native action is available'));
    }
    const native=outcome(state,baseline);
    const legacy:AgendaDecision={asOf,snapshotVersion:watermark,requested,effective:native.kind==='action'?'legacy':'hold',
      policyVersion:BASELINE_VERSION,reason:baseline.reason,outcome:native,baseline:native,
      unresolved:[...prepared.expired.map(taskId=>({taskId,reason:'Deadline or expiry has passed'})),
        ...prepared.pendingTutor.map(row=>({taskId:row.id,reason:row.state}))]};
    const fallback=(reason:string)=>{const candidate={...legacy,reason};return finish(candidate,requested==='new'?candidate:legacy);};
    const timed:Snapshot={...state,checkDeadline(){if(clock()-started>=budgetMs)throw Error('Decision budget exceeded');}};
    let result:Ranked;
    try {
      timed.checkDeadline!();
      result=selectOwnerPolicy(timed,{policy:'conservative',includeForecasts:false,
        verifiedAtlasCommitment:id=>facts.verifiedCommitments?.get(id)});
      if (!legal(state,result)) {
        violations++;
        return fallback('Candidate failed independent legality validation');
      }
      if (clock()-started>=budgetMs) return fallback('Decision budget exceeded');
    } catch {
      return fallback('Decision budget exceeded or candidate unavailable');
    }
    const chosen=outcome(state,result);
    const candidate:AgendaDecision={...legacy,reason:result.floor?.status==='fallback' ? String(result.floor.reason) : result.reason,outcome:chosen,
      effective:chosen.kind!=='action'?'hold':result.policy==='v3'?'legacy':'new',policyVersion:POLICY_VERSION};
    return finish(candidate,requested==='new'?candidate:legacy);
  } catch {
    return finish(holdReceipt(asOf,watermark,requested,'Conflicting or unavailable calendar or task inputs'));
  }
}
