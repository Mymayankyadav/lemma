import { describe, expect, it } from 'vitest';
import { civilDay, effortSummary, periodFor, partitionWholeMinutes } from '../../../src/features/progress-v6/model';
import type { StudyEntryRecord } from '../../../src/data/study/contract';

const now = new Date('2026-11-07T12:00:00Z');
function saved(id: string, start: string, end: string, subjectId?: string | null): StudyEntryRecord {
  return {
    id, intent: id, source: 'timer', status: 'saved', subjectId,
    version: 1, reflection: null, rating: null, createdAt: start, updatedAt: end, savedAt: end,
    intervals: [{ id: id + '-i', kind: 'focus', start, end }],
  };
}
describe('N18 Progress saved-time calculations', () => {
  it('uses local civil time for day, Monday-start week and month range', () => {
    expect(civilDay(new Date('2026-11-06T19:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-07');
    const day = periodFor('day', new Date('2026-11-06T10:00:00Z'), 'Asia/Kolkata');
    expect(day.days).toEqual(['2026-11-06']);
    expect(day.span.start).toBe('2026-11-05T18:30:00.000Z');
    const week = periodFor('week', now, 'UTC');
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toBe('2026-11-02');
    expect(week.days[6]).toBe('2026-11-08');
    const month = periodFor('month', now, 'UTC');
    expect(month.days).toHaveLength(30);
    expect(month.days[0]).toBe('2026-11-01');
    expect(month.days[29]).toBe('2026-11-30');
  });
  it('clips crossing-midnight focus minutes to the correct two civil days', () => {
    const crossing = saved('late', '2026-11-06T23:50:00Z', '2026-11-07T00:10:00Z');
    const week = effortSummary([crossing], periodFor('week', now, 'UTC'), 'UTC', now.toISOString());
    expect(week.minutes).toBe(20);
    expect(week.daily.find(d => d.day === '2026-11-06')?.minutes).toBe(10);
    expect(week.daily.find(d => d.day === '2026-11-07')?.minutes).toBe(10);
  });
  it('counts only saved focus, excludes draft, discarded and breaks', () => {
    const a = saved('saved', '2026-11-06T09:00:00Z', '2026-11-06T10:00:00Z', 'math');
    a.intervals = [
      { id:'a', kind:'focus', start:'2026-11-06T09:00:00Z', end:'2026-11-06T09:30:00Z' },
      { id:'b', kind:'break', start:'2026-11-06T09:30:00Z', end:'2026-11-06T09:40:00Z' },
      { id:'c', kind:'focus', start:'2026-11-06T09:40:00Z', end:'2026-11-06T10:00:00Z' },
      { id:'running', kind:'focus', start:'2026-11-06T10:00:00Z', end:null },
    ];
    const draft = { ...saved('draft', '2026-11-06T11:00:00Z', '2026-11-06T12:00:00Z'), status: 'draft' as const };
    const discarded = { ...saved('discard', '2026-11-06T13:00:00Z', '2026-11-06T14:00:00Z'), status: 'discarded' as const };
    const summary = effortSummary([a, draft, discarded], periodFor('day', new Date('2026-11-06T12:00:00Z'), 'UTC'), 'UTC', now.toISOString());
    expect(summary.minutes).toBe(50);
    expect(summary.displayMinutes).toBe(50);
    expect(summary.parts).toEqual([{ id:'math', label:'math', minutes:50 }]);
  });
  it('partitions overlapping saved intervals exactly once and displays Unassigned last', () => {
    const entries = [
      saved('algebra', '2026-11-06T09:00:00Z', '2026-11-06T10:00:00Z', 'Algebra'),
      saved('geometry', '2026-11-06T09:30:00Z', '2026-11-06T10:30:00Z', 'Geometry'),
      saved('misc', '2026-11-06T10:30:00Z', '2026-11-06T11:00:00Z', null),
    ];
    const summary = effortSummary(entries, periodFor('week', now, 'UTC'), 'UTC', now.toISOString());
    expect(summary.minutes).toBe(120);
    expect(summary.parts.find(p => p.id === 'Algebra')?.minutes).toBe(60);
    expect(summary.parts.find(p => p.id === 'Geometry')?.minutes).toBe(30);
    expect(summary.parts.at(-1)).toEqual({ id:'unassigned', label:'Unassigned', minutes:30 });
    expect(summary.parts.reduce((sum,p) => sum + p.minutes, 0)).toBe(summary.displayMinutes);
  });
  it('assigns fractional minute rounding without changing the displayed total', () => {
    const parts = partitionWholeMinutes({ Algebra: 0.6, Geometry: 0.3, unassigned: 0.6 }, 1.5);
    expect(parts.reduce((sum,p) => sum + p.minutes, 0)).toBe(2);
    expect(parts.find(p => p.id === 'unassigned')?.label).toBe('Unassigned');
  });
  it('uses real elapsed bounds for the short London spring day', () => {
    const day = periodFor('day', new Date('2026-03-29T12:00:00Z'), 'Europe/London');
    expect((Date.parse(day.span.end) - Date.parse(day.span.start)) / 3600000).toBe(23);
  });
});
