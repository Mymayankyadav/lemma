import {inProgressMinutes} from '../effort';

export type FocusPhase = 'idle' | 'running' | 'paused' | 'break' | 'finishing' | 'saved' | 'discarded';
export interface FocusSpan {
  kind: 'focus' | 'break';
  start: string;
  end: string | null;
}
export interface FocusSession {
  id: string;
  intent: string;
  /** Configured Pomodoro focus cap, in minutes. */
  focusMinutes: number;
  startedAt: string;
  intervals: FocusSpan[];
  finishedAt: string | null;
  reflection: string | null;
  savedMinutes: number | null;
}
export type FocusState =
  | {phase: 'idle'; session: null}
  | {phase: Exclude<FocusPhase, 'idle'>; session: FocusSession};
export type FocusEvent =
  | {type: 'start'; id: string; intent: string; focusMinutes: number; at: string}
  | {type: 'pause' | 'resume' | 'break' | 'finish' | 'discard'; at: string}
  | {type: 'save'; at: string; minutes?: number; reflection?: string};

export function idleFocus(): FocusState {
  return {phase: 'idle', session: null};
}

function instant(value: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid Focus timestamp');
  return time;
}
function checkTime(session: FocusSession, at: string): void {
  const latest = session.intervals.at(-1);
  const previous = latest ? (latest.end ?? latest.start) : session.startedAt;
  if (instant(at) < instant(previous)) throw new Error('Focus time cannot go backwards');
}
function closeOpen(session: FocusSession, at: string): FocusSpan[] {
  const index = session.intervals.length - 1;
  if (index < 0 || session.intervals[index].end !== null) {
    throw new Error('No open Focus interval');
  }
  return session.intervals.map((span, i) => i === index ? {...span, end: at} : span);
}

/** A pure state transition: invalid actions throw and never mutate the prior state. */
export function transitionFocus(state: FocusState, event: FocusEvent): FocusState {
  instant(event.at);
  if (event.type === 'start') {
    if (state.phase !== 'idle') throw new Error('Focus already started');
    if (!event.id.trim()) throw new Error('Focus id required');
    if (!Number.isFinite(event.focusMinutes) || event.focusMinutes <= 0) {
      throw new Error('Positive focusMinutes required');
    }
    return {phase: 'running', session: {
      id: event.id, intent: event.intent, focusMinutes: event.focusMinutes,
      startedAt: event.at, intervals: [{kind: 'focus', start: event.at, end: null}],
      finishedAt: null, reflection: null, savedMinutes: null,
    }};
  }
  if (state.phase === 'idle') throw new Error('Focus has not started');
  const session = state.session;
  checkTime(session, event.at);
  switch (event.type) {
    case 'pause':
      if (state.phase !== 'running') throw new Error('Can only pause running Focus');
      return {phase: 'paused', session: {...session, intervals: closeOpen(session, event.at)}};
    case 'break':
      if (state.phase !== 'running') throw new Error('Can only break running Focus');
      return {phase: 'break', session: {
        ...session, intervals: [...closeOpen(session, event.at), {kind: 'break', start: event.at, end: null}],
      }};
    case 'resume':
      if (state.phase !== 'paused' && state.phase !== 'break') {
        throw new Error('Can only resume paused or breaking Focus');
      }
      return {phase: 'running', session: {
        ...session,
        intervals: [...(state.phase === 'break' ? closeOpen(session, event.at) : session.intervals),
          {kind: 'focus', start: event.at, end: null}],
      }};
    case 'finish':
      if (state.phase !== 'running' && state.phase !== 'paused') {
        throw new Error('Can only finish running or paused Focus');
      }
      return {phase: 'finishing', session: {
        ...session, finishedAt: event.at,
        intervals: state.phase === 'running' ? closeOpen(session, event.at) : session.intervals,
      }};
    case 'save': {
      if (state.phase !== 'finishing') throw new Error('Finish Focus before saving');
      const measured = inProgressFocusMinutes(state, event.at);
      const minutes = event.minutes ?? measured;
      if (!Number.isFinite(minutes) || minutes < 0) throw new Error('Invalid saved minutes');
      return {phase: 'saved', session: {
        ...session, savedMinutes: minutes, reflection: event.reflection ?? null,
      }};
    }
    case 'discard':
      if (state.phase !== 'finishing') throw new Error('Finish Focus before discarding');
      return {phase: 'discarded', session: {...session, savedMinutes: null}};
  }
}

/** Read elapsed time from stored timestamps, never from a tick counter. */
export function inProgressFocusMinutes(state: FocusState, now: string): number {
  instant(now);
  if (state.phase === 'idle' || state.phase === 'saved' || state.phase === 'discarded') return 0;
  const session = state.session;
  return inProgressMinutes({
    startedAt: session.startedAt,
    focusMinutes: session.focusMinutes,
    phase: state.phase === 'break' ? 'break' : state.phase === 'paused' ? 'paused' : 'focus',
    intervals: session.intervals.map(span => ({
      kind: span.kind, start: span.start, end: span.end ?? now,
    })),
  }, now);
}

export function remainingFocusMinutes(state: FocusState, now: string): number {
  if (state.phase === 'idle' || state.phase === 'saved' || state.phase === 'discarded') return 0;
  return Math.max(0, state.session.focusMinutes - inProgressFocusMinutes(state, now));
}
