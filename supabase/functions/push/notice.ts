import {notifyTitle,notifyBody} from '../_shared/notify-text.ts';
import {notificationCopy} from '../notify/copy.ts';
import {tutorActions,type ReminderCandidate,type ReminderContext,type ReminderKind} from '../notify/rules.ts';

/**
 * N164 · turns the facts of `notify_candidates` (one owner-scoped read) and the owner's reminder preferences into the
 * rules engine's candidates and context, plus what each candidate would say, link to and offer as buttons if the rules
 * decide to send it. Pure. Defaults are the ones Settings › Reminders shows (study time 09:00, at most 5 a day, quiet
 * 22:00–07:00, digest on Sunday at 09:00), so the server does what the screen says.
 */
export interface Checkpoint {slug?: string; project: string; code: string; title: string; step?: number; steps?: number}
export interface NoticeFacts {
  exams?:{id:string;title:string;slug:string;startsAt:string;zone:string;minutes?:number|null}[];
  holds?:Record<string,string>;
  tz?: string; today?: string; studiedToday?: boolean; lastStudyAt?: string | null; live?: boolean; quietDays?: number;
  due?: {count?: number; backlog?: number; minutes?: number};
  tomorrow?: Checkpoint[];
  late?: {slug: string; project: string; code: string; title?: string; dueOn: string; daysLate?: number; targetDate?: string | null}[];
  pastTarget?: {slug: string; project: string; lastDueOn: string; targetDate: string}[];
  paused?: {slug: string; project: string; number: number | string; step?: number; steps?: number; question?: string | null; checkpointTitle?: string | null; lastActivityAt?: string} | null;
  tutor?: {pending?: {card?: number; card_edit?: number; plan?: number; plan_change?: number}; newestAt?: string | null; cardIds?: string[];
    origins?: string[]; projects?: string[]; answeredNotes?: number; endedSession?: {number?: number | string; summary?: string; endedAt?: string} | null};
  week?: {daysStudied?: number; reviews?: number; demonstrated?: string[]; next?: {code: string; title: string; dueOn?: string} | null};
  history?: {sentToday?: number; lastSentAt?: string | null; lastByKey?: Record<string, string>; dismissStreak?: Record<string, number>};
}
export interface NoticePrefs {
  enabled?: boolean; mode?: string; studyTime?: string; quiet?: {start?: string; end?: string}; maxPerDay?: number;
  kinds?: Partial<Record<ReminderKind|'examMorning'|'examFollowup', boolean>>; dueThreshold?: number; approveCards?: boolean;
  digest?: {weekday?: number; time?: string}; [key: string]: unknown;
}
/** A button on the notification. `open` needs only a link; every other action carries a signed token made at delivery. */
export interface ActionSpec {action: 'open' | 'later' | 'not_today' | 'approve_cards' | 'undo'; title: string; url?: string; x?: {ids?: string[]; scope?: string; action?: number}}
export interface Display {kind: ReminderKind; title: string; body: string; url: string; actions: ActionSpec[]}
export interface NoticePlan {candidates: ReminderCandidate[]; context: ReminderContext; display: Map<string, Display>}

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY = 86_400_000;
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
export const addDays = (date: string, days: number): string => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const localDate = (at: number, zone: string): string => new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(at));
/** "9 Nov", as the copy expects dates. */
export const shortDate = (date: string): string => new Intl.DateTimeFormat('en-GB', {timeZone: 'UTC', day: 'numeric', month: 'short'}).format(new Date(date.slice(0, 10) + 'T00:00:00Z'));
const weekdayOf = (date: string): number => new Date(date + 'T00:00:00Z').getUTCDay();
const clock = (value: unknown, fallback: string) => typeof value === 'string' && CLOCK.test(value) ? value : fallback;
const link = (slug: string | undefined) => slug ? '#/p/' + encodeURIComponent(slug) : '#/';
const open = (url: string, title = 'Open'): ActionSpec => ({action: 'open', title, url});

export function noticePlan(facts: NoticeFacts, prefs: NoticePrefs, now: number): NoticePlan {
  const zone = facts.tz || 'UTC', kinds = prefs.kinds ?? {}, today = facts.today ?? localDate(now, zone);
  const history = facts.history ?? {}, lastByKey = history.lastByKey ?? {};
  const cap = Number.isSafeInteger(prefs.maxPerDay) ? Math.max(1, Math.min(5, prefs.maxPerDay as number)) : 5;
  const mode: ReminderContext['mode'] = prefs.mode === 'daily' ? 'daily' : prefs.mode === 'weekly' ? 'weekly' : prefs.mode === 'off' ? 'off' : 'as-happens';
  const studyTime = clock(prefs.studyTime, '09:00');
  const sentOn = (key: string) => ms(lastByKey[key]);
  const sentToday = (prefix: string) => Object.entries(lastByKey).some(([key, at]) => key.startsWith(prefix) && ms(at) !== undefined && localDate(ms(at) as number, zone) === today);
  const context: ReminderContext = {
    now, timeZone: zone, quietStart: clock(prefs.quiet?.start, '22:00'), quietEnd: clock(prefs.quiet?.end, '07:00'), mode, dailyCap: cap,
    sendsToday: Math.max(0, Math.min(1000, Math.floor(history.sentToday ?? 0))), lastSendAt: ms(history.lastSentAt),
    lastActiveAt: ms(facts.lastStudyAt), liveSession: facts.live === true, rhythmEnabled: kinds.rhythm === true, behindSentToday: sentToday('behind:'),
  };
  if (context.lastSendAt === undefined) delete context.lastSendAt;
  const candidates: ReminderCandidate[] = [], display = new Map<string, Display>();
  const add = (candidate: ReminderCandidate, shown: Display) => {
    const held=['all',candidate.kind,candidate.key].some(scope=>(ms(facts.holds?.[scope])??0)>now);
    if(held)return;candidates.push(candidate);display.set(candidate.key,shown);
  };
  const dueAt = zonedInstant(today, studyTime, zone);
  const withSent = (candidate: ReminderCandidate, key: string): ReminderCandidate => {const at = sentOn(key); if (at !== undefined) candidate.lastSentAt = at; return candidate;};

  for(const exam of facts.exams??[]) {
    const start=ms(exam.startsAt);
    if(start===undefined)continue;
    const examDay=localDate(start,exam.zone), end=start+(exam.minutes??0)*60000;
    const morning=now<start;
    const preference=morning?'examMorning':'examFollowup';
    if(kinds[preference]!==true)continue;
    if(morning && localDate(now,exam.zone)!==examDay)continue;
    if(!morning && (exam.minutes==null||exam.minutes<=0||now<end||now>start+2*DAY))continue;
    const key=['exam',preference,exam.id,start].join('/');
    const url=link(exam.slug)+(morning?'/tutor?exam=':'?tab=exam&examSitting=')+encodeURIComponent(exam.id);
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:exam.zone,hour:'2-digit',minute:'2-digit'}).format(start);
    add({kind:'deadline',key,enabled:true,sentToday:sentOn(key)===undefined?0:1,
      dueAt:morning?Math.min(zonedInstant(examDay,studyTime,exam.zone),start-30*60000):end},
      {kind:'deadline',title:notifyTitle(exam.title),body:notifyBody(morning?'Your exam starts at '+time+'. Open exam prep for a warm-up.':'How did the exam go? Open the sitting to finish or reschedule it.'),
        url,actions:[open(url,morning?'Open prep':'Open exam')]});
  }
  // K1 due: only when the owner switched it on (as the phone's own reminder is), once a day at their study time.
  const due = facts.due;
  if (due && Number.isFinite(due.count)) {
    const key = 'due:' + today, count = due.count as number;
    add(withSent({kind: 'due', key, enabled: kinds.due === true, cardsDue: count, threshold: Number.isSafeInteger(prefs.dueThreshold) ? prefs.dueThreshold : 10,
      studiedToday: facts.studiedToday === true, sentToday: sentOn(key) === undefined ? 0 : 1, dismissals: history.dismissStreak?.due ?? 0, dueAt}, key),
    {kind: 'due', ...pick(notificationCopy({kind: 'due', count, backlog: Math.max(count, due.backlog ?? count), minutes: due.minutes ?? 0})), url: '#/review',
      actions: [open('#/review', 'Start review'), {action: 'later', title: 'Later'}]});
  }

  // K2 deadline: tomorrow's checkpoints, once a day at the study time.
  const tomorrow = (facts.tomorrow ?? []).slice(0, 20);
  if (tomorrow.length) {
    const key = 'deadline:' + today, slugs = new Set(tomorrow.map(item => item.slug));
    const url = slugs.size === 1 ? link(tomorrow[0].slug) : '#/calendar';
    add(withSent({kind: 'deadline', key, enabled: kinds.deadline !== false, sentToday: sentOn(key) === undefined ? 0 : 1, dueAt}, key),
      {kind: 'deadline', ...pick(notificationCopy({kind: 'deadline', checkpoints: tomorrow})), url, actions: [open(url, 'Open'), {action: 'not_today', title: 'Not today'}]});
  }

  // K3 behind: one per late checkpoint (three days past its date), repeated after 7 days (14 after three dismissals).
  for (const item of (facts.late ?? []).slice(0, 5)) {
    const key = 'behind:' + item.slug + ':' + item.code;
    const candidate: ReminderCandidate = {kind: 'behind', key, enabled: kinds.behind !== false, dismissals: history.dismissStreak?.behind ?? 0,
      behindTransitionAt: zonedInstant(addDays(item.dueOn, 3), studyTime, zone), lateDueOn: ms(item.dueOn), projectSentToday: sentToday('behind:' + item.slug + ':')};
    const targetDate = ms(item.targetDate); if (targetDate !== undefined) candidate.targetDate = targetDate;
    add(withSent(candidate, key), {kind: 'behind', ...pick(notificationCopy({kind: 'behind', project: item.project, code: item.code, dueDate: shortDate(item.dueOn)})),
      url: link(item.slug), actions: [open(link(item.slug), 'Open'), {action: 'not_today', title: 'Not today'}]});
  }

  // K4 resume: a session left paused for 18 hours, at most twice, never after studying today.
  const paused = facts.paused;
  if (paused) {
    const key = 'resume:' + paused.slug + ':' + paused.number;
    if (sentOn(key) === undefined) add({kind: 'resume', key, enabled: kinds.resume !== false, studiedToday: facts.studiedToday === true, pausedSince: ms(paused.lastActivityAt),
      sessionSends: 0, sentToday: sentToday('resume:') ? 1 : 0, dismissals: history.dismissStreak?.resume ?? 0},
    {kind: 'resume', ...pick(notificationCopy({kind: 'resume', project: paused.project, step: paused.step ?? 1, steps: paused.steps ?? 1, question: paused.question ?? null, checkpointTitle: paused.checkpointTitle ?? null})),
      url: link(paused.slug), actions: [open(link(paused.slug), 'Resume'), {action: 'later', title: 'Later'}]});
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
    const sources = (tutor.origins ?? []).filter((origin): origin is 'claude' | 'chatgpt' => origin === 'claude' || origin === 'chatgpt');
    const ids = (tutor.cardIds ?? []).slice(0, 20);
    const buttons = tutorActions({cards: Math.min(counts.cards, ids.length), hasPlan: counts.plans + counts.planChanges > 0, approveCards: prefs.approveCards === true})
      .map((label): ActionSpec => label.startsWith('Approve') ? {action: 'approve_cards', title: label, x: {ids}} : label === 'Review' ? open('#/proposals', 'Review') : {action: 'later', title: label});
    add(candidate, {kind: 'tutor', ...pick(notificationCopy({kind: 'tutor', sources, counts, projects: (tutor.projects ?? []).slice(0, 2), notesAnswered: tutor.answeredNotes ?? 0,
      ...(ended?.number !== undefined ? {sessionNo: String(ended.number)} : {}), ...(ended?.summary ? {summary: ended.summary} : {})})), url: '#/proposals', actions: buttons});
  }

  // K6 digest: weekly on the owner's day and time (as-happens and weekly modes); daily in daily mode.
  const week = facts.week;
  if (mode === 'daily') {
    const key = 'digest:daily:' + today, clauses = [due && (due.count ?? 0) > 0 ? (due.count as number) + (due.count === 1 ? ' card due' : ' cards due') : null,
      tomorrow.length ? tomorrow.length + (tomorrow.length === 1 ? ' checkpoint tomorrow' : ' checkpoints tomorrow') : null,
      (facts.late ?? []).length ? (facts.late as unknown[]).length + ' to catch up' : null].filter((value): value is string => !!value);
    add(withSent({kind: 'digest', key, enabled: kinds.digest !== false, period: 'daily', periodKey: today, dueAt}, key),
      {kind: 'digest', ...pick(notificationCopy({kind: 'digest', period: 'daily', clauses})), url: '#/', actions: [open('#/', 'Open')]});
  } else if (week) {
    const wanted = Number.isSafeInteger(prefs.digest?.weekday) ? (prefs.digest!.weekday as number) % 7 : 0;
    let day = today; while (weekdayOf(day) !== wanted) day = addDays(day, -1);
    const key = 'digest:weekly:' + day;
    let lastKey: string | undefined, lastAt = 0;
    for (const [other, at] of Object.entries(lastByKey)) if (other.startsWith('digest:weekly:') && (ms(at) ?? 0) >= lastAt) {lastKey = other; lastAt = ms(at) ?? 0;}
    const candidate = withSent({kind: 'digest', key, enabled: kinds.digest !== false, period: 'weekly', periodKey: day, dueAt: zonedInstant(day, clock(prefs.digest?.time, '09:00'), zone)}, key);
    if (lastKey) candidate.lastSentPeriodKey = lastKey.slice('digest:weekly:'.length);
    const next = week.next ? {code: week.next.code, title: week.next.title, date: week.next.dueOn ? shortDate(week.next.dueOn) : ''} : undefined;
    add(candidate, {kind: 'digest', ...pick(notificationCopy({kind: 'digest', period: 'weekly', daysStudied: week.daysStudied ?? 0, cardsReviewed: week.reviews ?? 0, checkpoints: (week.demonstrated ?? []).length,
      ...(next && next.date ? {next} : {})})), url: '#/insights', actions: [open('#/insights', 'Open')]});
  }

  // K7 plan: a project's plan now ends after its target date; one reminder per plan end and target.
  for (const item of (facts.pastTarget ?? []).slice(0, 5)) {
    const key = 'plan:' + item.slug + ':' + item.targetDate + ':' + item.lastDueOn;
    if (sentOn(key) !== undefined) continue;
    add({kind: 'plan', key, enabled: kinds.plan !== false, targetTransition: true, targetTransitionAt: now},
      {kind: 'plan', ...pick(notificationCopy({kind: 'plan', project: item.project, planEnd: shortDate(item.lastDueOn), targetDate: shortDate(item.targetDate)})),
        url: link(item.slug), actions: [open(link(item.slug), 'Open')]});
  }

  // K8 rhythm: after two quiet days, with cards due and a next checkpoint to name; only when the owner switched it on.
  const next = facts.tomorrow?.[0] ?? (facts.late?.[0] && {project: facts.late[0].project, code: facts.late[0].code});
  if (kinds.rhythm === true && (facts.quietDays ?? 0) >= 2 && due && (due.count ?? 0) > 0 && next) {
    const key = 'rhythm:' + today;
    add(withSent({kind: 'rhythm', key, enabled: true, dismissals: history.dismissStreak?.rhythm ?? 0, dueAt}, key),
      {kind: 'rhythm', ...pick(notificationCopy({kind: 'rhythm', count: due.count as number, minutes: due.minutes ?? 0, code: next.code, project: next.project})),
        url: '#/review', actions: [open('#/review', 'Start review'), {action: 'not_today', title: 'Not today'}]});
  }
  return {candidates, context, display};
}
const pick = (copy: {title: string; body: string}) => ({title: copy.title, body: copy.body});
