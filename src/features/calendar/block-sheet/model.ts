import type { CalendarBlockKind, CalendarBlockStatus } from '../../../data/study/contract';

export interface BlockDraft {
  title: string;
  kind: CalendarBlockKind;
  status: CalendarBlockStatus;
  start: string;
  end: string;
}

export function localBlockTime(instant: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const field = (key: string) => parts.find(item => item.type === key)?.value ?? '';
  return field('year') + '-' + field('month') + '-' + field('day') +
    'T' + field('hour') + ':' + field('minute');
}

/** The calendar's owner zone is the browser-selected zone. Reject DST gaps
 * instead of silently moving a non-existent local time to another hour. */
export function blockInstant(local: string, zone: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) return null;
  const date = new Date(local);
  if (!Number.isFinite(date.getTime()) || localBlockTime(date.toISOString(), zone) !== local) return null;
  return date.toISOString();
}
export function validateBlockDraft(value: BlockDraft, zone: string) {
  const title = value.title.trim();
  const start = blockInstant(value.start, zone), end = blockInstant(value.end, zone);
  if (!title || title.length > 200) throw new Error('Enter a block title (up to 200 characters).');
  if (!start || !end || Date.parse(end) <= Date.parse(start)) {
    throw new Error('Enter a valid start before the end.');
  }
  return { title, kind: value.kind, status: value.status, startsAt: start, endsAt: end, timeZone: zone };
}
