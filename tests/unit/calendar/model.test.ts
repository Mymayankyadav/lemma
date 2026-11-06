import { describe, expect, it } from 'vitest';
import { agendaGroups, calendarRange, dayCapacity, dayKey, daySlots, savedSlices, shiftDay, validDayKey } from '../../../src/features/calendar/model';
import type { CalendarBlockRecord, StudyEntryRecord } from '../../../src/data/study/contract';

const entry: StudyEntryRecord = {
  id: 'focus', intent: 'Prove the lemma', source: 'timer', status: 'saved',
  reflection: null, rating: null, version: 2, createdAt: '2026-11-06T09:00:00Z',
  updatedAt: '2026-11-06T10:00:00Z', savedAt: '2026-11-06T10:00:00Z',
  intervals: [{ id: 'f', kind: 'focus', start: '2026-11-06T09:00:00Z', end: '2026-11-06T10:00:00Z' }],
};
const block: CalendarBlockRecord = {
  id: 'busy', title: 'Appointment', kind: 'busy', startsAt: '2026-11-06T09:30:00Z',
  endsAt: '2026-11-06T10:30:00Z', timeZone: 'UTC', status: 'planned', version: 1,
};

describe('N17 Calendar civil days, entries and capacity', () => {
  it('uses civil local dates, never the UTC slice, and navigates month/year boundaries', () => {
    expect(dayKey(new Date('2026-11-06T18:40:00Z'), 'Asia/Kolkata')).toBe('2026-11-07');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(validDayKey('2026-02-29')).toBe(false);
    expect(validDayKey('2028-02-29')).toBe(true);
    expect(validDayKey('2026-13-01')).toBe(false);
  });
  it('groups a block and saved focus spanning Kolkata midnight into both days', () => {
    const crossing: CalendarBlockRecord = {
      ...block, startsAt: '2026-11-06T18:20:00Z', endsAt: '2026-11-06T18:40:00Z',
      timeZone: 'Asia/Kolkata',
    };
    const session: StudyEntryRecord = {
      ...entry, intervals: [{ id: 'x', kind: 'focus', start: crossing.startsAt, end: crossing.endsAt }],
    };
    const groups = agendaGroups('2026-11-06', 'Asia/Kolkata', [session], [crossing]);
    expect(groups).toHaveLength(7);
    expect(groups[0].day).toBe('2026-11-06');
    expect(groups[1].day).toBe('2026-11-07');
    expect(groups[0].blocks.map(b => b.id)).toEqual(['busy']);
    expect(groups[1].blocks.map(b => b.id)).toEqual(['busy']);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[1].entries).toHaveLength(1);
    expect(groups[0].entries[0].end).toBe(groups[1].entries[0].start);
    expect((Date.parse(groups[0].entries[0].end) - Date.parse(groups[0].entries[0].start)) / 60000).toBe(10);
  });
  it('treats the London spring DST day as 23 elapsed hours and autumn as 25', () => {
    const spring = calendarRange('2026-03-29', 'Europe/London');
    const autumn = calendarRange('2026-10-25', 'Europe/London');
    expect((Date.parse(spring.end) - Date.parse(spring.start)) / 3600000).toBe(23);
    expect(daySlots('2026-03-29', 'Europe/London', [], [])).toHaveLength(23);
    expect((Date.parse(autumn.end) - Date.parse(autumn.start)) / 3600000).toBe(25);
    expect(daySlots('2026-10-25', 'Europe/London', [], [])).toHaveLength(25);
    expect(dayCapacity('2026-03-29', 'Europe/London', [], []).free).toBe(23 * 60);
  });
  it('excludes drafts, discards and breaks from logged entries', () => {
    const breakOnly = { ...entry, id: 'break', intervals: [
      { id: 'b', kind: 'break' as const, start: '2026-11-06T10:00:00Z', end: '2026-11-06T10:15:00Z' },
    ] };
    const range = calendarRange('2026-11-06', 'UTC');
    expect(savedSlices([entry, { ...entry, id: 'draft', status: 'draft' }, { ...entry, id: 'discarded', status: 'discarded' }, breakOnly], range)).toHaveLength(1);
  });
  it('stacks overlapping time logged first, busy second, planned third without double counting', () => {
    const study = { ...block, id: 'study', kind: 'study' as const,
      startsAt: '2026-11-06T10:15:00Z', endsAt: '2026-11-06T11:00:00Z' };
    const capacity = dayCapacity('2026-11-06', 'UTC', [entry], [block, study]);
    expect(capacity.logged).toBe(60);
    expect(capacity.busy).toBe(30);
    expect(capacity.planned).toBe(30);
    expect(capacity.free).toBe(1320);
    expect(capacity.logged + capacity.busy + capacity.planned + capacity.free).toBe(1440);
  });
  it('shows each block once in the day timeline and ignores cancelled blocks', () => {
    const rows = daySlots('2026-11-06', 'UTC', [entry], [block, { ...block, id: 'cancelled', status: 'cancelled' }]);
    expect(rows.flatMap(row => row.blocks).map(b => b.id)).toEqual(['busy']);
    expect(rows.flatMap(row => row.entries).map(s => s.entry.id)).toEqual(['focus']);
  });
});
