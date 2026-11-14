import {notificationCopy} from '../notify/copy.ts';
import type {ReminderCandidate,ReminderContext,ReminderKind} from '../notify/rules.ts';

/**
 * N164.1 · turns the facts of `notify_candidates` (one owner-scoped read) and the owner's reminder preferences into the
 * rules engine's candidates and context, plus what each candidate would say if the rules decide to send it. Pure.
 * Kinds mapped so far: due and tutor. The others (deadline, behind, resume, digest, plan, rhythm) are N164.2.
 */
export interface NoticeFacts {
  tz?: string; today?: string; studiedToday?: boolean; lastStudyAt?: string | null; live?: boolean;
  due?: {count?: number; backlog?: number; minutes?: number};
  tutor?: {pending?: {card?: number; card_edit?: number; plan?: number; plan_change?: number}; newestAt?: string | null;
    origins?: string[]; projects?: string[]; answeredNotes?: number; endedSession?: {number?: number | string; summary?: string; endedAt?: string} | null};
  history?: {sentToday?: number; lastSentAt?: string | null; lastByKey?: Record<string, string>; dismissStreak?: Record<string, number>};
}
export interface NoticePrefs {
  enabled?: boolean; mode?: string; studyTime?: string; quiet?: {start?: string; end?: string}; maxPerDay?: number;
  kinds?: Partial<Record<ReminderKind, boolean>>; dueThreshold?: number; [key: string]: unknown;
}
export interface Display {kind: ReminderKind; title: string; body: string; url: string}
export interface NoticePlan {candidates: ReminderCandidate[]; context: ReminderContext; display: Map<string, Display>}

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ms = (iso: string | null | undefined): number | undefined => {
  if (!iso) return undefined;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : undefined;
};

/** The instant of a local date (YYYY-MM-DD) and time (HH:MM) in an IANA zone; the first match on a DST fold. */
export function zonedInstant(date: string, time: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const formatter = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const seen = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const drift = seen - wall;
    if (!drift) break;
    guess -= drift;
  }
  return guess;
}

const clock = (value: unknown, fallback: string) => typeof value === 'string' && CLOCK.test(value) ? value : fallback;

export function noticePlan(facts: NoticeFacts, prefs: NoticePrefs, now: number): NoticePlan {
  const zone = facts.tz || 'UTC', kinds = prefs.kinds ?? {};
  const history = facts.history ?? {}, lastByKey = history.lastByKey ?? {};
  const cap = Number.isSafeInteger(prefs.maxPerDay) ? Math.max(1, Math.min(5, prefs.maxPerDay as number)) : 3;
  const mode: ReminderContext['mode'] = prefs.mode === 'daily' ? 'daily' : prefs.mode === 'weekly' ? 'weekly' : prefs.mode === 'off' ? 'off' : 'as-happens';
  const context: ReminderContext = {
    now, timeZone: zone, quietStart: clock(prefs.quiet?.start, '22:30'), quietEnd: clock(prefs.quiet?.end, '07:30'), mode, dailyCap: cap,
    sendsToday: Math.max(0, Math.min(1000, Math.floor(history.sentToday ?? 0))), lastSendAt: ms(history.lastSentAt),
    lastActiveAt: ms(facts.lastStudyAt), liveSession: facts.live === true, rhythmEnabled: kinds.rhythm === true,
  };
  if (context.lastSendAt === undefined) delete context.lastSendAt;
  const candidates: ReminderCandidate[] = [], display = new Map<string, Display>();
  const sentOn = (key: string) => ms(lastByKey[key]);

  // K1 due: only when the owner switched it on (as the phone's own reminder is), once a day at their study time, when at least the threshold of cards is due and nothing was studied yet.
  const due = facts.due;
  if (facts.today && due && Number.isFinite(due.count)) {
    const key = 'due:' + facts.today, lastSentAt = sentOn(key), count = due.count as number;
    const candidate: ReminderCandidate = {
      kind: 'due', key, enabled: kinds.due === true, cardsDue: count, threshold: Number.isSafeInteger(prefs.dueThreshold) ? prefs.dueThreshold : 10,
      studiedToday: facts.studiedToday === true, sentToday: lastSentAt === undefined ? 0 : 1, dismissals: history.dismissStreak?.due ?? 0,
      dueAt: zonedInstant(facts.today, clock(prefs.studyTime, '19:00'), zone),
    };
    if (lastSentAt !== undefined) candidate.lastSentAt = lastSentAt;
    candidates.push(candidate);
    const copy = notificationCopy({kind: 'due', count, backlog: Math.max(count, due.backlog ?? count), minutes: due.minutes ?? 0});
    display.set(key, {kind: 'due', title: copy.title, body: copy.body, url: '#/review'});
  }

  // K5 tutor: fresh proposals the tutor left, or a session summary it saved; the facts already exclude what was announced.
  const tutor = facts.tutor, pending = tutor?.pending ?? {};
  const counts = {cards: pending.card ?? 0, planChanges: pending.plan_change ?? 0, plans: pending.plan ?? 0, cardEdits: pending.card_edit ?? 0};
  const total = counts.cards + counts.planChanges + counts.plans + counts.cardEdits;
  const ended = tutor?.endedSession ?? null;
  if (tutor && (total > 0 || ended)) {
    const newest = total > 0 ? ms(tutor.newestAt) : undefined, summaryAt = ended ? ms(ended.endedAt) : undefined;
    const key = 'tutor:' + (tutor.newestAt || (ended && ended.endedAt) || 'now');
    let lastSentAt: number | undefined;
    for (const [other, at] of Object.entries(lastByKey)) if (other.startsWith('tutor:')) lastSentAt = Math.max(lastSentAt ?? 0, ms(at) ?? 0);
    const candidate: ReminderCandidate = {kind: 'tutor', key, enabled: kinds.tutor !== false, hasSummary: !!ended};
    if (newest !== undefined) candidate.newestProposalAt = newest;
    if (summaryAt !== undefined) candidate.summaryAt = summaryAt;
    if (lastSentAt) candidate.lastSentAt = lastSentAt;
    candidates.push(candidate);
    const sources = (tutor.origins ?? []).filter((origin): origin is 'claude' | 'chatgpt' => origin === 'claude' || origin === 'chatgpt');
    const copy = notificationCopy({kind: 'tutor', sources, counts, projects: (tutor.projects ?? []).slice(0, 2), notesAnswered: tutor.answeredNotes ?? 0,
      ...(ended?.number !== undefined ? {sessionNo: String(ended.number)} : {}), ...(ended?.summary ? {summary: ended.summary} : {})});
    display.set(key, {kind: 'tutor', title: copy.title, body: copy.body, url: '#/proposals'});
  }
  return {candidates, context, display};
}
