const assert = require('node:assert/strict');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { AccountStorage, openAccountDB } = require('../src/app/sync_browser');
const { Processor } = require('../src/app/outbox_core');
const user = '00000000-0000-4000-8000-000000000017';
const note = (id, front) => ({id, front, back:'', cards:{}, log:[]});
const snapshot = (revision, data, deleted = false) => ({revision, known:true, data, deleted});
async function device(factory = new IDBFactory()) {
  globalThis.indexedDB = factory;
  const db = await openAccountDB(user);
  return {factory, db, storage:new AccountStorage(db, user)};
}
async function write(db, store, value, key) {
  await new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(value, key);
    t.oncomplete = resolve; t.onabort = () => reject(t.error);
  });
}
const stale = {send:async op => { throw new Error('stale_' + op.kind + '_revision'); }};
(async () => {
  let a = await device();
  const b = await device();
  const original = note('shared', 'base');
  const remoteEdit = note('shared', 'device B');
  for (const d of [a,b]) await d.storage.ingestRemoteNote({id:'shared', data:original, revision:1});
  const local = await a.storage.stageNote(note('shared','device A'));
  const later = await a.storage.stageNote(note('shared','later local edit'));
  const remote = await b.storage.stageNote(remoteEdit);
  await b.storage.ack(remote, {revision:2});
  await new Processor(a.storage, stale).flush();
  assert.equal((await a.storage.get(local.id)).conflict.remote, null, 'stale response alone does not fabricate remote content');
  await a.storage.ingestRemoteNote({id:'shared', data:remoteEdit, revision:2});
  const conflict = await a.storage.get(local.id);
  assert.deepEqual(conflict.conflict, {version:1, base:snapshot(1,original),
    local:{expectedRevision:1, data:local.data, deleted:false}, remote:snapshot(2,remoteEdit)});
  assert.equal(conflict.attempted,true);
  assert.equal(conflict.requestId, local.requestId);
  assert.equal((await a.storage.note('shared')).data.front,'later local edit');
  assert.equal((await a.storage.get(later.id)).state,'pending');
  const savedQueue = await a.storage.list();
  a.db.close(); a = await device(a.factory);
  assert.deepEqual(await a.storage.list(), savedQueue, 'reload retains every queued edit and its conflict evidence');
  await a.storage.ingestRemoteNote({id:'shared', data:original, revision:1});
  assert.deepEqual((await a.storage.get(local.id)).conflict, conflict.conflict, 'late pull cannot regress remote');
  await assert.rejects(a.storage.ingestRemoteNote({id:'shared', data:note('shared','contradiction'), revision:2}), /abort/i);
  assert.deepEqual((await a.storage.get(local.id)).conflict, conflict.conflict);
  const after = await a.storage.stageNote(note('shared','edit after conflict'));
  assert.deepEqual(after.base, snapshot(1,original));
  assert.deepEqual((await a.storage.note('shared')).remote, snapshot(2,remoteEdit));

  // Local projection and conflict remote must update in one transaction.
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, ...args) {
    const req = put.call(this, value, ...args);
    if (this.name === 'outbox' && value.conflict?.remote?.revision === 3) this.transaction.abort();
    return req;
  };
  try { await assert.rejects(a.storage.ingestRemoteNote({id:'shared', data:note('shared','newer'), revision:3}), /abort|transaction failed/i); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual((await a.storage.note('shared')).remote, snapshot(2,remoteEdit));
  assert.deepEqual((await a.storage.get(local.id)).conflict, conflict.conflict);
  await a.storage.ingestRemoteNote({id:'shared', data:note('shared','newer'), revision:3});
  assert.equal((await a.storage.get(local.id)).conflict.remote.revision,3);
  assert.deepEqual((await a.storage.get(local.id)).conflict.base, snapshot(1,original));

  // Both edit/delete directions preserve tombstones and explicit local intent.
  for (const localDelete of [false,true]) {
    const id = 'delete-' + localDelete, base = note(id,'before delete');
    await a.storage.ingestRemoteNote({id, data:base, revision:4});
    const op = await a.storage.stageNote(note(id,'local edit'), undefined, localDelete);
    const inbound = {id, data:localDelete ? note(id,'remote edit') : base, revision:5,
      deleted_at:localDelete ? null : '2026-10-27'};
    await a.storage.ingestRemoteNote(inbound); // Pull before stale response also works.
    assert.equal((await a.storage.get(op.id)).state,'pending');
    await new Processor(a.storage, stale).flush();
    const record = (await a.storage.get(op.id)).conflict;
    assert.deepEqual(record.base, snapshot(4,base));
    assert.equal(record.local.deleted,localDelete);
    assert.equal(record.remote.deleted,!localDelete);
    assert.deepEqual(record.remote.data,inbound.data);
    assert.equal((await a.storage.note(id)).deleted,localDelete,'remote delete does not revive or discard local intent');
  }

  // A delete receipt must retain the server's old content, not its null RPC payload.
  const base = note('ack-delete','retained tombstone');
  await b.storage.ingestRemoteNote({id:base.id,data:base,revision:1});
  const deletion = await b.storage.stageNote(base,undefined,true);
  await b.storage.ack(deletion,{revision:2});
  assert.deepEqual((await b.storage.note(base.id)).base,snapshot(2,base,true));
  await b.storage.ingestRemoteNote({id:base.id,data:base,revision:2,deleted_at:'2026-10-27'});
  assert.equal((await b.storage.note(base.id)).deleted,true);

  // Profile conflicts preserve the same evidence and do not block a note named "profile".
  const p1 = {settings:{retention:0.9}}, p2 = {settings:{retention:0.94}};
  await a.storage.ingestRemoteProfile({user_id:user,data:p1,revision:1});
  const profile = await a.storage.stageProfile({settings:{retention:0.91}});
  const nextProfile = await a.storage.stageProfile({settings:{retention:0.92}});
  await a.storage.stageNote(note('profile','unrelated note'));
  const processor = new Processor(a.storage,{send:async op => {
    if (op.entityId === 'profile' && op.kind === 'note') return {revision:1};
    return stale.send(op);
  }});
  await processor.flush();
  assert.equal((await a.storage.note('profile')).dirty,false);
  await a.storage.ingestRemoteProfile({user_id:user,data:p2,revision:2});
  const pc = (await a.storage.get(profile.id)).conflict;
  assert.deepEqual(pc, {version:1, base:snapshot(1,p1),
    local:{expectedRevision:1,data:profile.data,deleted:false},remote:snapshot(2,p2)});
  assert.equal((await a.storage.profile()).data.settings.retention,0.92);
  assert.equal((await a.storage.get(nextProfile.id)).requestId,nextProfile.requestId);
  await a.storage.ingestRemoteProfile({user_id:user,data:p1,revision:1});
  assert.deepEqual((await a.storage.get(profile.id)).conflict,pc);
  await a.storage.stageProfile({settings:{retention:0.93}});
  assert.deepEqual((await a.storage.profile()).remote,snapshot(2,p2));

  // Acknowledged earlier writes become the next write's base, including profiles.
  const n1 = await b.storage.stageNote(note('rebase','first'));
  const n2 = await b.storage.stageNote(note('rebase','second'));
  await b.storage.ack(n1,{revision:1});
  assert.deepEqual((await b.storage.get(n2.id)).base,snapshot(1,n1.data));
  assert.equal((await b.storage.get(n2.id)).requestId,n2.requestId);
  const bp1 = await b.storage.stageProfile(p1), bp2 = await b.storage.stageProfile(p2);
  await b.storage.ack(bp1,{revision:1});
  assert.deepEqual((await b.storage.get(bp2.id)).base,snapshot(1,p1));
  await new Processor(b.storage,stale).flush();
  assert.deepEqual((await b.storage.get(n2.id)).conflict.base,snapshot(1,n1.data));
  assert.deepEqual((await b.storage.get(bp2.id)).conflict.base,snapshot(1,p1));

  // Legacy dirty data has no historical base: preserve it and say unknown.
  const old = {id:'legacy-op',requestId:'legacy-request',kind:'note',entityId:'legacy',
    data:note('legacy','old local'),expectedRevision:7,state:'conflict',attempts:1,sequence:100,enqueuedAt:1};
  await write(a.db,'notes',{id:'legacy',data:old.data,revision:7,dirty:true});
  await write(a.db,'outbox',old);
  await a.storage.ingestRemoteNote({id:'legacy',data:note('legacy','new remote'),revision:8});
  assert.deepEqual((await a.storage.get(old.id)).conflict.base,{revision:7,known:false});
  assert.deepEqual((await a.storage.get(old.id)).conflict.local.data,old.data);
  assert.deepEqual((await a.storage.stageNote(note('legacy','more local'))).base,{revision:7,known:false});
  const mismatched = await b.storage.stageNote(note('unknown','explicit old base'),6);
  assert.deepEqual(mismatched.base,{revision:6,known:false});

  // Review and Undo snapshots use the same base; immutable ledger entries survive.
  const reviewedBase = note('review','before review');
  await b.storage.ingestRemoteNote({id:'review',data:reviewedBase,revision:2});
  const entry = [100,1,3,0,500,0,crypto.randomUUID()];
  const review = await b.storage.stageReview({...reviewedBase,log:[entry]},entry);
  await b.storage.stageUndo(reviewedBase,entry[6]);
  const reviewOps = (await b.storage.list()).filter(op=>op.entityId==='review' && op.kind==='note');
  assert.equal(reviewOps.length,2);
  for (const op of reviewOps) assert.deepEqual(op.base,snapshot(2,reviewedBase));
  await b.storage.markConflict(review.id,new Error('stale_note_revision'));
  assert.equal((await b.storage.reviews()).length,1);
  assert.equal((await b.storage.retractions()).length,1);

  // A pull after a lost response must not turn an idempotent retry into a conflict.
  const c = await device();
  const sent = await c.storage.stageNote(note('lost','committed'));
  const ids = [], receipts = new Map();
  const network = {send:async op => {
    ids.push(op.requestId);
    if (!receipts.has(op.requestId)) {
      receipts.set(op.requestId,{revision:1}); throw new Error('lost response');
    }
    return receipts.get(op.requestId);
  }};
  await new Processor(c.storage,network).flush();
  await c.storage.ingestRemoteNote({id:'lost',data:sent.data,revision:1});
  assert.equal((await c.storage.get(sent.id)).state,'pending');
  c.db.close(); const reopened = await device(c.factory);
  await new Processor(reopened.storage,network).flush();
  assert.deepEqual(ids,[sent.requestId,sent.requestId]);
  assert.equal(receipts.size,1);
  assert.equal((await reopened.storage.list()).length,0);
  assert.deepEqual((await reopened.storage.note('lost')).base,snapshot(1,sent.data));
  a.db.close(); b.db.close(); reopened.db.close();
  console.log('ok: durable base/local/remote conflicts, offline edits/deletes/profiles, atomic pulls, legacy bases and receipt recovery');
})().catch(error => {console.error(error); process.exitCode = 1;});
