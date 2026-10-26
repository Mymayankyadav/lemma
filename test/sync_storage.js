const assert = require('node:assert/strict');
require('fake-indexeddb/auto');
const { AccountStorage, openAccountDB, SupabaseTransport, pullAll } = require('../src/app/sync_browser');
const { Processor } = require('../src/app/outbox_core');
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const note = (front = 'first') => ({ id: 'n', front, back: '', log: [], cards: {} });
const clear = async db => new Promise((resolve, reject) => {
  const t = db.transaction(['notes','reviews','retractions','outbox','meta'], 'readwrite');
  for (const name of ['notes','reviews','retractions','outbox','meta']) t.objectStore(name).clear();
  t.oncomplete = resolve; t.onerror = () => reject(t.error);
});
(async () => {
  const db = await openAccountDB(userA);
  const storage = new AccountStorage(db, userA);
  // Independent adapters/connections emulate two tabs writing one account cache.
  const db2 = await openAccountDB(userA);
  const tab2 = new AccountStorage(db2, userA);
  const realNow = Date.now;
  Date.now = () => 7;
  await Promise.all([storage.stageNote(note('one')), tab2.stageNote(note('two')), storage.stageNote(note('three'))]);
  Date.now = () => 1;
  await storage.stageNote(note('four'));
  Date.now = realNow;
  const ordered = (await storage.list()).sort((a,b) => a.sequence-b.sequence);
  assert.deepEqual(ordered.map(o => o.data.front), ['one','two','three','four']);
  assert.deepEqual(ordered.map(o => o.sequence), [1,2,3,4]);
  const sent = [];
  let revision = 0;
  const processor = new Processor(storage, { send: async op => {
    assert.equal(op.expectedRevision, revision);
    sent.push(op.data.front);
    return { revision: ++revision };
  }});
  assert.equal((await processor.flush()).remaining, 0);
  assert.deepEqual(sent, ['one','two','three','four']);
  assert.equal((await storage.notes())[0].dirty, false);
  await storage.stageNote(note('fifth'));
  assert.equal((await storage.list())[0].expectedRevision, 4, 'derive base revision from committed metadata');
  await clear(db);

  // Crash replay of a create must not overwrite reviewed data or enqueue a
  // second operation, even when the in-memory Model did not see the first.
  const created = { ...note('saved'), log: [[100,1,3]], cards:{1:{reps:7}} };
  await storage.stageNote(created, undefined, false, null, true);
  const countBeforeReplay = (await storage.list()).length;
  await assert.rejects(storage.stageNote(note('replayed'), undefined, false, null, true));
  assert.equal((await storage.notes())[0].data.cards[1].reps, 7);
  assert.equal((await storage.list()).length, countBeforeReplay);
  await clear(db);

  // Duplicate event insertion must abort snapshot + both queue entries + sequence.
  const entry = [100,1,3,0,2000,0,crypto.randomUUID(),
    { version:1,algorithm:'fsrs-6',day_index:20000,
      weights:require('../src/fsrs.js').DEFAULT_W.slice() }];
  const reviewed = { ...note('reviewed'), log: [entry] };
  await storage.stageReview(reviewed, entry);
  assert.equal((await storage.list()).length, 2);
  assert.equal((await storage.reviews()).length, 1);
  assert.equal((await storage.reviews())[0].scheduling_provenance.day_index,20000);
  assert.equal((await storage.list()).find(x => x.kind === 'review').data.scheduling_provenance.weights.length,21);
  const undo = await storage.stageRetraction(entry[6]);
  assert.equal(undo.kind, 'retraction');
  assert.equal((await storage.retractions()).length, 1);
  assert.equal((await storage.list()).length, 3);
  await assert.rejects(storage.stageRetraction(entry[6]));
  await storage.ack(undo, { retractionId: undo.data.retraction_id });
  assert.equal((await storage.retractions()).length, 1, 'accepted undo stays in ledger');
  assert.equal((await storage.reviews()).length, 1, 'original remains immutable');
  await assert.rejects(storage.stageReview({ ...reviewed, front: 'must roll back' }, entry));
  assert.equal((await storage.notes())[0].data.front, 'reviewed');
  assert.equal((await storage.list()).length, 2);
  await assert.rejects(storage.stageReview('n', entry), /snapshot/);
  assert.equal((await storage.notes())[0].dirty, true);
  await storage.ingestRemoteNote({ id:'n', data: note('remote'), revision:99 });
  assert.equal((await storage.notes())[0].data.front, 'reviewed', 'dirty snapshot survives remote pull');
  await clear(db);

  // Snapshot acknowledgements must not remain dirty while the review event is queued.
  const independentEvent = [150,1,3,0,500,0,crypto.randomUUID()];
  await storage.stageReview({ ...note('acknowledged'), log:[independentEvent] }, independentEvent);
  const staged = (await storage.list()).sort((a,b)=>a.sequence-b.sequence);
  assert.deepEqual(staged.map(x=>x.kind), ['note','review']);
  await storage.ack(staged[0], { revision:1 });
  assert.equal((await storage.notes())[0].dirty, false);
  assert.equal((await storage.list()).length,1);
  assert.equal((await storage.list())[0].kind,'review');
  await storage.ack(staged[1], { eventId: independentEvent[6] });
  assert.equal((await storage.notes())[0].dirty, false);
  await clear(db);

  // An Undo must atomically preserve the original review, restore the note,
  // and enqueue the retraction AFTER the review and restored snapshot.
  const restoredEvent = [200,1,4,0,1000,0,crypto.randomUUID()];
  await storage.stageReview({ ...note('answered'), log:[restoredEvent] }, restoredEvent);
  const oldSequence = (await storage.list()).map(x => x.sequence);
  await assert.rejects(storage.stageUndo({ ...note('wrong'), id:'other' }, restoredEvent[6]));
  assert.deepEqual((await storage.list()).map(x => x.sequence), oldSequence);
  await storage.stageUndo(note('restored'), restoredEvent[6]);
  const undoQueue = (await storage.list()).sort((a,b)=>a.sequence-b.sequence);
  assert.deepEqual(undoQueue.map(x=>x.kind), ['note','review','note','retraction']);
  assert.equal(undoQueue[2].data.front, 'restored');
  assert.equal(undoQueue[3].data.target_event_id, restoredEvent[6]);
  assert.equal((await storage.notes())[0].data.front, 'restored');
  assert.equal((await storage.reviews()).length, 1);
  assert.equal((await storage.retractions()).length, 1);
  await assert.rejects(storage.stageUndo(note('again'), restoredEvent[6]));
  assert.equal((await storage.notes())[0].data.front, 'restored');
  assert.equal((await storage.list()).length, 4);
  await clear(db);

  // Immutable inbound events may contain JSONB keys in another order,
  // but an event ID must never be overwritten with contradictory history.
  const remoteReview = { event_id:crypto.randomUUID(), note_id:'n',
    ordinal:1, occurred_at_ms:345, grade:3, state_before:0,
    duration_ms:300, kind:0, scheduling_provenance:{version:1,weights:[1,2]} };
  await storage.ingestReview(remoteReview);
  await storage.ingestReview({ ...remoteReview,
    scheduling_provenance:{weights:[1,2],version:1} });
  await assert.rejects(storage.ingestReview({...remoteReview,grade:1}));
  assert.equal((await storage.reviews())[0].grade,3);
  const remoteUndo = { retraction_id:crypto.randomUUID(), target_event_id:remoteReview.event_id, reason:'undo' };
  await storage.ingestRetraction(remoteUndo);
  await assert.rejects(storage.ingestRetraction({...remoteUndo,reason:'correction'}));
  assert.equal((await storage.retractions())[0].reason,'undo');
  await clear(db);

  await storage.ingestRemoteNote({ id:'n', data:note('new'), revision:5 });
  await storage.ingestRemoteNote({ id:'n', data:note('old'), revision:3 });
  assert.equal((await storage.notes())[0].data.front, 'new', 'late pull must not regress revision');
  await storage.stageNote(note(), undefined, true);
  const deletion = (await storage.list())[0];
  assert.equal(deletion.expectedRevision, 5);
  await storage.ack(deletion, { revision:6 });
  assert.equal((await storage.notes())[0].deleted, true);
  assert.equal((await storage.notes())[0].dirty, false);
  await clear(db);

  // Read-only workspace comparison distinguishes absence, tombstones, divergent
  // review snapshots and account-only cards without modifying either source.
  await storage.ingestRemoteNote({
    id:'same', data:{...note('same'),id:'same'},revision:1 });
  await storage.ingestRemoteNote({
    id:'diff', data:{...note('cloud'),id:'diff',log:[[10,1,3,0,100,0]]},revision:1 });
  await storage.ingestRemoteNote({
    id:'deleted',data:null,deleted_at:'2026-10-26',revision:2 });
  await storage.ingestRemoteNote({
    id:'account-only',data:{...note('account'),id:'account-only'},revision:1 });
  const beforeCompare = await storage.notes();
  const report = await storage.inspectAgainst([
    { ...note('same'),id:'same' },
    { ...note('anonymous'),id:'diff' },
    { ...note('local'),id:'local-only' },
    { ...note('resurrect'),id:'deleted' }
  ]);
  assert.deepEqual(report,{
    localOnly:1,accountOnly:1,identical:1,divergent:1,
    cloudTombstone:1,dirtyAccount:0,legacyHistory:1
  });
  assert.deepEqual(await storage.notes(),beforeCompare,'comparison must never mutate the account');
  const p1 = { user_id:userA,data:{settings:{retention:0.90}},
    revision:1,updated_at:'2026-10-26T00:00:00Z' };
  const p2 = { ...p1,data:{settings:{retention:0.92}},revision:2 };
  await storage.ingestRemoteProfile(p1);
  assert.equal((await storage.profile()).data.settings.retention,0.90);
  await storage.ingestRemoteProfile(p2);
  await storage.ingestRemoteProfile(p1);
  assert.equal((await storage.profile()).revision,2,'late profile pull cannot regress');
  await assert.rejects(storage.ingestRemoteProfile({
    ...p2, data:{settings:{retention:0.80}} }), /abort/i);
  await assert.rejects(storage.ingestRemoteProfile({...p2,user_id:userB}),/Invalid account profile/);
  assert.equal((await storage.profile()).data.settings.retention,0.92);
  await storage.ingestRemoteProfile(null);
  assert.equal(await storage.profile(),undefined,'deleted account profile must not linger');
  const firstProfile = await storage.stageProfile({settings:{retention:0.91}});
  const nextProfile = await storage.stageProfile({settings:{retention:0.95}});
  assert.equal((await storage.profile()).dirty,true);
  assert.equal(firstProfile.expectedRevision,0);
  await storage.ack(firstProfile,{revision:1});
  assert.equal((await storage.get(nextProfile.id)).expectedRevision,1);
  assert.equal((await storage.profile()).dirty,true);
  await storage.ack(await storage.get(nextProfile.id),{revision:2});
  assert.equal((await storage.profile()).dirty,false);
  assert.equal((await storage.profile()).revision,2);

  await clear(db);

  // Failure AFTER server commit: persisted attempted marker and request ID survive reopen.
  const operation = await storage.stageNote(note('retry'));
  const committed = new Map();
  let fail = true;
  const network = { send: async op => {
    if (!committed.has(op.requestId)) committed.set(op.requestId, { revision:1 });
    if (fail) { fail = false; throw new Error('response lost'); }
    return committed.get(op.requestId);
  }};
  await new Processor(storage, network).flush();
  assert.equal((await storage.get(operation.id)).attempted, true);
  db.close(); db2.close();
  const reopened = await openAccountDB(userA);
  const recovered = new AccountStorage(reopened, userA);
  await new Processor(recovered, network).flush();
  assert.equal(committed.size, 1);
  assert.equal((await recovered.list()).length, 0);
  assert.equal((await recovered.notes())[0].dirty, false);

  // Account caches and pinned authorization cannot mix across auth races.
  const otherDB = await openAccountDB(userB);
  const other = new AccountStorage(otherDB, userB);
  assert.equal((await other.notes()).length, 0);
  assert.equal(await other.profile(),undefined,'account B must not inherit account A profile');

  // Test the real pull adapter against an owner-filtered Supabase query stub.
  // It must preserve pinned bearer authorization for all four existing tables.
  const reviewId = crypto.randomUUID();
  const mockRows = {
    notes:[{ id:'cloud-b',data:{...note('B-only'),id:'cloud-b'},
      revision:1,deleted_at:null }],
    review_events:[{ event_id:reviewId,note_id:'cloud-b',ordinal:1,
      occurred_at_ms:123,grade:3,state_before:0,duration_ms:500,kind:0,
      scheduling_provenance:null }],
    review_retractions:[{ retraction_id:crypto.randomUUID(),
      target_event_id:reviewId,reason:'undo',recorded_at:'2026-10-26' }],
    profiles:[{ user_id:userB,data:{settings:{retention:0.94}},revision:1,
      updated_at:'2026-10-26' }]
  };
  const tablesRead = [];
  const reader = { auth:{getSession:async()=>({data:{session:{
    user:{id:userB},access_token:'token-b'}}})},
    from(table) {
      tablesRead.push(table);
      const query = {
        select(){return this;}, eq(col,value) {
          assert.equal(col,'user_id'); assert.equal(value,userB);return this;
        },
        order(){return this;}, limit(){return this;}, gt(){return this;},
        setHeader(name,value) {
          assert.deepEqual([name,value],['Authorization','Bearer token-b']);
          return Promise.resolve({data:mockRows[table],error:null});
        }
      };
      return query;
    }
  };
  await pullAll(reader,userB,other);
  assert.deepEqual(tablesRead,['notes','review_events','review_retractions','profiles']);
  assert.equal((await other.notes())[0].data.front,'B-only');
  assert.equal((await other.reviews())[0].event_id,reviewId);
  assert.equal((await other.retractions())[0].target_event_id,reviewId);
  assert.equal((await other.profile()).data.settings.retention,0.94);
  let session = { user:{ id:userA }, access_token:'token-a' };
  let header, calls = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session }, error:null }) },
    rpc: () => {
      calls++;
      session = { user:{ id:userB }, access_token:'token-b' };
      return { setHeader: (key, value) => { header = [key,value]; return Promise.resolve({ data:2 }); } };
    }
  };
  const transport = new SupabaseTransport(client, userA);
  await transport.send(operation);
  assert.deepEqual(header, ['Authorization','Bearer token-a']);
  await assert.rejects(transport.send(operation), /account changed/);
  assert.equal(calls, 1);
  const stopped = new Processor(recovered, network);
  await recovered.stageNote(note('stay local'));
  stopped.stopped = true;
  assert.deepEqual(await stopped.flush(), { stopped:true });
  assert.equal((await recovered.list()).length, 1);

  // Explicit conflicts block only that note; other device changes remain recoverable.
  await clear(reopened);
  await recovered.stageNote(note('local'));
  await recovered.stageNote({ ...note('unrelated'), id:'other' });
  const conflicted = new Processor(recovered, { send: async op => {
    if (op.entityId === 'n') throw new Error('stale_note_revision');
    return { revision:1 };
  }});
  await conflicted.flush();
  assert.equal((await recovered.list())[0].state, 'conflict');
  assert.equal((await recovered.notes()).find(n => n.id === 'n').data.front, 'local');
  assert.equal((await recovered.notes()).find(n => n.id === 'other').dirty, false);
  reopened.close(); otherDB.close();
  console.log('ok: IndexedDB ordering, atomic review rollback, crash recovery, tombstones, conflicts, account isolation and pinned JWT');
})().catch(error => { console.error(error); process.exitCode = 1; });
