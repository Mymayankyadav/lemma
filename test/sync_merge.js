const assert = require('node:assert/strict');
const { mergeNotes } = require('../src/app/sync_merge.js');
function note(overrides = {}) {
  return { id: 'n1', created: 10, modified: 20, deck: 'Algebra', title: 'Groups',
    front: 'State Lagrange', back: '', cards: { 1: { st: 0, last: 0 } }, log: [], ...overrides };
}
let a = note({ modified: 10, title: 'Before', cards: { 1: { st: 2, last: 100, reps: 1 } }, log: [[100, 1, 3, 0, 4000, 0]] });
let b = note({ modified: 20, title: 'After', cards: { 1: { st: 2, last: 200, reps: 2 } }, log: [[100, 1, 3, 0, 4000, 0], [200, 1, 4, 2, 3000, 0]] });
let merged = mergeNotes(a, b);
assert.equal(merged.title, 'After');
assert.equal(merged.log.length, 2);
assert.equal(merged.cards[1].reps, 2);
assert.deepEqual(merged, mergeNotes(b, a));
let c = note({ modified: 30, front: 'Improved text', cards: { 1: { st: 2, last: 50, reps: 9 } }, log: [] });
merged = mergeNotes(b, c);
assert.equal(merged.front, 'Improved text');
assert.equal(merged.cards[1].last, 200);
assert.equal(merged.log.length, 2);
assert.throws(() => mergeNotes(a, note({ id: 'other' })));
assert.deepEqual(mergeNotes(null, a), a);
console.log('ok: note merge handles reviews, editing, duplicates, and mismatched IDs');

// Exact timestamp ties still merge commutatively in either direction.
const d = note({ modified: 20, title: 'A' });
const e = note({ modified: 20, title: 'Z' });
assert.deepEqual(mergeNotes(d, e), mergeNotes(e, d));
