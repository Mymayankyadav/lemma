// Port of the 2026-11-20 Atlas handoff (joint/repair/gate.mjs).
import type { Evidence, Options, PreparedTask, Ranked, Snapshot, State, Task, Window } from './types.ts';
import { selectSchedule, validateDecision } from './selector.ts';
import { prepare, available } from './constraints.ts';

const DAY = 1440;
const EPS = 1e-8;
const isCommitment = (task:PreparedTask) => task.core || task.required || task.kind==='personal' && (task.importance ?? 0)>=3;
const isOptionalStudy = (task:Task|undefined) => !!task?.atlasAction && !task.core && !task.required;
export const policyNames = Object.freeze(['v3','conservative','observe-repair','repair']);

function estimatedAfterDiversion(state:State,task:PreparedTask,after:number,evidence:Pick<Evidence,'center'|'spread'>) {
  const today = Math.floor(state.now/DAY);
  const spare = new Map<number,Window[]>();
  for (const win of state.windows) {
    if (win.end<=after || win.start>=task.deadline) continue;
    const day = Math.floor(win.start/DAY);
    if (!spare.has(day)) spare.set(day,[]);
    spare.get(day)!.push(win);
  }
  const current = spare.get(today) ?? [];
  const future = [...spare.entries()].filter(([day]) => day>today).map(([,windows]) => windows);
  if (future.length>8) return null;
  const attendance = (state.input.history ?? []).filter(row => typeof row?.kept==='boolean').slice(-6);
  const kept = (3+attendance.filter(row => row.kept).length)/(4+attendance.length);
  const inflation = Math.max(1,Math.exp(evidence.center+.8416*evidence.spread));
  const remaining = task.remaining*inflation;
  const required = remaining+task.pending;
  // Preserve the original minimum chunk while forecasting a possibly longer completion.
  const adjusted = {...task,remaining};
  let feasibility = 0;
  for (let mask=0; mask<(1<<future.length); mask++) {
    const windows = [...current];
    let weight = 1;
    for (let i=0; i<future.length; i++) {
      const attend = !!(mask&(1<<i));
      weight *= attend ? kept : 1-kept;
      if (attend) windows.push(...future[i]);
    }
    if (available(windows,adjusted,after)+EPS >= required) feasibility += weight;
  }
  return {feasibility,required,dayAttendance:kept,laterDays:future.length,
    todayCapacity:available(current,adjusted,after)};
}

/** Deterministic review of an approved portfolio switch with explicit baseline and facts. */
export function deadlineGuard(input:Snapshot,proposed:Ranked,base:Ranked) {
  const alternative = proposed?.action;
  const native = base?.action;
  if (proposed?.policy!=='portfolio' || !alternative || !native || native.id===alternative.id) return null;
  const selected = input.tasks.find(task => task.id===alternative.id);
  if (!isOptionalStudy(selected)) return null;
  if (!Number.isFinite(proposed.evidence?.center) || !Number.isFinite(proposed.evidence?.spread)) return null;
  const state = prepare(input);
  const protectedTask = state.tasks.find(task => task.id===native.id);
  if (!protectedTask || !isCommitment(protectedTask) || validateDecision(input,base).length) return null;
  const declared=input.tasks.find(task => task.id===native.id)!;
  const commitmentDeadline=Math.min(declared.due ?? Infinity,declared.expiry ?? Infinity);
  if (commitmentDeadline>state.end) return null;
  const info = estimatedAfterDiversion(state,protectedTask,alternative.end,{center:proposed.evidence.center!,spread:proposed.evidence.spread!});
  if (!info) return null;
  const threshold = protectedTask.required || protectedTask.core ? .90 : .80;
  return {...info,id:protectedTask.id,proposedId:alternative.id,threshold,
    protects:info.feasibility+EPS<threshold};
}

export function selectWithDeadlineGuard(input:Snapshot,options:Options={}) {
  const policy=options.policy;
  if (!['repair','observe-repair'].includes(policy ?? '')) return selectSchedule(input,options);
  const proposed=selectSchedule(input,{...options,policy:'conservative'});
  if (proposed.policy!=='portfolio' || !proposed.action ||
      !isOptionalStudy(input.tasks.find(task => task.id===proposed.action!.id))) return proposed;
  const base=selectSchedule(input,{...options,policy:'v3',includeForecasts:false});
  const info=deadlineGuard(input,proposed,base);
  if (!info) return proposed;
  const applied=info.protects && policy==='repair';
  return {...(applied ? base : proposed),repairGuard:{...info,applied},
    reason:applied ? 'Preserve the deadline commitment before optional study' : proposed.reason};
}
