import {describe, expect, it} from 'vitest';
import {deduplicateEvidence, replayEvidence, type EvidenceEvent} from '../../../src/lib/evidence/replay';

const at = (day: number) => `2026-11-${String(day).padStart(2, '0')}T09:00:00Z`;
const owner = 'owner-1';
const first = {
  kind: 'record', eventId: 'event-1', lineageId: 'assessment-1', revision: 1,
  ownerId: owner, source: 'sessions',
  occurredAt: at(17), reportedAt: at(18), knownAt: at(19),
  payload: {score: 0, cue: {observed: ['definition'], level: 1}},
} satisfies EvidenceEvent;

describe('candidate evidence replay', () => {
  it('separates occurrence, reporting and precise server visibility; cutoff is inclusive', () => {
    const late = {...first, knownAt: '2026-11-19T14:30:00.000001+05:30'};
    expect(replayEvidence(owner, [late], at(18)).active).toEqual([]);
    expect(replayEvidence(owner, [late], at(19)).active).toEqual([]);
    expect(replayEvidence(owner, [late], '2026-11-19T09:00:00.000001Z').active).toEqual([late]);
    const cutoff = at(19);
    const futureOccurrence = {...first, occurredAt: at(20)};
    const futureReport = {...first, reportedAt: at(20)};
    expect(replayEvidence(owner, [futureOccurrence], cutoff).active).toEqual([]);
    expect(replayEvidence(owner, [futureReport], cutoff).active).toEqual([]);
  });

  it('deduplicates equal JSON without depending on key order and rejects changed same-ID payloads', () => {
    const exact = {...first, payload: {cue: {level: 1, observed: ['definition']}, score: 0}};
    const changed = {...first, payload: {...first.payload, score: 1}};
    expect(deduplicateEvidence(owner, [first, exact, first])).toEqual([first]);
    expect(replayEvidence(owner, [exact, first], at(19)).active).toEqual([first]);
    expect(() => deduplicateEvidence(owner, [first, changed])).toThrow('event-id-conflict');
    expect(() => replayEvidence(owner, [changed, first], at(19))).toThrow('event-id-conflict');
    const laterConflict = {...changed, knownAt: at(20)};
    expect(replayEvidence(owner, [laterConflict, first], at(19)).active).toEqual([first]);
    expect(() => replayEvidence(owner, [first, laterConflict], at(20))).toThrow('event-id-conflict');
  });

  it('selects the latest visible revision, even when delivered out of order; voids retain history', () => {
    const corrected = {...first, eventId: 'event-2', revision: 2, knownAt: at(20)};
    const voided: EvidenceEvent = {
      kind: 'void', ownerId: owner, source: first.source, lineageId: first.lineageId,
      occurredAt: first.occurredAt, reportedAt: first.reportedAt,
      eventId: 'event-3', revision: 3, knownAt: at(22),
    };
    const stale = {...first, eventId: 'event-0', lineageId: 'assessment-2', knownAt: at(23)};
    const newest = {...stale, eventId: 'event-4', revision: 2, knownAt: at(20)};
    const events = [stale, voided, corrected, first, newest];
    expect(replayEvidence(owner, events, at(19)).active).toEqual([first]);
    expect(replayEvidence(owner, events, at(21))).toEqual({
      history: [first, corrected, newest], active: [corrected, newest],
    });
    expect(replayEvidence(owner, events, at(23))).toEqual({
      history: [first, corrected, newest, voided, stale], active: [newest],
    });
    expect(replayEvidence(owner, [...events].reverse(), at(23))).toEqual(replayEvidence(owner, events, at(23)));
    expect(() => deduplicateEvidence(owner, [first, {...first, eventId: 'same-revision'}])).toThrow(
      'revision-conflict',
    );
    const otherSource = {...first, eventId: 'other-source', source: 'reviews'};
    expect(replayEvidence(owner, [first, otherSource], at(19)).active).toEqual([first, otherSource]);
  });

  it('rejects foreign input and invalid clocks or revisions', () => {
    const foreign = {...first, ownerId: 'owner-2', knownAt: at(20)};
    expect(() => replayEvidence(owner, [foreign, first], at(19))).toThrow('owner-mismatch');
    expect(() => deduplicateEvidence(owner, [foreign])).toThrow('owner-mismatch');
    expect(() => deduplicateEvidence(owner, [{...first, revision: 0}])).toThrow('invalid-identity');
    expect(() => replayEvidence(owner, [first], '2026-11-19T09:00:00')).toThrow('invalid-clock');
    expect(() => replayEvidence(owner, [{...first, occurredAt: '2026-02-30T09:00:00Z'}], at(19))).toThrow(
      'invalid-clock',
    );
  });
});
