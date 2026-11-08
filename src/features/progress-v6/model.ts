import { dayBounds, loggedMinutes, subjectPartition, type StudyEntry as EffortEntry } from '../../lib/effort';
import type { StudyEntryRecord, StudyRange } from '../../data/study/contract';

export type EffortRange = 'day' | 'week' | 'month' | '7' | '30' | '90';
export type EffortPeriod = { days: string[]; span: StudyRange; range: EffortRange };
const minute = 60000;

export function civilDay(at: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at);
  const get = (key: string) => parts.find(x => x.type === key)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
export function periodFor(range: EffortRange, now: Date, zone: string): EffortPeriod {
  const today = civilDay(now, zone);
  const [y, m, d] = today.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // local civil date, not UTC instant
  const rolling = range === '7' || range === '30' || range === '90' ? Number(range) : null;
  const first = rolling !== null ? addDays(today, 1 - rolling) : range === 'day' ? today : range === 'week'
    ? addDays(today, -((weekday + 6) % 7)) : today.slice(0, 7) + '-01';
  const next = rolling !== null ? addDays(today, 1) : range === 'day' ? addDays(first, 1) : range === 'week'
    ? addDays(first, 7) : new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const count = Math.round((Date.parse(next + 'T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / (24 * 60 * minute));
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  return { range, days, span: { start: dayBounds(first, zone).start, end: dayBounds(next, zone).start } };
}

function closedEntries(entries: StudyEntryRecord[]): EffortEntry[] {
  return entries.map(entry => ({
    id: entry.id, status: entry.status, subjectId: entry.subjectId,
    intervals: entry.intervals.filter(interval => interval.end !== null)
      .map(interval => ({ start: interval.start, end: interval.end!, kind: interval.kind })),
  }));
}

/** Integer display minutes are assigned by largest remainder; the parts always sum to total. */
export function partitionWholeMinutes(parts: Record<string, number>, total: number) {
  const wanted = Math.max(0, Math.round(total));
  if (wanted === 0) return [];
  const out = Object.entries(parts).filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([id, value]) => ({ id, minutes: Math.floor(value), fraction: value % 1 }));
  let assigned = out.reduce((sum, item) => sum + item.minutes, 0);
  // Defensively handle slight measurement drift without ever exceeding the displayed total.
  for (const item of [...out].sort((a, b) => a.fraction - b.fraction)) {
    if (assigned <= wanted) break;
    const remove = Math.min(assigned - wanted, item.minutes);
    item.minutes -= remove; assigned -= remove;
  }
  const ordered = [...out].sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; assigned < wanted && ordered.length; i++) {
    ordered[i % ordered.length].minutes++;
    assigned++;
  }
  return out.filter(item => item.minutes > 0)
    .map(({ id, minutes }) => ({ id, label: id === 'unassigned' ? 'Unassigned' : id, minutes }));
}

export function effortSummary(entries: StudyEntryRecord[], period: EffortPeriod, zone: string, now: string) {
  const closed = closedEntries(entries);
  const total = loggedMinutes(closed, period.span, zone, now).minutes;
  const daily = period.days.map(day => {
    const span = dayBounds(day, zone);
    return { day, minutes: loggedMinutes(closed, span, zone, now).minutes };
  });
  const exact = subjectPartition(closed, period.span, zone, now);
  const parts = partitionWholeMinutes(exact, total)
    .sort((a, b) => a.id === 'unassigned' ? 1 : b.id === 'unassigned' ? -1 : b.minutes - a.minutes);
  // Charts show actual values, not rounded whole-minute approximations. The
  // hundredth-minute allocation remains additive even for overlapping sessions.
  const exactParts = partitionWholeMinutes(
    Object.fromEntries(Object.entries(exact).map(([id, value]) => [id, value * 100])),
    total * 100,
  ).map(part => ({ ...part, minutes: part.minutes / 100 }))
    .sort((a,b) => a.id === 'unassigned' ? 1 : b.id === 'unassigned' ? -1 : b.minutes - a.minutes);
  return { minutes: total, displayMinutes: Math.round(total), daily, parts, exactParts };
}

/** Visible chart values keep two decimals, without rounding everything to minutes. */
export const formatExactMinutes = (minutes: number): string => String(Number(Math.max(0, minutes).toFixed(2)));
