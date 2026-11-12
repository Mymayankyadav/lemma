/**
 * N123 · N5 device calendar (opt-in, off by default). Lemma study blocks are written to a dedicated local "Lemma"
 * calendar so they show in Google Calendar on this phone; optionally, busy times from calendars the learner chooses
 * are read so suggested blocks avoid them. Nothing leaves the phone: busy times are never sent to the server.
 */
import type {CalendarBlockRecord} from '../data/study/contract';
import type {DeviceCalendarEvent} from './bridge';
import {isNative} from './native';
import {readDevicePref} from './device';

export const SYNC_BACK_MS = 24 * 3600_000;
export const SYNC_AHEAD_MS = 30 * 24 * 3600_000;

/** The events the Lemma calendar should hold for these blocks: planned and done study blocks, keyed by block id. Pure. */
export function calendarEvents(blocks: CalendarBlockRecord[]): DeviceCalendarEvent[] {
  return blocks
    .filter(block => block.kind === 'study' && block.status !== 'cancelled' && Date.parse(block.endsAt) > Date.parse(block.startsAt))
    .map(block => ({
      key: block.id,
      title: (block.title || 'Study block') + (block.status === 'done' ? ' ✓' : ''),
      start: Date.parse(block.startsAt),
      end: Date.parse(block.endsAt),
      description: 'Planned in Lemma. Edit or delete it in Lemma; changes here are overwritten.',
      timeZone: block.timeZone || 'UTC',
    }))
    .sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
}

/** Busy intervals as read-only `busy` blocks the planner already understands (ids never collide with real blocks). */
export function busyBlocks(busy: {start: number; end: number}[], zone: string): CalendarBlockRecord[] {
  return busy.filter(item => item.end > item.start).map((item, index): CalendarBlockRecord => ({
    id: 'device-busy-' + index + '-' + item.start,
    kind: 'busy', title: 'Busy', status: 'planned',
    startsAt: new Date(item.start).toISOString(), endsAt: new Date(item.end).toISOString(), timeZone: zone,
    version: 0,
  }));
}

/** Device busy times between two instants, as planner blocks; [] on the web or when the learner has not opted in. */
export async function deviceBusyBlocks(start: string, end: string, zone: string): Promise<CalendarBlockRecord[]> {
  if (!isNative() || !readDevicePref('calendarSync', false)) return [];
  const calendarIds = readDevicePref<string[]>('busyCalendars', []);
  if (!calendarIds.length) return [];
  try {
    const {lemmaNative} = await import('./bridge');
    const native = await lemmaNative();
    const {busy} = await native.calendarBusy({from: Date.parse(start), to: Date.parse(end), calendarIds});
    return busyBlocks(Array.isArray(busy) ? busy : [], zone);
  } catch {
    return [];
  }
}
