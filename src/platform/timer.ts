/**
 * N123 · N2 the native focus timer bridge. The server study entry stays the source of truth: this module only maps it
 * to what the ongoing notification, lock screen and Quick Settings tile show, and replays actions the user took there.
 */
import type {StudyEntryRecord, StudyApi} from '../data/study/contract';
import type {LemmaNativePlugin, NativeTimerState, PendingTimerAction} from './bridge';

function phaseMs(entry: StudyEntryRecord): number {
  const config = entry.config ?? {}, pick = (value: unknown, fallback: number) => Math.max(1, Number(value) || fallback);
  const minutes = entry.phase === 'long_break' ? pick(config.long_break_minutes, 15)
    : entry.phase === 'break' ? pick(config.break_minutes, 5) : pick(config.focus_minutes, 25);
  return minutes * 60_000;
}

/** Map a live study entry to the native timer state; null when there is nothing to show. Pure. */
export function nativeTimerState(entry: StudyEntryRecord | null, now: number, context = '', clock24h = true): NativeTimerState | null {
  if (!entry || (entry.status !== 'running' && entry.status !== 'paused')) return null;
  const last = entry.intervals[entry.intervals.length - 1];
  const onBreak = (last?.kind === 'break' && last.end === null) || (entry.status === 'running' && (entry.phase === 'break' || entry.phase === 'long_break'));
  let focusedMs = 0;
  for (const interval of entry.intervals) {
    if (interval.kind !== 'focus') continue;
    const end = interval.end ? Date.parse(interval.end) : now;
    focusedMs += Math.max(0, end - Date.parse(interval.start));
  }
  const mode = entry.mode ?? 'open';
  const timed = mode !== 'open' && !!entry.phaseEndsAt && entry.status === 'running';
  const config = entry.config ?? {};
  return {
    entryId: entry.id,
    version: entry.version,
    status: onBreak ? 'break' : entry.status === 'paused' ? 'paused' : 'running',
    intention: entry.intent.trim() || 'Focused study',
    context,
    mode,
    focusedMs,
    asOf: now,
    phaseEndsAt: timed ? Date.parse(entry.phaseEndsAt!) : 0,
    phaseMs: timed ? phaseMs(entry) : 0,
    cycle: Math.max(1, entry.cycle ?? 1),
    cycles: Math.max(1, Number(config.cycles) || 4),
    breakMinutes: Math.max(1, Number(config.break_minutes) || 5),
    focusMinutes: Math.max(1, Number(config.focus_minutes) || 25),
    clock24h,
  };
}

/** What replaying one pending lock-screen action did, so the caller can route (a finish opens the log sheet). */
export type ReplayOutcome = 'applied' | 'skipped' | 'finish';

/**
 * Apply actions taken on the notification or tile while the app could not reach the server itself. The version check
 * is the guard against double actions: an action recorded against an older version than the server's is dropped.
 */
export async function replayTimerActions(native: Pick<LemmaNativePlugin, 'timerPendingActions' | 'timerAckActions'>, api: StudyApi,
  createThought: (text: string, entryId: string) => Promise<unknown>): Promise<ReplayOutcome[]> {
  const {actions} = await native.timerPendingActions();
  const outcomes: ReplayOutcome[] = [];
  // N126: a missing list (the plugin once sent null) means nothing is pending.
  for (const action of [...(Array.isArray(actions) ? actions : [])].sort((a, b) => a.at - b.at)) {
    let outcome: ReplayOutcome = 'skipped';
    try {
      outcome = await replayOne(action, api, createThought);
    } catch {
      outcome = 'skipped';
    }
    outcomes.push(outcome);
    await native.timerAckActions({ids: [action.id]});
  }
  return outcomes;
}

async function replayOne(action: PendingTimerAction, api: StudyApi, createThought: (text: string, entryId: string) => Promise<unknown>): Promise<ReplayOutcome> {
  if (action.action === 'thought') {
    if (!action.text?.trim()) return 'skipped';
    await createThought(action.text.trim(), action.entryId);
    return 'applied';
  }
  const fresh = await api.activeStudyEntry();
  if (!fresh || fresh.id !== action.entryId) return 'skipped';
  if (fresh.version !== action.version) return action.action === 'finish' ? 'finish' : 'skipped';
  const onBreak = fresh.intervals.some(interval => interval.kind === 'break' && interval.end === null);
  switch (action.action) {
    case 'pause':
      if (fresh.status !== 'running' || onBreak) return 'skipped';
      await api.pauseStudyEntry(fresh.id, fresh.version);
      return 'applied';
    case 'resume':
      if (fresh.status !== 'paused' && !onBreak) return 'skipped';
      await api.resumeStudyEntry(fresh.id, fresh.version);
      return 'applied';
    case 'break':
      if (fresh.status !== 'running' || onBreak) return 'skipped';
      await api.breakStudyEntry(fresh.id, fresh.version);
      return 'applied';
    case 'finish':
      if (fresh.status === 'running' && !onBreak) await api.pauseStudyEntry(fresh.id, fresh.version);
      return 'finish';
    case 'save':
      await api.saveStudyEntry(fresh.id, fresh.version, {});
      return 'applied';
  }
  return 'skipped';
}
