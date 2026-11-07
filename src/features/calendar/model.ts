import { capacityStack, dayBounds } from '../../lib/effort';
import type { CalendarBlockRecord, StudyEntryRecord, StudyRange } from '../../data/study/contract';

const millis = (iso: string) => Date.parse(iso);
const hourMs = 60 * 60 * 1000;

/** Civil dates must never be derived by slicing a UTC ISO timestamp. */
export function dayKey(instant: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (kind: string) => parts.find(part => part.type === kind)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function validDayKey(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDay(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function calendarRange(date: string, zone: string, days = 1): StudyRange {
  return { start: dayBounds(date, zone).start, end: dayBounds(shiftDay(date, days - 1), zone).end };
}

export function overlaps(start: string, end: string, range: StudyRange): boolean {
  return millis(start) < millis(range.end) && millis(end) > millis(range.start);
}

export type LoggedSlice = { entry: StudyEntryRecord; start: string; end: string };

export function savedSlices(entries: StudyEntryRecord[], range: StudyRange): LoggedSlice[] {
  // Share Today and Progress's union-of-focus minus saved-break semantics.
  // Attribute overlapping focus to the first saved entry (as subjectPartition
  // does), so Calendar rows never show the same logged minute twice.
  const seen = new Set<string>();
  const saved = entries.filter(entry => {
    if (entry.status !== 'saved' || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  type Span = [number, number];
  const from = millis(range.start), to = millis(range.end);
  const valid = ([a, b]: Span) => Number.isFinite(a) && Number.isFinite(b) && b > a;
  const clip = (start: string, end: string): Span =>
    [Math.max(millis(start), from), Math.min(millis(end), to)];
  const union = (spans: Span[]): Span[] => {
    const sorted = spans.filter(valid).sort((a, b) => a[0] - b[0]);
    const result: Span[] = [];
    for (const [start, end] of sorted) {
      const last = result.at(-1);
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else result.push([start, end]);
    }
    return result;
  };
  const subtract = (spans: Span[], excluded: Span[]): Span[] => {
    let remaining = union(spans);
    for (const [excludedStart, excludedEnd] of union(excluded)) {
      remaining = remaining.flatMap(([start, end]): Span[] => {
        if (end <= excludedStart || start >= excludedEnd) return [[start, end]];
        return ([[start, Math.min(end, excludedStart)],
          [Math.max(start, excludedEnd), end]] as Span[]).filter(valid);
      });
    }
    return remaining;
  };
  // The shared effort metrics subtract saved breaks across all saved entries.
  const breaks = union(saved.flatMap(entry => entry.intervals
    .filter(i => i.kind === 'break' && i.end !== null)
    .map(i => clip(i.start, i.end!))));
  const attributed: Span[] = [];
  return saved.flatMap(entry => {
    const focus = union(entry.intervals
      .filter(i => i.kind === 'focus' && i.end !== null)
      .map(i => clip(i.start, i.end!)));
    const slices = subtract(subtract(focus, breaks), attributed);
    attributed.push(...slices);
    return slices.map(([start, end]) => ({
      entry, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    }));
  });
}
export function visibleBlocks(blocks: CalendarBlockRecord[], range: StudyRange): CalendarBlockRecord[] {
  return blocks.filter(block => block.status !== 'cancelled' && overlaps(block.startsAt, block.endsAt, range))
    .sort((a, b) => millis(a.startsAt) - millis(b.startsAt));
}

export function agendaGroups(date: string, zone: string, entries: StudyEntryRecord[], blocks: CalendarBlockRecord[]) {
  return Array.from({ length: 7 }, (_, offset) => {
    const day = shiftDay(date, offset);
    const range = calendarRange(day, zone);
    return { day, entries: savedSlices(entries, range), blocks: visibleBlocks(blocks, range) };
  });
}

/** Iterating real instants gives 23 rows on the spring DST day and 25 on the autumn one. */
export function daySlots(date: string, zone: string, entries: StudyEntryRecord[], blocks: CalendarBlockRecord[]) {
  const range = calendarRange(date, zone);
  const saved = savedSlices(entries, range);
  const planned = visibleBlocks(blocks, range);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  });
  const rows = [];
  for (let at = millis(range.start); at < millis(range.end); at += hourMs) {
    const end = Math.min(at + hourMs, millis(range.end));
    rows.push({
      at: new Date(at).toISOString(),
      label: formatter.format(new Date(at)),
      entries: saved.filter(slice => millis(slice.start) >= at && millis(slice.start) < end),
      blocks: planned.filter(block => {
        const start = Math.max(millis(block.startsAt), millis(range.start));
        return start >= at && start < end;
      }),
    });
  }
  return rows;
}

/** Logged wins any overlaps; busy comes next, then remaining planned study time. */
export function dayCapacity(date: string, zone: string, entries: StudyEntryRecord[], blocks: CalendarBlockRecord[]) {
  const range = calendarRange(date, zone);
  const logged = savedSlices(entries, range).map(slice => ({ start: slice.start, end: slice.end }));
  const visible = visibleBlocks(blocks, range);
  const busy = visible.filter(b => b.kind === 'busy').map(b => ({ start: b.startsAt, end: b.endsAt }));
  const planned = visible.filter(b => b.kind === 'study' && b.status === 'planned')
    .map(b => ({ start: b.startsAt, end: b.endsAt }));
  return capacityStack(logged, busy, planned, range);
}


/** Calendar weeks are civil days, not multiples of 24 elapsed hours (DST-safe). */
export function weekStartDay(date: string, firstDay: number = 1): string {
  if (!validDayKey(date) || !Number.isInteger(firstDay) || firstDay < 0 || firstDay > 6)
    throw new Error('Invalid week date or first weekday');
  const weekday = new Date(date + 'T00:00:00.000Z').getUTCDay();
  return shiftDay(date, -((weekday - firstDay + 7) % 7));
}

/** Give every simultaneously visible block its own lane; never hide an overlap. */
export function blockLanes(blocks: CalendarBlockRecord[], range: StudyRange) {
  const ends: number[] = [];
  return visibleBlocks(blocks, range).map(block => {
    const start = Math.max(millis(range.start), millis(block.startsAt));
    const end = Math.min(millis(range.end), millis(block.endsAt));
    let lane = ends.findIndex(lastEnd => lastEnd <= start);
    if (lane < 0) lane = ends.length;
    ends[lane] = end;
    return { block, lane };
  });
}

/** Same civil-day helpers and capacity arithmetic as Calendar Day. */
export function weekDays(date: string, zone: string, entries: StudyEntryRecord[],
  blocks: CalendarBlockRecord[], firstDay = 1) {
  const first = weekStartDay(date, firstDay);
  return Array.from({length: 7}, (_, offset) => {
    const day = shiftDay(first, offset);
    const range = calendarRange(day, zone);
    return {
      day, range, capacity: dayCapacity(day, zone, entries, blocks),
      logged: savedSlices(entries, range),
      blocks: blockLanes(blocks, range),
    };
  });
}

/** Month navigation preserves the intended date, clamping only short months. */
export function shiftMonth(date: string, amount: number): string {
  if (!validDayKey(date) || !Number.isInteger(amount))
    throw new Error('Invalid calendar month shift');
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1 + amount, 1));
  const last = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return moved.getUTCFullYear() + '-' + pad(moved.getUTCMonth() + 1) + '-' + pad(Math.min(day, last));
}

/** One bounded request covers the entire month grid, including outside-month cells. */
export function monthBounds(date: string, zone: string, firstDay = 1) {
  if (!validDayKey(date)) throw new Error('Invalid calendar month');
  const [year, month] = date.split('-').map(Number);
  const firstOfMonth = date.slice(0, 7) + '-01';
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastOfMonth = date.slice(0, 7) + '-' + String(lastDay).padStart(2, '0');
  const first = weekStartDay(firstOfMonth, firstDay);
  const last = shiftDay(weekStartDay(lastOfMonth, firstDay), 6);
  const count = Math.round((Date.parse(last + 'T00:00:00Z') -
    Date.parse(first + 'T00:00:00Z')) / 86400000) + 1;
  return {first, last, count, range: calendarRange(first, zone, count)};
}

/** Same per-day logged minutes and visible block semantics as Day and Week. */
export function monthDays(date: string, zone: string, entries: StudyEntryRecord[],
  blocks: CalendarBlockRecord[], firstDay = 1) {
  const bounds = monthBounds(date, zone, firstDay);
  const month = date.slice(0, 7);
  return {
    ...bounds,
    days: Array.from({length: bounds.count}, (_, offset) => {
      const day = shiftDay(bounds.first, offset);
      const range = calendarRange(day, zone);
      return {day, inMonth: day.startsWith(month),
        capacity: dayCapacity(day, zone, entries, blocks),
        blocks: visibleBlocks(blocks, range)};
    }),
  };
}
