'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { indexedDB, IDBObjectStore } = require('fake-indexeddb');
const FSRS = require('../src/fsrs.js');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const read = name => fs.readFileSync('src/app/' + name + '.js', 'utf8');
const load = (context, name, symbol) => vm.runInContext(read(name) + '\nglobalThis.test' + symbol + ' = ' + symbol + ';', context);
const local = vm.createContext({ indexedDB, window: {}, clone: structuredClone,
  setTimeout, clearTimeout, console, toast() {}, FSRS, Render: { clozeOrds: () => [] } });
load(local, 'store', 'Store');
load(local, 'model', 'Model');
const Store = local.testStore, Model = local.testModel;
(async () => {
  await Store.init({ status() {} });
  const base = Model.sanitizeNote({ id: 'editor', front: 'original', modified: 10,
    cards: { 1: { st: 2, reps: 7 } }, log: [[100, 1, 3]], tags: ['proof'] });
  Model.notes.set(base.id, base);
  await Store.saveNote(base);
  const before = structuredClone(base);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...args) {
    const request = put.call(this, value, ...args);
    if (value.front === 'abort') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  await assert.rejects(Model.commitEditorNote(base, { front: 'abort', type: 'reverse' }, () => true));
  assert.deepEqual(structuredClone(base), before, 'failed edit must preserve content, modified, cards and history');
  assert.equal((await Store.localSnapshot()).notes.get(base.id).front, 'original');
  const newBase = { id: 'new-editor', cards: {}, log: [] };
  await assert.rejects(Model.commitEditorNote(newBase, { front: 'abort' }, () => true));
  assert.equal(Model.notes.has(newBase.id), false, 'failed creation is not projected');
  IDBObjectStore.prototype.put = put;
  const saved = await Model.commitEditorNote(newBase, { front: 'retry' }, () => true);
  assert.equal(saved.id, newBase.id);
  assert.equal((await Store.localSnapshot()).notes.size, 2, 'retry retains the same new-note ID');
  Model.notes.delete(newBase.id); // Simulate a stale in-memory view after a crash.
  await assert.rejects(Model.commitEditorNote(newBase, { front:'must not overwrite' },
    () => true, { createOnly:true }));
  assert.equal((await Store.localSnapshot()).notes.get(newBase.id).front, 'retry',
    'replayed creation cannot overwrite a note already committed in IndexedDB');
  Model.notes.set(newBase.id, saved);
  await Model.commitEditorNote(base, { front: 'committed' }, () => true);
  assert.equal(base.front, 'committed', 'successful edit preserves the existing object reference');
  assert.equal(base.cards[1].reps, 7);
  assert.equal(base.log.length, 1);

  // Real storage commits, but its receipt arrives after auth recovery.
  const originalSave = Store.saveNote;
  const gate = deferred();
  Store.saveNote = async (...args) => { await originalSave(...args); await gate.promise; };
  let current = true;
  const late = Model.commitEditorNote(base, { front: 'account A delayed' }, () => current);
  current = false;
  Model.replaceAll(new Map());
  gate.resolve();
  await late;
  assert.equal(Model.notes.size, 0, 'late receipt cannot repopulate a switched workspace');
  Store.saveNote = originalSave;

  // The legacy host queue must also give the editor a real per-write receipt.
  const writes = [];
  const notes = { onSnapshot(fn) { fn({ docs: [], empty: false, metadata: { fromCache: false } }); },
    doc(id) { return { set(data) { const gate = deferred(); writes.push({ id, data, gate }); return gate.promise; } }; } };
  const profile = { onSnapshot(fn) { fn({ exists: false }); }, collection() { return notes; } };
  const cloud = vm.createContext({ window: { claude: { async use(name) {
    return name === 'user' ? { id: async () => 'legacy' } : { doc: () => profile };
  } } }, clone: structuredClone, console, toast() {}, clearTimeout,
  setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timer.unref(); return timer; } });
  load(cloud, 'store', 'Store');
  const host = cloud.testStore;
  await host.init({ status() {} });
  let acknowledged = false;
  const first = host.saveNote({ id: 'same', front: 'first' }, { durable: true }).then(() => { acknowledged = true; });
  await new Promise(setImmediate);
  assert.equal(acknowledged, false);
  const second = host.saveNote({ id: 'same', front: 'second' }, { durable: true });
  writes[0].gate.resolve();
  await first;
  await new Promise(setImmediate);
  assert.equal(writes[1].data.front, 'second');
  let secondDone = false;
  second.then(() => { secondDone = true; });
  assert.equal(secondDone, false, 'one receipt cannot acknowledge a later queued write');
  writes[1].gate.resolve();
  await second;
  const failed = host.saveNote({ id: 'failure', front: 'too big' }, { durable: true });
  await new Promise(setImmediate);
  const rejected = assert.rejects(failed, error => error.code === 'quota_exceeded');
  writes.at(-1).gate.reject({ code: 'quota_exceeded' });
  await rejected;

  const memory = vm.createContext({ indexedDB: { open() { throw new Error('unavailable'); } },
    window: {}, clone: structuredClone, setTimeout, clearTimeout, console });
  load(memory, 'store', 'Store');
  await memory.testStore.init({ status() {} });
  await assert.rejects(memory.testStore.saveNote({ id: 'unsaved' }, { durable: true }), /Persistent storage/);
  console.log('ok: editor aborted writes, unchanged schedules, retry IDs, stale leases, legacy receipts and unavailable storage');
})().catch(error => { console.error(error); process.exitCode = 1; });
