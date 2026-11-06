import { dayBounds, loggedMinutes, subjectPartition } from '../../lib/effort';
import type { StudyEntry as EffortEntry } from '../../lib/effort';
import type { StudyEntryRecord, StudyRange } from '../../data/study/contract';

export type ProgressRange = 'day' | 'week' | 'month';
export interface ProgressDay { date: string; minutes: number }
export interface ProgressSubject { id: string; name: string; minutes: number }
export interface ProgressWindow { range: StudyRange; days: string[] }

function localDate(now: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const number = (kind: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === kind)?.value;
  return `${number('year')}-${number('month')}-${number('day')}`;
}
function shiftDate(date: string, amount: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + amount)).toISOString().slice(0, 10);
}
/** Inclusive civil dates; SQL/StudyApi reads use the containing half-open instant bounds. */
export function progressWindow(kind: ProgressRange, zone: string, now: string): ProgressWindow {
  const today = localDate(now, zone);
  const [y, m] = today.split('-').map(Number);
  const first = kind === 'month' ? `${y}-${String(m).padStart(2, '0')}-01`
    : kind === 'week' ? shiftDate(today, -(new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7)
      : today;
  const after = kind === 'day' ? shiftDate(first, 1)
    : kind === 'week' ? shiftDate(first, 7)
      : new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const days: string[] = [];
  for (let date = first; date < after; date = shiftDate(date, 1)) days.push(date);
  return { range: {start: dayBounds(first, zone).start, end: dayBounds(after, zone).start}, days };
}

/** Open timer intervals never count as saved effort; the metrics contract uses closed spans. */
function effortEntries(entries: StudyEntryRecord[]): EffortEntry[] {
  return entries.map(entry => ({
    id: entry.id, status: entry.status, subjectId: entry.subjectId,
    intervals: entry.intervals.filter(i => i.end !== null).map(i => ({
      start: i.start, end: i.end!, kind: i.kind,
    })),
  }));
}

/** All metrics use the exact same saved-only interval union and time cutoff. */
export function progressMetrics(entries: StudyEntryRecord[], kind: ProgressRange, zone: string, now: string) {
  const window = progressWindow(kind, zone, now);
  const spans = effortEntries(entries);
  const total = loggedMinutes(spans, window.range, zone, now).minutes;
  const perDay: ProgressDay[] = kind === 'day' ? [] : window.days.map(date => ({
    date, minutes: loggedMinutes(spans, dayBounds(date, zone), zone, now).minutes,
  }));
  const parts = subjectPartition(spans, window.range, zone, now);
  const keys = Object.keys(parts).sort((a, b) => a === 'unassigned' ? 1 : b === 'unassigned' ? -1 : a.localeCompare(b));
  const subjects: ProgressSubject[] = keys.map(id => ({id, name: id === 'unassigned' ? 'Unassigned' : id, minutes: parts[id]}));
  // Account for floating-point addition in the partition without changing any span.
  if (subjects.length) subjects[subjects.length - 1].minutes += total - subjects.reduce((sum, row) => sum + row.minutes, 0);
  return {total, perDay, subjects, range: window.range};
}
