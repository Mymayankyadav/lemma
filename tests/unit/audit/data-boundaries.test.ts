import {describe, expect, it} from 'vitest';
import {moveToDay} from '../../../src/features/calendar/v7/dayModel';
import {intervalRows, intervalsFromRows} from '../../../src/features/time-log/interval-editor';
import {roundSummary} from '../../../src/features/review/v7/reviewModel';
import type {InsightData} from '../../../src/data/types';

describe('Main bug-hunt reproductions at b809da0', () => {
  it('keeps saved interval timestamps unchanged when editing only a reflection', () => {
    const original = [{kind: 'focus' as const, start: '2026-11-14T09:00:45.000Z', end: '2026-11-14T09:25:15.000Z'}];
    const saved = intervalsFromRows(intervalRows(original, 'UTC'), 'UTC');
    expect(saved.errors).toEqual([null]);
    expect(saved.intervals).toEqual(original);
  });

  it('allows an unchanged valid short break to pass time-log validation', () => {
    const original = [
      {kind: 'focus' as const, start: '2026-11-14T09:00:00.000Z', end: '2026-11-14T09:10:10.000Z'},
      {kind: 'break' as const, start: '2026-11-14T09:10:10.000Z', end: '2026-11-14T09:10:20.000Z'},
      {kind: 'focus' as const, start: '2026-11-14T09:10:20.000Z', end: '2026-11-14T09:25:00.000Z'},
    ];
    expect(intervalsFromRows(intervalRows(original, 'UTC'), 'UTC').errors).toEqual([null, null, null]);
  });

  it.each([
    ['2026-03-07', '2026-03-08', '2026-03-07T15:00:00.000Z', '2026-03-07T16:00:00.000Z', '2026-03-08T14:00:00.000Z'],
    ['2026-10-31', '2026-11-01', '2026-10-31T14:00:00.000Z', '2026-10-31T15:00:00.000Z', '2026-11-01T15:00:00.000Z'],
  ])('keeps a 10am block at 10am when moving from %s to %s across DST', (from, to, startsAt, endsAt, expectedStart) => {
    expect(moveToDay({startsAt, endsAt}, from, to, 0, 'America/New_York').startsAt).toBe(expectedStart);
  });

  it('excludes grades recorded after a completed round from that round statistics', () => {
    const reviews = [
      {reviewedAt: '2026-11-14T09:00:30.000Z', rating: 3, durationMs: 10_000},
      {reviewedAt: '2026-11-14T09:01:10.000Z', rating: 1, durationMs: 20_000},
    ] as InsightData['reviews'];
    const result = roundSummary(reviews, {startedAt: '2026-11-14T09:00:00.000Z', endedAt: '2026-11-14T09:01:00.000Z', graded: 1});
    expect(result).toMatchObject({cards: 1, seconds: 10, recalledPct: 100, counted: 1, grades: {again: 0, hard: 0, good: 1, easy: 0}});
  });
});
