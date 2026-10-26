const assert = require('node:assert/strict');
const { Processor } = require('../src/app/outbox_core.js');
function memory() {
  const map = new Map();
  return { get: async k => map.get(k), list: async () => [...map.values()],
    put: async x => { map.set(x.id, { ...x }); }, delete: async k => { map.delete(k); } };
}
const op = (id, entityId = 'note-a') => ({ id, requestId: 'uuid-' + id, kind: 'note', entityId,
  enqueuedAt: Number(id.replace(/\D/g, '')) || 0, expectedRevision: 0, data: { id: entityId } });
(async () => {
  let s = memory(), done = [], p = new Processor(s, { send: async o => { done.push(o.id); return { rev: 1 }; } });
  await p.enqueue(op('1')); await p.enqueue(op('2'));
  assert.deepEqual(await p.flush(), { sent: 2, remaining: 0 });
  assert.deepEqual(done, ['1','2']);
  assert.equal((await s.list()).length, 0);
  s = memory(); done = []; let calls = 0;
  p = new Processor(s, { send: async o => { if (o.id === '1') throw new Error('stale_note_revision'); done.push(o.id); } });
  await p.enqueue(op('1')); await p.enqueue(op('2')); await p.enqueue(op('3','note-b'));
  assert.deepEqual(await p.flush(), { sent: 1, remaining: 2 });
  assert.deepEqual(done, ['3'], 'conflict blocks only operations on the same note');
  assert.equal((await s.get('1')).state, 'conflict');
  assert.equal((await s.get('2')).state, 'pending');
  s = memory(); calls = 0;
  p = new Processor(s, { send: async () => { calls++; throw new Error('offline'); } });
  await p.enqueue(op('5')); await p.flush();
  assert.equal(calls, 1); assert.equal((await p.pending()).length, 1);
  let first = true; const seen = [];
  p = new Processor(s, { send: async o => { seen.push(o.requestId); if (first) { first=false; throw new Error('timeout'); } } });
  await p.flush(); await p.flush();
  assert.deepEqual(seen, ['uuid-5','uuid-5'], 'retry must reuse idempotency key');
  assert.equal((await p.pending()).length, 0);
  // A real adapter atomically rebases a later local write on the acknowledged revision.
  s = memory();
  s.ack = async (operation, result) => {
    await s.delete(operation.id);
    const next = (await s.list()).find(x => x.kind === 'note' && x.entityId === operation.entityId);
    if (next) await s.put({ ...next, expectedRevision: result.revision });
  };
  const serverExpected = [];
  p = new Processor(s, { send: async o => {
    serverExpected.push(o.expectedRevision);
    if (o.expectedRevision !== serverExpected.length-1) throw new Error('stale_note_revision');
    return { revision: serverExpected.length };
  }});
  await p.enqueue(op('1')); await p.enqueue(op('2')); await p.enqueue(op('3'));
  assert.deepEqual(await p.flush(), { sent: 3, remaining: 0 });
  assert.deepEqual(serverExpected, [0,1,2], 'sequential offline edits rebase safely');
  console.log('ok: outbox ordering, conflict isolation, offline durability, idempotent retry, sequential rebase');
})().catch(err => { console.error(err); process.exitCode = 1; });
