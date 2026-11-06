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
  return entries.filter(entry => entry.status === 'saved').flatMap(entry =>
    entry.intervals.filter(i => i.kind === 'focus' && i.end && overlaps(i.start, i.end, range))
      .map(i => ({
        entry,
        start: new Date(Math.max(millis(i.start), millis(range.start))).toISOString(),
        end: new Date(Math.min(millis(i.end!), millis(range.end))).toISOString(),
      })),
  );
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

/** N26.1: shared DST-safe seven-day Week model; N26.2 adds Week/Month UI. */
export function weekGrid(date:string,zone:string,entries:StudyEntryRecord[],
 blocks:CalendarBlockRecord[],weekStartsOn=1){
 if(!validDayKey(date)||!Number.isInteger(weekStartsOn)||weekStartsOn<0||weekStartsOn>6)
  throw new Error('Invalid week date or week start');
 const weekday=new Date(date+'T00:00:00Z').getUTCDay();
 const first=shiftDay(date,-((weekday-weekStartsOn+7)%7));
 const days=Array.from({length:7},(_,offset)=>{
  const day=shiftDay(first,offset),range=calendarRange(day,zone);
  const visible=visibleBlocks(blocks,range);
  const lanes:{block:CalendarBlockRecord;lane:number}[]=[];
  const ends:number[]=[];
  for(const block of visible){
   const start=Math.max(millis(block.startsAt),millis(range.start));
   const end=Math.min(millis(block.endsAt),millis(range.end));
   let lane=ends.findIndex(free=>free<=start);
   if(lane<0){lane=ends.length;ends.push(end)}else ends[lane]=end;
   lanes.push({block,lane});
  }
  return {day,range,capacity:dayCapacity(day,zone,entries,blocks),
   saved:savedSlices(entries,range),blocks:lanes};
 });
 return {first,days};
}
