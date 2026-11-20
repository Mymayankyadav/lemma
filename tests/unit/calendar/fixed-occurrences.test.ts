import {describe, expect, it} from 'vitest';
import {
  normalizeFixedOccurrences, type FixedRevision, type WeeklyFixedSeries,
} from '../../../src/lib/calendar/fixedOccurrences';

const base = {
  seriesId: 'class', zone: 'America/New_York', firstDate: '2026-10-25', lastDate: '2026-11-08',
  weekdays: [0], start: {time: '22:00'}, end: {time: '00:30'},
} satisfies WeeklyFixedSeries;
const identity = {seriesId: base.seriesId, zone: base.zone, originalDate: '2026-11-01'};
const moved = {
  ...identity, kind: 'move', revision: 1,
  start: {date: '2026-11-02', time: '22:00'}, end: {date: '2026-11-03', time: '00:30'},
} satisfies FixedRevision;
const cancelled = {...identity, kind: 'cancel', revision: 2} satisfies FixedRevision;

describe('fixed weekly occurrences', () => {
  it('expands overnight without assuming every week shares the same UTC offset', () => {
    const result = normalizeFixedOccurrences([base], []);
    if (result.status !== 'ok') throw Error(result.reason);
    expect(result.occurrences.map(({originalDate, startsAt, endsAt}) => [originalDate, startsAt, endsAt])).toEqual([
      ['2026-10-25', '2026-10-26T02:00:00.000Z', '2026-10-26T04:30:00.000Z'],
      ['2026-11-01', '2026-11-02T03:00:00.000Z', '2026-11-02T05:30:00.000Z'],
      ['2026-11-08', '2026-11-09T03:00:00.000Z', '2026-11-09T05:30:00.000Z'],
    ]);
  });

  it('preserves the original identity across moves, with cancellation and duplicates ordered by revision', () => {
    const otherZone = {...base, zone: 'America/Chicago'};
    const result = normalizeFixedOccurrences([base, otherZone], [moved, {...moved}]);
    if (result.status !== 'ok') throw Error(result.reason);
    expect(result.occurrences.find(row => row.zone === base.zone && row.originalDate === identity.originalDate)).toEqual({
      ...identity, revision: 1, startsAt: '2026-11-03T03:00:00.000Z', endsAt: '2026-11-03T05:30:00.000Z',
    });
    const conflict = {...cancelled, revision: 1};
    const latest = normalizeFixedOccurrences([base, otherZone], [moved, conflict, cancelled]);
    expect(latest).toEqual(normalizeFixedOccurrences([otherZone, base], [cancelled, conflict, moved]));
    if (latest.status !== 'ok') throw Error(latest.reason);
    expect(latest.occurrences.filter(row => row.originalDate === identity.originalDate).map(row => row.zone)).toEqual([
      otherZone.zone,
    ]);
    expect(normalizeFixedOccurrences([base], [moved, conflict])).toEqual({
      status: 'blocked', reason: 'revision-conflict', key: JSON.stringify([base.seriesId, base.zone, identity.originalDate]),
    });
  });

  it('requires an explicit choice at a fall fold and chooses the requested instant', () => {
    const fold = {...base, start: {time: '01:30'}, end: {time: '02:30'}};
    const blocked = normalizeFixedOccurrences([fold], []);
    expect(blocked.status === 'blocked' && blocked.reason).toEqual('ambiguous-time');
    const a = normalizeFixedOccurrences([{...fold, start: {...fold.start, fold: 0}}], []);
    const b = normalizeFixedOccurrences([{...fold, start: {...fold.start, fold: 1}}], []);
    if (a.status !== 'ok' || b.status !== 'ok') throw Error('invalid fold');
    expect(a.occurrences.map(x => x.startsAt)).toEqual([
      '2026-10-25T05:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-08T06:30:00.000Z',
    ]);
    expect(b.occurrences.map(x => x.startsAt)).toEqual([
      '2026-10-25T05:30:00.000Z', '2026-11-01T06:30:00.000Z', '2026-11-08T06:30:00.000Z',
    ]);
  });

  it('blocks a spring gap unless the latest revision supplies valid replacement times or cancels it', () => {
    const originalDate = '2026-03-08';
    const gap = {...base, firstDate: originalDate, lastDate: originalDate,
      start: {time: '02:30'}, end: {time: '03:45'}};
    const blocked = normalizeFixedOccurrences([gap], []);
    expect(blocked.status === 'blocked' && blocked.reason).toEqual('nonexistent-time');
    const replacement = {...moved, originalDate,
      start: {date: originalDate, time: '03:15'}, end: {date: originalDate, time: '03:45'}};
    expect(normalizeFixedOccurrences([gap], [replacement])).toEqual({
      status: 'ok', occurrences: [{...identity, originalDate, revision: 1,
        startsAt: '2026-03-08T07:15:00.000Z', endsAt: '2026-03-08T07:45:00.000Z'}],
    });
    expect(normalizeFixedOccurrences([gap], [{...cancelled, originalDate}])).toEqual({
      status: 'ok', occurrences: [],
    });
  });

  it('fails closed for invalid zones, civil dates, intervals, and revisions outside the loaded scope', () => {
    expect(normalizeFixedOccurrences([{...base, zone: 'Not/AZone'}], [])).toEqual({
      status: 'blocked', reason: 'invalid-input',
    });
    const badDate = normalizeFixedOccurrences([{...base, firstDate: '2026-02-30'}], []);
    expect(badDate.status === 'blocked' && badDate.reason).toEqual('invalid-input');
    const backwards = normalizeFixedOccurrences([base], [{...moved, end: {...moved.start, time: '21:00'}}]);
    expect(backwards.status === 'blocked' && backwards.reason).toEqual('invalid-interval');
    const unlinked = normalizeFixedOccurrences([base], [{...moved, zone: 'America/Chicago'}]);
    expect(unlinked.status === 'blocked' && unlinked.reason).toEqual('missing-original');
  });
});
