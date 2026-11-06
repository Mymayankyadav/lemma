import { dayBounds, loggedMinutes, subjectPartition, type StudyEntry as EffortEntry } from '../../lib/effort';
import type { StudyEntryRecord, StudyRange } from '../../data/study/contract';

export type EffortRange = 'day' | 'week' | 'month';
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
  const first = range === 'day' ? today : range === 'week'
    ? addDays(today, -((weekday + 6) % 7)) : today.slice(0, 7) + '-01';
  const next = range === 'day' ? addDays(first, 1) : range === 'week'
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
  const names = Object.keys(parts);
  const wanted = Math.max(0, Math.round(total));
  const out = names.map(id => ({
    id,
    minutes: Math.max(0, Math.floor(parts[id])),
    fraction: Math.max(0, parts[id] - Math.floor(parts[id])),
  }));
  let missing = Math.max(0, wanted - out.reduce((sum, item) => sum + item.minutes, 0));
  for (const item of [...out].sort((a, b) => b.fraction - a.fraction)) {
    if (!missing) break;
    item.minutes++; missing--;
  }
  // A minute-wise user correction should never be lost even if input partitions undercount.
  if (missing && out.length) out[0].minutes += missing;
  return out.map(({ id, minutes }) => ({ id, label: id === 'unassigned' ? 'Unassigned' : id, minutes }));
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
  return { minutes: total, displayMinutes: Math.round(total), daily, parts };
}
