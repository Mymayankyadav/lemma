'use strict';
const assert = require('node:assert/strict');
const FSRS = require('../src/fsrs.js');
const { inspect, project } = require('../src/app/review_replay.js');

const noteId = 'note-1';
const dayMs = 86400000;
const newCard = () => ({
  st: 0, due: 0, s: 0, d: 0, last: 0, step: 0, reps: 0, lapses: 0
});
const provenance = (day, cardBefore = newCard()) => ({
  version: 1, algorithm: 'fsrs-6', weights: FSRS.DEFAULT_W.slice(),
  day_index: day, rollover_hour: 4, timezone_offset_minutes: -330,
  retention: 0.9, max_interval_days: 36500,
  learn_steps: '1m 10m', relearn_steps: '10m',
  fuzz: true, load_balance: false,
  preview_at_ms: day * dayMs + 12 * 3600000, card_before: cardBefore
});
const event = (id, day, overrides = {}) => ({
  event_id: id, note_id: noteId, ordinal: 1, kind: 0,
  grade: 3, occurred_at_ms: day * dayMs + 12 * 3600000,
  scheduling_provenance: provenance(day),
  ...overrides
});
const log = events => events.map(e => [
  e.occurred_at_ms, e.ordinal, e.grade, 0, 500, e.kind, e.event_id
]);
const row = (events, card = { st: 1, reps: 2 }) => ({
  id: noteId, data: { cards: { '1': card }, log: log(events) }
});
const undo = (id, target, reason = 'undo') => ({
  retraction_id: id, target_event_id: target, reason
});
const a = event('a', 20000);
const b = event('b', 20001);
const reviews = [a, b];
const snapshot = row(reviews);

assert.equal(inspect(null, [], []).code, 'missing_note');
assert.equal(inspect({ id: noteId, deleted: true, data: snapshot.data }, reviews, []).code, 'missing_note');

const legacy = structuredClone(snapshot);
delete legacy.data.log[0][6];
assert.equal(inspect(legacy, reviews, []).code, 'legacy_history');
assert.equal(inspect(snapshot, reviews, [undo('u', 'not-fetched')]).code, 'incomplete_ledger');

const nonNew = event('a', 20000, {
  scheduling_provenance: provenance(20000, { ...newCard(), st: 2, reps: 1 })
});
assert.equal(inspect(row([nonNew, b]), [nonNew, b], []).code, 'legacy_baseline_required');
assert.equal(inspect(snapshot, reviews, [undo('u', 'a', 'reset')]).code, 'reset_policy_required');

const forward = inspect(snapshot, reviews, []);
const reverse = inspect(snapshot, [...reviews].reverse(), []);
assert.equal(forward.status, 'memory-only');
assert.equal(forward.scheduleReady, false);
assert.equal(forward.scheduledReviews, 2);
assert.equal(forward.activeReviews, 2);
assert.equal(forward.ordinals['1'].trace.length, 2);
assert.deepEqual(reverse, forward, 'history input order must not affect the diagnostic');

const undone = inspect(snapshot, reviews, [undo('u', 'b')]);
assert.equal(undone.status, 'memory-only');
assert.equal(undone.activeReviews, 1);
assert.equal(undone.ordinals['1'].activeReviews, 1);
assert.equal(undone.ordinals['1'].totalReviews, 2);
assert.deepEqual(undone.ordinals['1'].trace.map(t => t.eventId), ['a']);

console.log('ok: read-only FSRS replay diagnostics fail closed and ignore undone reviews');

// Schedule projection is independent of ledger arrival order and host timezone.
const projection = project(snapshot, reviews, []);
assert.equal(projection.status, 'projected');
assert.deepEqual(projection.eventIds, ['a', 'b']);
assert.deepEqual(project(snapshot, [...reviews].reverse(), []), projection);
assert.deepEqual(Object.keys(projection.cards['1']).sort(),
  ['st','due','s','d','last','step','reps','lapses'].sort());
assert.equal(projection.cards['1'].reps, 2);

const sameTime = event('A', 20000);
const sameTime2 = event('z', 20000, {grade: 1});
const equalTimeSnapshot = row([sameTime, sameTime2]);
const tie = project(equalTimeSnapshot, [sameTime2, sameTime], []);
assert.deepEqual(tie.eventIds, ['A', 'z']);
assert.deepEqual(project(equalTimeSnapshot, [sameTime, sameTime2], []), tie);

const c = event('c', 20002);
const three = [a,b,c];
const threeSnapshot = row(three, {st: 2, reps: 3});
const middleRetracted = project(threeSnapshot, three, [undo('middle','b')]);
const withoutMiddle = project(row([a,c]), [a,c], []);
assert.equal(middleRetracted.status, 'projected');
assert.deepEqual(middleRetracted.cards, withoutMiddle.cards);
assert.deepEqual(middleRetracted.eventIds, ['a','c']);

const adjusted = event('b', 20001, {
  scheduling_provenance: {
    ...provenance(20001),
    weights: FSRS.DEFAULT_W.map((w,i) => i === 0 ? w + 0.01 : w)
  }
});
const change = project(row([a,adjusted]), [adjusted,a], []);
assert.equal(change.status, 'projected');
assert.equal(change.cards['1'].reps, 2);

const rolloverOffset = -330 * 60000 + 4 * 3600000;
const edge = 20000 * dayMs + rolloverOffset;
const justBefore = event('before', 19999, { occurred_at_ms: edge - 1000,
  scheduling_provenance: {...provenance(19999),preview_at_ms:edge - 1000} });
const justAfter = event('after', 20000, { occurred_at_ms: edge + 1000,
  scheduling_provenance: {...provenance(20000),preview_at_ms:edge + 1000} });
assert.equal(project(row([justBefore,justAfter]), [justAfter,justBefore], []).status, 'projected');
const wrongDay = {...justAfter, scheduling_provenance: {
  ...justAfter.scheduling_provenance, day_index:19999
}};
assert.equal(project(row([justBefore,wrongDay]), [justBefore,wrongDay], []).code, 'clock_mismatch');
const missingFuzz = {...b, scheduling_provenance:{...b.scheduling_provenance}};
delete missingFuzz.scheduling_provenance.fuzz;
assert.equal(project(row([a,missingFuzz]), [a,missingFuzz], []).code, 'replay_unsupported');

console.log('ok: deterministic FSRS schedule projection, Undo, parameter and clock gates');

