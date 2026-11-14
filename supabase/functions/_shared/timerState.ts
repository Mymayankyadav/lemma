/**
 * N163 · what the phone's timer notification shows, built on the server so a timer started from chat can reach a closed
 * app. This is `nativeTimerState` (src/platform/timer.ts) and `timedPhase` (src/data/study/phase.ts) for database rows;
 * `tests/unit/push/timer-state.test.ts` keeps the two in step on the same fixtures. Pure: no I/O, no Deno APIs.
 */
export interface EntryRow {
  id: string; version: number; status: string; intent: string | null; mode: string | null; phase: string | null;
  cycle: number | null; config: Record<string, unknown> | null; phase_ends_at: string | null; project_id: string | null;
}
export interface IntervalRow {kind: 'focus' | 'break'; started_at: string; ended_at: string | null}
export interface NativeTimerState {
  entryId: string; version: number; status: 'running' | 'paused' | 'break'; intention: string; context: string;
  mode: string; focusedMs: number; asOf: number; phaseEndsAt: number; phaseMs: number; cycle: number; cycles: number;
  breakMinutes: number; focusMinutes: number; clock24h: boolean;
}
export type TimerPush = {op: 'show'; state: NativeTimerState} | {op: 'clear'; entryId: string; version: number};

const ms = (iso: string) => Date.parse(iso);

function phaseMs(row: EntryRow): number {
  const config = row.config ?? {}, pick = (value: unknown, fallback: number) => Math.max(1, Number(value) || fallback);
  const minutes = row.phase === 'long_break' ? pick(config.long_break_minutes, 15)
    : row.phase === 'break' ? pick(config.break_minutes, 5) : pick(config.focus_minutes, 25);
  return minutes * 60_000;
}

/** The end of a timed focus phase counting its pauses (the stored end never moves), and whether it is paused now. */
export function timedPhase(row: EntryRow, intervals: IntervalRow[], now: number): {endsAtMs: number; remainingMs: number; paused: boolean} | null {
  if (!row.phase_ends_at || !row.mode || row.mode === 'open') return null;
  const stored = ms(row.phase_ends_at);
  if (!Number.isFinite(stored)) return null;
  if (row.phase === 'break' || row.phase === 'long_break') return {endsAtMs: stored, remainingMs: Math.max(0, stored - now), paused: false};
  const run: IntervalRow[] = [];
  for (let index = intervals.length - 1; index >= 0 && intervals[index].kind === 'focus'; index--) run.unshift(intervals[index]);
  let paused = 0;
  for (let index = 1; index < run.length; index++) {
    const before = run[index - 1].ended_at;
    if (before) paused += Math.max(0, ms(run[index].started_at) - ms(before));
  }
  const endsAtMs = stored + paused, last = run[run.length - 1];
  if (row.status === 'paused' && last?.ended_at) return {endsAtMs, remainingMs: Math.max(0, endsAtMs - ms(last.ended_at)), paused: true};
  return {endsAtMs, remainingMs: Math.max(0, endsAtMs - now), paused: false};
}

/** Intervals must be ordered by start time. */
export function nativeTimerState(row: EntryRow, intervals: IntervalRow[], now: number, context = '', clock24h = true): NativeTimerState | null {
  if (row.status !== 'running' && row.status !== 'paused') return null;
  const last = intervals[intervals.length - 1];
  const onBreak = (last?.kind === 'break' && last.ended_at === null) || (row.status === 'running' && (row.phase === 'break' || row.phase === 'long_break'));
  let focusedMs = 0;
  for (const interval of intervals) {
    if (interval.kind !== 'focus') continue;
    const end = interval.ended_at ? ms(interval.ended_at) : now;
    focusedMs += Math.max(0, end - ms(interval.started_at));
  }
  const mode = row.mode ?? 'open', config = row.config ?? {};
  const phase = timedPhase(row, intervals, now), timed = !!phase && !phase.paused && row.status === 'running';
  return {
    entryId: row.id, version: row.version,
    status: onBreak ? 'break' : row.status === 'paused' ? 'paused' : 'running',
    intention: (row.intent ?? '').trim() || 'Focused study', context, mode, focusedMs, asOf: now,
    phaseEndsAt: timed ? phase!.endsAtMs : 0, phaseMs: timed ? phaseMs(row) : 0,
    cycle: Math.max(1, row.cycle ?? 1), cycles: Math.max(1, Number(config.cycles) || 4),
    breakMinutes: Math.max(1, Number(config.break_minutes) || 5), focusMinutes: Math.max(1, Number(config.focus_minutes) || 25), clock24h,
  };
}

/** What to tell the phone about this entry: show the timer, or clear it once the entry is no longer running or paused. */
export function timerPush(row: EntryRow, intervals: IntervalRow[], now: number, context = '', clock24h = true): TimerPush {
  const state = nativeTimerState(row, intervals, now, context, clock24h);
  return state ? {op: 'show', state} : {op: 'clear', entryId: row.id, version: row.version};
}
