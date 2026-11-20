// Port of the 2026-11-20 Atlas handoff (scheduler/vendor/prior-agenda/agenda-core.mjs).
import type { Fixed, Pick, Selection, Snapshot, Task, Window } from './types.ts';
// Numeric minute coordinates are relative to a caller's common clock.
// Fixed intervals and configured buffers occupy half-open ranges [start, end).
const EPS = 1e-8;
type SearchTask = ReturnType<typeof normalize>[number];
type SearchPick = Pick & {task:SearchTask;projected?:number};
const compareId = (a:{id:string}, b:{id:string}) => String(a.id).localeCompare(String(b.id));

export function freeIntervals({now, end, fixed = []}: {now:number;end:number;fixed?:Fixed[]}) {
  const events = fixed.filter(e => Number.isFinite(e.start) && Number.isFinite(e.end) &&
    e.end > e.start).sort((a, b) => a.start - b.start || compareId(a,b));
  const reservations = events.map(event => ({
    event, start: event.start - Math.max(0, event.before ?? 0),
    end: event.end + Math.max(0, event.after ?? 0),
  })).sort((a,b) => a.start - b.start || compareId(a.event,b.event));
  const conflicts = [];
  const open = [];
  let cursor = now;
  for (const [i, booking] of reservations.entries()) {
    if (booking.start >= end) break;
    for (const other of reservations.slice(i+1)) {
      if (other.start >= Math.min(booking.end, end)) break;
      const start = Math.max(now, booking.start, other.start);
      const stop = Math.min(end, booking.end, other.end);
      if (stop > start) conflicts.push({ids:[booking.event.id, other.event.id], start, end:stop,
        kind: Math.min(booking.event.end,other.event.end,end) >
          Math.max(booking.event.start,other.event.start,now) ? 'fixed' : 'buffer'});
    }
    if (booking.end <= now) continue;
    if (booking.start > cursor) open.push({start:cursor,end:booking.start});
    cursor = Math.max(cursor, booking.end);
  }
  if (cursor < end) open.push({start:cursor,end});
  return {
    freeIntervals: open, conflicts,
    nextFixed: events.find(item => item.start > now) ?? null,
    currentFixed: events.filter(item => item.start <= now && now < item.end),
  };
}

function normalize(tasks:Task[], now:number) {
  return tasks.filter(task => task.remaining > EPS).map(task => {
    const split = task.splittable ?? (task.kind === 'course');
    const severity = Math.max(0, Math.min(3, task.severity ?? 0));
    return {
      ...task, split, release: task.release ?? now,
      deadline: Math.min(task.due ?? Infinity, task.expiry ?? Infinity),
      minimum: split ? Math.max(1,task.minChunk ?? 5) : task.remaining,
      weight: Math.max(0,task.importance ?? 1) * (task.kind === 'tutor' ? 1 + severity / 3 : 1),
      progressWeight: Math.max(0,Math.min(1,task.progressWeight ?? (task.kind === 'course' ? .2 : 0))),
      pendingResume: Math.max(0,task.resumeMinutes ?? 0), initial: task.remaining,
    };
  });
}

function fitting(task:SearchTask, at:number, stop:number) {
  if (task.release > at || task.remaining <= EPS) return 0;
  const minutes = Math.min(task.remaining, Math.min(stop,task.deadline) - at - task.pendingResume);
  return minutes + EPS >= Math.min(task.minimum,task.remaining) ? minutes : 0;
}

function candidate(task:SearchTask, at:number, minutes:number) {
  return {id:task.id, kind:task.kind, start:at, end:at+task.pendingResume+minutes,
    minutes, resumeMinutes:task.pendingResume};
}

function addAction(tasks:SearchTask[], action:Pick, activeId:string|undefined, resumeCost:number) {
  const own = tasks.find(task => task.id === action.id)!;
  own.remaining = Math.max(0, own.remaining - action.minutes);
  own.pendingResume = 0;
  if (resumeCost && action.id !== activeId) {
    const active = tasks.find(task => task.id === activeId && task.remaining > EPS);
    if (active) active.pendingResume += resumeCost;
  }
}

function available(task:SearchTask, at:number, windows:Window[]) {
  return windows.reduce((sum,window) => sum + Math.max(0,
    Math.min(task.deadline,window.end) - Math.max(window.start,task.release,at)), 0);
}

function latestStartEstimate(task:SearchTask, now:number, windows:Window[]) {
  let needed = task.remaining + task.pendingResume;
  for (let i = windows.length-1; i >= 0; i--) {
    const start = Math.max(now,task.release,windows[i].start);
    const end = Math.min(task.deadline,windows[i].end);
    const room = end-start;
    if (room + EPS >= needed) return end-needed;
    if (task.split && room + EPS >= Math.min(task.remaining,task.minimum)) needed -= room;
  }
  return null;
}

function score(tasks:SearchTask[]) {
  return tasks.reduce((sum,task) => {
    const complete = task.remaining <= EPS;
    return sum + task.weight * (complete ? 1 :
      task.progressWeight * (1 - task.remaining/task.initial));
  },0);
}

function rollout(tasks:SearchTask[], start:number, windows:Window[], protectedUntil:number, activeId:string|undefined, rule:string, incidentDebt:number) {
  let interruptionCharged = !incidentDebt;
  for (const window of windows) {
    let cursor = Math.max(start,window.start);
    while (cursor < window.end - EPS) {
      const protectedNow = cursor < protectedUntil &&
        tasks.some(task => task.id === activeId && task.remaining > EPS);
      const options = tasks.map(task => ({task, minutes:fitting(task,cursor,window.end), slack:0, valueRate:0, possible:false}))
        .filter(item => item.minutes > EPS && (!protectedNow || item.task.id === activeId));
      if (!options.length) {
        const release = tasks.reduce((next,task) => task.remaining > EPS && task.release > cursor
          ? Math.min(task.release,next) : next,window.end);
        cursor = Math.min(release,protectedNow ? protectedUntil : window.end);
        continue;
      }
      for (const item of options) {
        const {task} = item;
        item.slack = available(task,cursor,windows) - task.remaining - task.pendingResume;
        item.valueRate = task.weight / (task.remaining+task.pendingResume);
        item.possible = item.slack >= -EPS;
      }
      options.sort((a,b) => Number(b.possible)-Number(a.possible) ||
        (rule === 'slack' ? a.slack-b.slack : b.valueRate-a.valueRate) ||
        a.task.deadline-b.task.deadline || compareId(a.task,b.task));
      const pick = options[0];
      // Take a decision at a known release or protection boundary when a legal slice fits.
      const release = tasks.reduce((next,task) => task.remaining > EPS && task.release > cursor
        ? Math.min(task.release,next) : next,window.end);
      const boundary = protectedNow ? Math.min(release,protectedUntil) : release;
      const minutes = fitting(pick.task,cursor,boundary) || pick.minutes;
      const action = candidate(pick.task,cursor,minutes);
      addAction(tasks,action,activeId,interruptionCharged ? 0 : incidentDebt);
      if (activeId && action.id !== activeId) interruptionCharged = true;
      cursor = action.end;
    }
  }
  return score(tasks);
}

/** One-step counterfactual search over candidate actions and calendar-aware greedy rollouts.
 * Importance is one caller-declared unit per timely completion. Only explicit progress
 * weight earns partial credit. The advisor assumes its input durations are point estimates. */
export function chooseAgenda(input:Snapshot & {policy?:string}) {
  const {now,end,activeId,protectedUntil = now, resumeCost = 0, policy = 'lookahead'} = input;
  const calendar = freeIntervals(input);
  const windows = calendar.freeIntervals;
  const tasks = normalize(input.tasks ?? [],now);
  const expired = tasks.filter(task => task.deadline <= now).map(task => task.id);
  const visible = tasks.filter(task => task.deadline > now);
  const result:Selection & typeof calendar & {expired:string[];alternates:Pick[]} = {...calendar,expired,action:null,alternates:[],hold:null};
  const window = windows[0];
  if (!window || window.start > now) {
    result.hold = {until: window?.start ?? end, reason:'Fixed event or configured buffer occupies this time'};
    return result;
  }
  const active = visible.find(task => task.id === activeId);
  const protectedNow = active && protectedUntil > now;
  const nextRelease = visible.reduce((next,task) => task.release > now
    ? Math.min(next,task.release) : next,window.end);
  const candidates:SearchPick[] = [];
  for (const task of visible) {
    if (protectedNow && task.id !== activeId) continue;
    const full = fitting(task,now,window.end);
    if (full <= EPS) continue;
    const boundary = protectedNow ? Math.min(nextRelease,protectedUntil) : nextRelease;
    const slices = policy === 'lookahead' ? [full,
      fitting(task,now,boundary),
      fitting(task,now,Math.min(window.end,now+task.pendingResume+Math.min(task.minimum,task.remaining))),
      fitting(task,now,Math.min(window.end,now+task.pendingResume+20))] : [fitting(task,now,boundary) || full];
    for (const minutes of new Set(slices.filter(x => x > EPS))) {
      candidates.push({task,...candidate(task,now,minutes)});
    }
  }
  if (candidates.length === 0) {
    const until = Math.min(nextRelease,protectedNow ? protectedUntil : window.end);
    result.hold = {until,reason:protectedNow ? 'Protected work has no feasible slice before the next boundary'
      : 'No released action fits before the next boundary'};
    return result;
  }

  const projected = (move: Pick | {end:number}) => {
    input.checkDeadline?.();
    const estimates = visible.map(task => ({...task}));
    const action = 'id' in move ? move : null;
    const breaksActive = active && action && action.id !== activeId;
    const debt = active ? Math.max(0,resumeCost) : 0;
    if (action) addAction(estimates,action,activeId,debt);
    return Math.max(...['slack','value'].map(rule => rollout(estimates.map(task => ({...task})),
      move?.end ?? now,windows,protectedUntil,activeId,rule,breaksActive ? 0 : debt)));
  };

  if (policy !== 'lookahead') {
    const objective = policy === 'highest_importance'
      ? (a:SearchPick,b:SearchPick) => b.task.weight-a.task.weight : (a:SearchPick,b:SearchPick) => a.task.deadline-b.task.deadline;
    candidates.sort((a,b) => objective(a,b) || a.task.deadline-b.task.deadline ||
      b.task.weight-a.task.weight || compareId(a,b));
  } else {
    for (const option of candidates) option.projected = projected(option);
    candidates.sort((a,b) => b.projected!-a.projected! || b.minutes-a.minutes ||
      a.task.deadline-b.task.deadline || compareId(a,b));
    if (nextRelease < window.end && !protectedNow) {
      const wait = projected({end:nextRelease});
      if (wait > candidates[0].projected! + EPS) {
        result.hold = {until:nextRelease,reason:'A known release preserves more achievable value'};
        return result;
      }
    }
  }
  const best = candidates[0];
  const describe = (option:SearchPick) => {
    const {task,projected,id,kind,start,end,minutes,resumeMinutes} = option;
    const futureCapacity = available(task,now,windows);
    return {id,kind,start,end,minutes,resumeMinutes,
      reason: protectedNow ? 'Protected work' : policy === 'earliest_due' ? 'Earliest feasible due date'
        : policy === 'highest_importance' ? 'Highest feasible importance'
        : 'Calendar-aware comparison of achievable priority value',
      loss: projected === undefined ? null : Math.max(0,best.projected!-projected),
      projectedValue: projected ?? null, remainingAtDecision:task.remaining,
      accessibleMinutes:futureCapacity, slackMinutes:futureCapacity-task.remaining-task.pendingResume,
      latestStartEstimate:latestStartEstimate(task,now,windows)};
  };
  result.action = describe(best);
  const seen = new Set([best.id]);
  for (const option of candidates.slice(1)) if (!seen.has(option.id)) {
    seen.add(option.id);
    result.alternates.push(describe(option));
  }
  return result;
}
