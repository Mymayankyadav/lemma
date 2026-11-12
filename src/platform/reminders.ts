/**
 * N123 · N1 reminders the phone computes itself. Without a push service (the Owner chose no Firebase), the app
 * schedules what it can know offline from its last snapshot: cards due at the preferred study time and the start of
 * planned study blocks. The rules mirror Settings › Reminders: the main switch, the schedule, each kind, the due
 * threshold, quiet hours and "at most N a day". Pure, so it is unit-tested; the native side only posts at `at`.
 */
import type {NotifyPrefs} from '../data/types';
import type {CalendarBlockRecord} from '../data/study/contract';
import type {NativeReminder} from './bridge';

const HORIZON_MS = 48 * 3600_000;
/** AW4 (v7 UX audit r3, Owner decision E16): the reminder kinds this phone can deliver itself (`planReminders` reads
 *  only these). Every other kind needs a push service, so in the app it waits in the Inbox and has no switch. */
export const PHONE_REMINDER_KINDS = ['due', 'plan'] as const;

/** Local wall-clock parts of an instant in an IANA zone. */
export function zonedParts(ms: number, zone: string): {date: string; time: string; minutes: number} {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  const time = parts.hour + ':' + parts.minute;
  return {date: parts.year + '-' + parts.month + '-' + parts.day, time, minutes: Number(parts.hour) * 60 + Number(parts.minute)};
}
/** The instant of a local date and HH:MM in a zone (the first match on a DST fold). */
export function zonedInstant(date: string, time: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const seen = zonedParts(guess, zone), [sy, sm, sd] = seen.date.split('-').map(Number);
    const seenWall = Date.UTC(sy, sm - 1, sd, Math.floor(seen.minutes / 60), seen.minutes % 60);
    const drift = seenWall - wall;
    if (!drift) break;
    guess -= drift;
  }
  return guess;
}
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const toMinutes = (time: string) => {const [h, m] = time.split(':').map(Number); return h * 60 + m;};
/** Quiet hours are [start, end) in local time and may wrap midnight; equal ends mean none. */
export function inQuietHours(ms: number, zone: string, quiet: {start: string; end: string} | undefined): boolean {
  if (!quiet) return false;
  const start = toMinutes(quiet.start), end = toMinutes(quiet.end), now = zonedParts(ms, zone).minutes;
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export interface ReminderInput {
  prefs: NotifyPrefs | null | undefined;
  due: number;
  blocks: CalendarBlockRecord[];
  now: number;
  zone: string;
  clock24h: boolean;
}

function clockLabel(ms: number, zone: string, clock24h: boolean): string {
  return new Intl.DateTimeFormat('en-GB', {timeZone: zone, hour: clock24h ? '2-digit' : 'numeric', minute: '2-digit', hour12: !clock24h}).format(new Date(ms));
}

/** Everything the phone should have scheduled right now (the native side replaces its whole schedule with this). */
export function planReminders({prefs, due, blocks, now, zone, clock24h}: ReminderInput): NativeReminder[] {
  if (!prefs?.enabled || prefs.mode === 'off') return [];
  const quiet = prefs.quiet;
  const out: NativeReminder[] = [];
  if (prefs.kinds?.due === true && due >= (prefs.dueThreshold ?? 10)) {
    const today = zonedParts(now, zone).date, time = prefs.studyTime ?? '09:00';
    let at = zonedInstant(today, time, zone);
    if (at <= now + 60_000) at = zonedInstant(addDays(today, 1), time, zone);
    if (!inQuietHours(at, zone, quiet)) out.push({
      id: 'due', channel: 'review', at, route: '/review',
      title: due === 1 ? '1 card due' : due + ' cards due',
      body: 'Your review is ready when you are.',
      publicTitle: 'Review is ready',
      actions: [{id: 'open', label: 'Start review', route: '/review'}, {id: 'later', label: 'Later'}, {id: 'not_today', label: 'Not today'}],
    });
  }
  if (prefs.kinds?.plan === true) {
    for (const block of blocks) {
      if (block.kind !== 'study' || block.status !== 'planned') continue;
      const at = Date.parse(block.startsAt), end = Date.parse(block.endsAt);
      if (!(at > now) || at > now + HORIZON_MS || inQuietHours(at, zone, quiet)) continue;
      const minutes = Math.max(1, Math.round((end - at) / 60_000));
      out.push({
        id: 'block:' + block.id, channel: 'calendar', at, route: '/?startBlock=' + encodeURIComponent(block.id),
        title: block.title || 'Study block',
        body: 'Starts ' + clockLabel(at, zone, clock24h) + ' · ' + minutes + ' min',
        publicTitle: 'A study block is starting',
        actions: [{id: 'start_block', label: 'Start now', route: '/?startBlock=' + encodeURIComponent(block.id)}, {id: 'snooze10', label: 'Snooze 10 min'}],
      });
    }
  }
  out.sort((a, b) => a.at - b.at);
  // "At most N a day", counted per local day in the learner's zone.
  const cap = Math.max(1, prefs.maxPerDay ?? 5), perDay = new Map<string, number>();
  return out.filter(item => {
    const day = zonedParts(item.at, zone).date, count = perDay.get(day) ?? 0;
    if (count >= cap) return false;
    perDay.set(day, count + 1);
    return true;
  });
}
