const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { indexedDB, IDBObjectStore } = require('fake-indexeddb');
const clone = structuredClone;
const context = vm.createContext({ indexedDB, window: {}, clone, setTimeout, clearTimeout, console, toast() {} });
vm.runInContext(fs.readFileSync('src/app/store.js', 'utf8') + '\nglobalThis.store = Store;', context);
const Store = context.store;
(async () => {
  await Store.init({ status() {} });
  assert.equal(Store.mode, 'local');
  const n = { id:'note', front:'original', log:[], cards:{ 1:{ st:0 } }, tags:[], type:'basic' };
  const saving = Store.saveNote(n);
  assert.equal(Store.status().pending, 1);
  await saving;
  await Store.whenSaved();
  assert.equal(Store.status().pending, 0);
  assert.equal((await Store.localLeftovers())[0].front, 'original');

  // Fail after IDB request success but BEFORE transaction completion.
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, ...args) {
    const r = put.call(this, value, ...args);
    if (value?.front === 'abort') r.addEventListener('success', () => this.transaction.abort());
    return r;
  };
  await assert.rejects(Store.saveNote({ ...n, front:'abort' }));
  await assert.rejects(Store.whenSaved());
  assert.equal(Store.status().failed, 1);
  assert.equal((await Store.localLeftovers())[0].front, 'original');
  IDBObjectStore.prototype.put = put;
  await Store.saveNote({ ...n, front:'retry' });
  await Store.whenSaved();
  assert.equal(Store.status().failed, 0);
  await Store.saveProfile({ settings:{ retention:0.92 } });
  await Store.deleteNote('note');
  assert.equal((await Store.localLeftovers()).length, 0);

  // Exercise the actual review Session against the actual durable local Store.
  let current = clone(n);
  const Model = {
    notes: new Map([[n.id,current]]), settings:{ leechThreshold:0, burySiblings:false, refreshPrereqs:false },
    bump() {}, sanitizeNote: n => n,
    saveScheduling: n => Store.saveNote(n),
    ref: (id,ord) => { const note = Model.notes.get(id); return { note,ord,c:note.cards[ord],key:id+':'+ord }; }
  };
  const sessionContext = vm.createContext({ Model, Store, clone, crypto, console });
  vm.runInContext(fs.readFileSync('src/app/session.js','utf8')+'\nglobalThis.ReviewSession = Session;',sessionContext);
  const session = Object.create(sessionContext.ReviewSession.prototype);
  Object.assign(session, { reviewQ:[], newQ:[], extra:[], cramQ:[], history:[], stats:{ count:0,time:0,again:0,newSeen:0,reviews:0,reviewPass:0 }, sinceNew:0, cram:false });
  session.current = { ref:Model.ref(n.id,'1'), kind:'new', previewAt:100,
    preview:{ 3:{ card:{ st:1, reps:1, due:200 } } } };
  await Store.saveNote(current);
  const answer = session.answer(3,500,100);
  assert.equal(session.history.length, 0, 'review not acknowledged before commit');
  await answer;
  assert.equal(session.history.length, 1);
  const stored = (await Store.localLeftovers())[0];
  assert.match(stored.log[0][6], /^[0-9a-f-]{36}$/);
  assert.equal(stored.cards[1].reps,1);
  current.front = 'edited after review';
  current.tags.push('leech');
  await Store.saveNote(current);
  await session.undo();
  const undone = (await Store.localLeftovers())[0];
  assert.equal(undone.front, 'edited after review');
  assert.ok(undone.tags.includes('leech'), 'Undo preserves a tag added manually after the review');
  assert.equal(undone.log.length, 0);
  assert.equal(undone.cards[1].st, 0);
  assert.equal(session.history.length,0);

  // An aborted review must neither advance history nor lose the displayed attempt.
  current = Model.notes.get(n.id);
  current.front = 'abort';
  session.current = { ref:Model.ref(n.id,'1'), kind:'new', previewAt:100, preview:{ 3:{card:{st:1,reps:1}} } };
  IDBObjectStore.prototype.put = function(value,...args) { const r=put.call(this,value,...args); r.addEventListener('success',()=>this.transaction.abort()); return r; };
  await assert.rejects(session.answer(3,500,100));
  assert.equal(session.history.length,0);
  assert.equal(current.log.length,0);
  assert.ok(session.current);
  IDBObjectStore.prototype.put = put;
  sessionContext.crypto = { randomUUID() { throw new Error('UUID unavailable'); } };
  await assert.rejects(session.answer(3,500,100), /UUID unavailable/);
  assert.equal(session.saving, false, 'UUID failure must release the review guard');
  console.log('ok: local transaction completion, aborted save reporting, profiles, deletes, review persistence and durable Undo');
})().catch(error => { console.error(error); process.exitCode=1; });
