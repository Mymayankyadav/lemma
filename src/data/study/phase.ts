import type {StudyEntryRecord} from './contract';

/**
 * N162 · the clock of a timed phase (pomodoro or flowtime), counting pauses.
 *
 * The server stores one `phase_ends_at` when a phase starts and neither a pause nor a resume moves it. Read as is, a
 * paused countdown keeps running (it showed less time every time the app was opened) and a resumed one jumps ahead by
 * the time it was paused. The pauses are in the intervals, which the server does keep: a pause closes the focus
 * interval and a resume opens the next, so each gap between two focus intervals of the phase is time the phase did not run.
 *   - While paused the clock is frozen at what was left when the interval closed, and no end time is promised.
 *   - Running, the end is `phase_ends_at` plus the phase's earlier pauses.
 * A break phase has no user pause (its paused status is how the server marks it open), so it keeps the stored end.
 */
export interface TimedPhase {
  /** When the phase ends if it runs on from now (ms); only meaningful while not `paused`. */
  endsAtMs: number;
  /** Milliseconds left: frozen while paused, counting down otherwise. */
  remainingMs: number;
  paused: boolean;
}

type PhaseEntry = Pick<StudyEntryRecord, 'mode' | 'phase' | 'phaseEndsAt' | 'status' | 'intervals'>;

export function timedPhase(entry: PhaseEntry | null | undefined, now: number): TimedPhase | null {
  if (!entry?.phaseEndsAt || !entry.mode || entry.mode === 'open') return null;
  const stored = Date.parse(entry.phaseEndsAt);
  if (!Number.isFinite(stored)) return null;
  if (entry.phase === 'break' || entry.phase === 'long_break') return {endsAtMs: stored, remainingMs: Math.max(0, stored - now), paused: false};
  // The phase's focus intervals: the run of focus intervals at the end of the list.
  const run = [];
  for (let index = entry.intervals.length - 1; index >= 0 && entry.intervals[index].kind === 'focus'; index--) run.unshift(entry.intervals[index]);
  let paused = 0;
  for (let index = 1; index < run.length; index++) {
    const before = run[index - 1].end;
    if (before) paused += Math.max(0, Date.parse(run[index].start) - Date.parse(before));
  }
  const endsAtMs = stored + paused;
  const last = run[run.length - 1];
  if (entry.status === 'paused' && last?.end) {
    const frozen = Math.max(0, endsAtMs - Date.parse(last.end));
    return {endsAtMs, remainingMs: frozen, paused: true};
  }
  return {endsAtMs, remainingMs: Math.max(0, endsAtMs - now), paused: false};
}
