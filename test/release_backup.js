'use strict';
// RELEASE-01 R2: use production IO/Model/Store code with IndexedDB transactions.
// This gate covers the legacy JSON card backup only. Account-scoped knowledge,
// plan versions and learning events require their own explicit export contract.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { indexedDB } = require('fake-indexeddb');
const FSRS = require('../src/fsrs.js');

let serial = 0;
const ctx = vm.createContext({
  indexedDB, window: {}, clone: structuredClone, FSRS, console,
  setTimeout, clearTimeout, toast() {},
  uid: () => 'restore-' + (++serial),
  clampN: (x, a, b) => Math.min(b, Math.max(a, x)),
  Render: { clozeOrds: () => [], setPreamble() {} },
});
for (const [file, name] of [['store','Store'],['model','Model'],['io','IO']]) {
  vm.runInContext(fs.readFileSync('src/app/' + file + '.js', 'utf8') +
    '\nglobalThis.test' + name + '=' + name + ';', ctx);
}
const { testStore: Store, testModel: Model, testIO: IO } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));

(async () => {
  await Store.init({ status() {} });
  assert.equal(Store.status().mode, 'local', 'test must use durable IndexedDB, not memory');
  const fixture = (id, ord, requires = []) => Model.sanitizeNote({
    id, deck: 'Proofs', type: 'basic', title: 'Lemma ' + id,
    front: 'Statement ' + id, back: 'Proof ' + id, tags: ['math'],
    requires, modified: 1700000000000, created: 1699000000000,
    cards: { '1': { st: 2, due: 1700000600000, s: 4.2, d: 5.1, last: 1700000000000,
      step: 0, reps: 3, lapses: 1, susp: false } },
    log: [[1699990000000, ord, 3], [1700000000000, ord, 4]],
    media: {},
  });
  const first = fixture('release-a', '1');
  const second = fixture('release-b', '1', ['release-a']);
  for (const note of [first, second]) await Store.saveNote(note, { durable: true, createOnly: true });
  await Store.saveProfile(Model.profile(), { durable: true });
  Model.replaceAll((await Store.localSnapshot()).notes);

  const originalNotes = plain([...Model.notes.values()]);
  const backupText = IO.exportJSON();
  const parsed = IO.parse(backupText);
  assert.equal(parsed.format, 'backup');
  assert.deepEqual(plain(parsed.notes), originalNotes, 'export and parse must preserve complete notes');
  assert.deepEqual(plain(parsed.backup.profile.settings), plain(Model.profile().settings));

  // Simulate a new/empty local workspace; the exported bytes are retained.
  await Store.clearLocal();
  Model.replaceAll(new Map());
  Model.loadProfile({ settings: { retention: 0.82 } }); // new workspace differs from the exported profile
  assert.equal((await Store.localSnapshot()).notes.size, 0);
  const job = IO.prepare(parsed, { restoreSettings: true });
  assert.equal(job.items.length, 2, 'both cards need restoration');
  const checkpoints = [];
  const outcome = await IO.commit(parsed, { job, checkpoint: j => checkpoints.push(plain(j)) });
  assert.equal(outcome.added, 2);
  assert.equal(checkpoints.at(-1).items.every(x => x.done), true, 'durable receipts acknowledged');
  const restored = await Store.localSnapshot();
  assert.equal(restored.notes.size, 2);
  assert.deepEqual(plain([...restored.notes.values()]), originalNotes,
    'full schedules, logs, tags and prerequisites survive durable restore');
  assert.deepEqual(plain(restored.profile.settings), plain(parsed.backup.profile.settings));
  assert.equal(restored.notes.get('release-b').requires[0], 'release-a');
  for (const note of restored.notes.values()) {
    assert.equal(note.log.length, 2);
    assert.equal(note.cards['1'].reps, 3);
  }

  // A second import of the identical backup may not duplicate evidence.
  Model.replaceAll(restored.notes);
  const repeated = IO.prepare(parsed, { restoreSettings: true });
  assert.equal(repeated.items.length, 0);
  assert.equal(repeated.skipped, 2);
  await IO.commit(parsed, { job: repeated });
  assert.deepEqual(plain([...(await Store.localSnapshot()).notes.values()]), originalNotes);

  // A newer review after restore must never be overwritten by an older backup.
  const reviewed = structuredClone(restored.notes.get('release-a'));
  reviewed.cards['1'].reps = 4;
  reviewed.log.push([1700000300000, '1', 3]);
  await Store.saveNote(reviewed, { durable: true });
  Model.replaceAll((await Store.localSnapshot()).notes);
  const stale = IO.prepare(parsed);
  assert.equal(stale.items.length, 0);
  assert.equal(stale.skipped, 2);
  assert.equal((await Store.readNote('release-a')).log.length, 3);
  assert.equal((await Store.readNote('release-a')).cards['1'].reps, 4);
  console.log('ok: RELEASE-01 durable legacy backup/restore, complete schedules/reviews, replay-safe re-import');
})().catch(err => { console.error(err); process.exitCode = 1; });
