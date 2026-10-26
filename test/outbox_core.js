const assert = require('node:assert/strict');
const { Processor } = require('../src/app/outbox_core.js');
function memory() {
  const map = new Map();
  return {
    get: async k => map.get(k),
    list: async () => [...map.values()],
    put: async x => { map.set(x.id, { ...x }); },
    delete: async k => { map.delete(k); }
  };
}
const op = (id, entityId='note-a') => ({ id, requestId: 'uuid-' + id,
  kind: 'note', entityId, enqueuedAt: Number(id) || 0,
  expectedRevision: 0, data: { id: entityId } });
(async () => {
  let s = memory(), done = [];
  let p = new Processor(s, { send: async o => { done.push(o.id); return { revision: 1 }; } });
  await p.enqueue(op('1')); await p.enqueue(op('2'));
  assert.deepEqual(await p.flush(), { sent: 2, remaining: 0 });
  assert.deepEqual(done, ['1', '2']);
  assert.equal((await s.list()).length, 0);

  s = memory(); done = [];
  p = new Processor(s, {
    send: async o => {
      if (o.id === '1') throw new Error('stale_note_revision');
      done.push(o.id);
    }
  });
  await p.enqueue(op('1')); await p.enqueue(op('2'));
  await p.enqueue(op('3','note-b'));
  assert.deepEqual(await p.flush(), { sent: 1, remaining: 2 });
  assert.deepEqual(done, ['3']);
  assert.equal((await s.get('1')).state, 'conflict');
  assert.equal((await s.get('2')).state, 'pending');

  s = memory();
  p = new Processor(s, { send: async () => { throw new Error('offline'); } });
  await p.enqueue(op('5')); await p.flush();
  assert.equal((await p.pending()).length, 1);
  let first = true;
  const seen = [];
  p = new Processor(s, {
    send: async o => {
      seen.push(o.requestId);
      if (first) { first = false; throw new Error('timeout'); }
    }
  });
  await p.flush(); await p.flush();
  assert.deepEqual(seen, ['uuid-5','uuid-5']);
  assert.equal((await p.pending()).length, 0);
  console.log('ok: outbox ordering, conflict isolation, offline durability and retry');
})().catch(e => { console.error(e); process.exitCode = 1; });
