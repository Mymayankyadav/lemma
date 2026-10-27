const assert = require('node:assert/strict');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const { AccountStorage, openAccountDB } = require('../src/app/sync_browser');
const { Processor } = require('../src/app/outbox_core');
const user = '00000000-0000-4000-8000-000000000027';
const note = (id, front) => ({id,front,back:'',cards:{},log:[]});
async function device(factory = new IDBFactory()) {
  globalThis.indexedDB = factory;
  const db = await openAccountDB(user);
  return {factory,db,storage:new AccountStorage(db,user)};
}
async function conflict(storage, id, {deleted=false, remoteDeleted=false, profile=false} = {}) {
  const base = profile ? {settings:{retention:.9}} : note(id,'base');
  const ingest = (data,revision) => profile ? storage.ingestRemoteProfile({user_id:user,data,revision}) :
    storage.ingestRemoteNote({id,data,revision,deleted_at:revision===2 && remoteDeleted ? '2026-10-27' : null});
  await ingest(base,1);
  const op = profile ? await storage.stageProfile({settings:{retention:.91}}) : await storage.stageNote(note(id,'local'),undefined,deleted);
  const later = profile ? await storage.stageProfile({settings:{retention:.92}}) : await storage.stageNote(note(id,'latest local'),undefined,deleted);
  await storage.markAttempt(op.id);
  await storage.markConflict(op.id,new Error('stale_' + op.kind + '_revision'));
  const remote = profile ? {settings:{retention:.94}} : note(id,'remote');
  await ingest(remote,2);
  return {op,later,base,remote,view:await storage.inspectConflict(op.id)};
}
(async () => {
  let d = await device(), s = d.storage;
  // Each explicit choice creates one new versioned intent; old snapshots and
  // request IDs are archived exactly, rather than silently discarded.
  for (const choice of ['local','remote','merge']) {
    const c = await conflict(s,choice);
    const decision = choice === 'merge' ? {choice,data:note(choice,'merged')} : {choice};
    const resolved = await s.resolveConflict(c.op.id,c.view.token,decision);
    assert.notEqual(resolved.requestId,c.op.requestId);
    assert.equal(resolved.expectedRevision,2);
    assert.deepEqual(resolved.base,c.view.remote);
    assert.equal(resolved.data.front,choice === 'local' ? 'latest local' : choice === 'remote' ? 'remote' : 'merged');
    assert.equal(await s.get(c.op.id),undefined);
    assert.equal(await s.get(c.later.id),undefined);
    const archive = await s.resolution(c.op.id);
    assert.deepEqual(archive.reviewed.queued,c.view.queued);
    assert.deepEqual(archive.operation,resolved);
    assert.equal((await s.note(choice)).dirty,true);
    assert.equal((await s.note(choice)).data.front,resolved.data.front);
    assert.deepEqual(await s.resolveConflict(c.op.id,c.view.token,decision),resolved,'lost local receipt reuses committed operation');
    await assert.rejects(s.resolveConflict(c.op.id,c.view.token,{choice:'remote',different:true}), /already recorded/);
    await s.ack(resolved,{revision:3});
    assert.equal((await s.note(choice)).dirty,false);
    assert.equal((await s.resolution(c.op.id)).acknowledgment.revision,3);
    assert.deepEqual(await s.resolveConflict(c.op.id,c.view.token,decision),resolved,'repeated choice after cloud ack cannot enqueue again');
    await new Processor(s,{}).resume(c.op.id);
    assert.equal(await s.get(c.op.id),undefined,'retry cannot resurrect archived conflict');
  }

  // Profiles use the same transaction, while a note literally named profile is independent.
  const p = await conflict(s,'profile',{profile:true});
  const independent = await s.stageNote(note('profile','unrelated'));
  const rp = await s.resolveConflict(p.op.id,p.view.token,{choice:'local'});
  assert.equal(rp.data.settings.retention,.92);
  assert.equal((await s.profile()).data.settings.retention,.92);
  assert.deepEqual(await s.get(independent.id),independent);
  const laterProfile = await s.stageProfile({settings:{retention:.96}});
  await s.ack(rp,{revision:3});
  assert.equal((await s.get(laterProfile.id)).expectedRevision,3);
  assert.deepEqual((await s.get(laterProfile.id)).base.data,rp.data);
  await s.ack(await s.get(laterProfile.id),{revision:4});
  assert.equal((await s.profile()).dirty,false);
  assert.equal((await s.resolution(p.op.id)).acknowledgment.revision,3);

  // Choice guards cover local and remote tombstones; restoring must be explicit.
  for (const remoteDeleted of [true,false]) {
    const id = 'delete-' + remoteDeleted;
    const c = await conflict(s,id,{deleted:!remoteDeleted,remoteDeleted});
    const restore = remoteDeleted ? 'local' : 'remote';
    await assert.rejects(s.resolveConflict(c.op.id,c.view.token,{choice:restore}), /restoration confirmation/);
    const deletion = remoteDeleted ? 'remote' : 'local';
    await assert.rejects(s.resolveConflict(c.op.id,c.view.token,{choice:deletion}), /deletion confirmation/);
    const resolved = await s.resolveConflict(c.op.id,c.view.token,{choice:deletion,confirmDelete:true});
    assert.equal(resolved.deleted,true);
    assert.equal(resolved.data,null);
    await s.ack(resolved,{revision:3});
    assert.equal((await s.note(id)).deleted,true);
    assert.deepEqual((await s.note(id)).base.data,c.remote,'server tombstone retains remote content');
  }
  const restore = await conflict(s,'restore',{remoteDeleted:true});
  const restored = await s.resolveConflict(restore.op.id,restore.view.token,{choice:'local',confirmRestore:true});
  assert.equal(restored.deleted,false);
  assert.equal(restored.data.front,'latest local');

  // Stale local/remote/queue observations cannot overwrite newer work.
  for (const change of ['local','remote','resume']) {
    const c = await conflict(s,'stale-'+change);
    if (change === 'local') await s.stageNote(note(c.op.entityId,'newer local'));
    if (change === 'remote') await s.ingestRemoteNote({id:c.op.entityId,data:note(c.op.entityId,'newer remote'),revision:3});
    if (change === 'resume') await new Processor(s,{}).resume(c.op.id);
    const before = await s.list(), projection = await s.note(c.op.entityId);
    await assert.rejects(s.resolveConflict(c.op.id,c.view.token,{choice:'remote'}),/Conflict changed/);
    assert.deepEqual(await s.list(),before);
    assert.deepEqual(await s.note(c.op.entityId),projection);
    assert.equal(await s.resolution(c.op.id),undefined);
  }
  const uncertain = await conflict(s,'uncertain');
  await s.markAttempt(uncertain.later.id);
  const uv = await s.inspectConflict(uncertain.op.id);
  await assert.rejects(s.resolveConflict(uncertain.op.id,uv.token,{choice:'local'}),/uncertain mutations/);
  const missing = await s.stageNote(note('missing','local'));
  await s.markConflict(missing.id,new Error('stale_note_revision'));
  const mv = await s.inspectConflict(missing.id);
  await assert.rejects(s.resolveConflict(missing.id,mv.token,{choice:'local'}),/Fresh remote/);

  // A quota/write failure rolls back archive, removals, sequence and projection.
  const atomic = await conflict(s,'atomic');
  const before = await s.list(), projection = await s.note('atomic');
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function(value,...args) {
    const req = add.call(this,value,...args);
    if (this.name === 'outbox' && value.resolves === atomic.op.id) this.transaction.abort();
    return req;
  };
  try { await assert.rejects(s.resolveConflict(atomic.op.id,atomic.view.token,{choice:'local'})); }
  finally { IDBObjectStore.prototype.add = add; }
  assert.deepEqual(await s.list(),before);
  assert.deepEqual(await s.note('atomic'),projection);
  assert.equal(await s.resolution(atomic.op.id),undefined);
  const resolvedAtomic = await s.resolveConflict(atomic.op.id,atomic.view.token,{choice:'local'});
  assert.equal(resolvedAtomic.sequence, Math.max(...before.map(op=>op.sequence))+1);

  // Two tabs racing different choices commit just one resolution.
  globalThis.indexedDB = d.factory;
  const tabDB = await openAccountDB(user), tab = new AccountStorage(tabDB,user);
  const race = await conflict(s,'tabs');
  const results = await Promise.allSettled([
    s.resolveConflict(race.op.id,race.view.token,{choice:'local'}),
    tab.resolveConflict(race.op.id,race.view.token,{choice:'remote'})
  ]);
  assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);
  assert.equal((await s.list()).filter(op=>op.resolves===race.op.id).length,1);
  tabDB.close();

  // Unknown legacy bases permit explicit choices, but never a purported three-way merge.
  const legacy = await conflict(s,'legacy');
  await s.put({...await s.get(legacy.op.id),base:{revision:1,known:false},
    conflict:{...legacy.view.queued[0].conflict,base:{revision:1,known:false}}});
  const lv = await s.inspectConflict(legacy.op.id);
  await assert.rejects(s.resolveConflict(legacy.op.id,lv.token,{choice:'merge',data:note('legacy','invented')}),/unknown base/);
  await s.resolveConflict(legacy.op.id,lv.token,{choice:'remote'});

  // Differing FSRS snapshots remain blocked; review and Undo ledgers are untouched.
  const reviewed = note('review','base');
  await s.ingestRemoteNote({id:reviewed.id,data:reviewed,revision:1});
  const event = [100,1,3,0,500,0,crypto.randomUUID()];
  const reviewOp = await s.stageReview({...reviewed,log:[event],cards:{1:{reps:1}}},event);
  await s.stageUndo(reviewed,event[6]);
  await s.markConflict(reviewOp.id,new Error('stale_note_revision'));
  await s.ingestRemoteNote({id:reviewed.id,data:reviewed,revision:2});
  const reviewView = await s.inspectConflict(reviewOp.id), reviewQueue = await s.list();
  const events = await s.reviews(), retractions = await s.retractions();
  await assert.rejects(s.resolveConflict(reviewOp.id,reviewView.token,{choice:'remote'}),/review_replay_required/);
  assert.deepEqual(await s.list(),reviewQueue);
  assert.deepEqual(await s.reviews(),events);
  assert.deepEqual(await s.retractions(),retractions);
  // Concurrent offline schedules are projected from immutable provenance,
  // not whichever device happens to win the remote note revision.
  const FSRS = require('../src/fsrs.js');
  const newCard = () => ({st:0,due:0,s:0,d:0,last:0,step:0,reps:0,lapses:0});
  const stamp = Date.UTC(2026,9,27,8,0,0);
  const clockOffset = -330 * 60000 + 4 * 3600000;
  const clock = {
    dayIndex: ts => Math.floor((ts-clockOffset)/86400000),
    dayStart: i => i*86400000 + clockOffset
  };
  function reviewFixture(id, eventId, offset, grade) {
    const now = stamp + offset;
    const prov = {version:1,algorithm:'fsrs-6',weights:FSRS.DEFAULT_W.slice(),
      day_index:clock.dayIndex(now),rollover_hour:4,timezone_offset_minutes:-330,
      retention:.9,max_interval_days:36500,learn_steps:'1m 10m',relearn_steps:'10m',
      fuzz:true,load_balance:false,preview_at_ms:now,card_before:newCard()};
    const entry = [now,1,grade,0,500,0,eventId,prov];
    const event = {event_id:eventId,note_id:id,ordinal:1,occurred_at_ms:now,grade,
      state_before:0,duration_ms:500,kind:0,scheduling_provenance:prov};
    const card = FSRS.preview(newCard(),now,{
      w:prov.weights,retention:.9,maxIvl:36500,learn:[1,10],relearn:[10],
      fuzz:true,loadBalance:false
    },{clock,key:id+':1'})[grade].card;
    return {entry,event,card};
  }
  async function divergent(reverse = false, undoLocal = false) {
    const deviceInstance = await device();
    const st = deviceInstance.storage, id = 'concurrent';
    const baseline = {...note(id,'base'),cards:{1:newCard()}};
    const one = reviewFixture(id,'00000000-0000-4000-8000-000000000101',0,3);
    const two = reviewFixture(id,'00000000-0000-4000-8000-000000000102',3600000,1);
    const local = reverse ? two : one, remote = reverse ? one : two;
    await st.ingestRemoteNote({id,data:baseline,revision:1});
    const op = await st.stageReview({...baseline,cards:{1:local.card},log:[local.entry]},local.entry);
    if (undoLocal)
      await st.stageUndo({...baseline,cards:{1:newCard()},log:[]},local.event.event_id);
    await st.markAttempt(op.id);
    await st.markConflict(op.id,new Error('stale_note_revision'));
    await st.ingestReview(remote.event);
    await st.ingestRemoteNote({id,
      data:{...baseline,cards:{1:remote.card},log:[remote.entry]},revision:2});
    const view = await st.inspectConflict(op.id);
    const ledgerBefore = await st.reviews(), undoBefore = await st.retractions();
    const chosen = await st.resolveConflict(op.id,view.token,{choice:'remote'});
    assert.equal(chosen.data.cards['1'].reps,undoLocal ? 1 : 2);
    assert.deepEqual((await st.reviews()),ledgerBefore);
    assert.deepEqual((await st.retractions()),undoBefore);
    assert.equal((await st.list()).some(x => x.id === op.id),false);
    assert.equal((await st.list()).some(x => x.kind === 'review'),true,
      'review ledger write must not be superseded by note resolution');
    if (undoLocal) assert.equal((await st.list()).some(x => x.kind === 'retraction'),true);
    deviceInstance.db.close();
    return {cards:chosen.data.cards,log:chosen.data.log};
  }
  const scheduleA = await divergent(false), scheduleB = await divergent(true);
  assert.deepEqual(scheduleA,scheduleB,'two devices must converge independently');
  assert.equal(scheduleA.log.length,2);
  const undoneSchedule = await divergent(false,true);
  assert.equal(undoneSchedule.log.length,1);
  assert.equal(undoneSchedule.log[0][6],'00000000-0000-4000-8000-000000000102');
  assert.equal(undoneSchedule.cards['1'].reps,1);

  // Compatible pending ledger operations are not superseded with note snapshots.
  const ledgerEntry = [200,1,3,0,500,0,crypto.randomUUID()];
  const ledgerBase = {...note('ledger','base'),log:[ledgerEntry],cards:{1:{reps:1}}};
  await s.ingestRemoteNote({id:'ledger',data:ledgerBase,revision:1});
  const compatible = await s.stageReview({...ledgerBase,front:'local edit'},ledgerEntry);
  await s.markConflict(compatible.id,new Error('stale_note_revision'));
  await s.ingestRemoteNote({id:'ledger',data:{...ledgerBase,front:'remote edit'},revision:2});
  const queuedLedger = (await s.list()).find(op=>op.entityId==='ledger' && op.kind==='review');
  const allEvents = await s.reviews(), cv = await s.inspectConflict(compatible.id);
  await s.resolveConflict(compatible.id,cv.token,{choice:'remote'});
  assert.deepEqual(await s.get(queuedLedger.id),queuedLedger);
  assert.deepEqual(await s.reviews(),allEvents);
  assert.deepEqual(await s.retractions(),retractions);

  // A newer server edit rejects the resolution normally; it can itself be
  // resolved without losing the original archive or retrying old requests.
  const changed = await conflict(s,'server-race');
  const first = await s.resolveConflict(changed.op.id,changed.view.token,{choice:'local'});
  await s.markConflict(first.id,new Error('stale_note_revision'));
  await s.ingestRemoteNote({id:'server-race',data:note('server-race','third remote'),revision:3});
  const fv = await s.inspectConflict(first.id);
  const second = await s.resolveConflict(first.id,fv.token,{choice:'remote'});
  assert.equal(second.expectedRevision,3);
  assert.equal((await s.resolution(changed.op.id)).supersededBy,second.id);
  assert.equal((await s.resolution(first.id)).reviewed.queued[0].requestId,first.requestId);

  // Restart after a lost server receipt sends exactly the same new request ID.
  const clean = await device(), cc = await conflict(clean.storage,'lost');
  const operation = await clean.storage.resolveConflict(cc.op.id,cc.view.token,{choice:'local'});
  const receipts = new Map(), sent = [];
  const transport = {send:async op => {
    sent.push(op.requestId);
    if (!receipts.has(op.requestId)) { receipts.set(op.requestId,{revision:3}); throw new Error('response lost'); }
    return receipts.get(op.requestId);
  }};
  await new Processor(clean.storage,transport).flush();
  clean.db.close(); const reopened = await device(clean.factory);
  assert.deepEqual(await reopened.storage.resolveConflict(cc.op.id,cc.view.token,{choice:'local'}),operation);
  await new Processor(reopened.storage,transport).flush();
  assert.deepEqual(sent,[operation.requestId,operation.requestId]);
  assert.equal(receipts.size,1);
  assert.equal((await reopened.storage.list()).length,0);
  assert.equal((await reopened.storage.note('lost')).dirty,false);
  assert.equal((await reopened.storage.resolution(cc.op.id)).acknowledgment.revision,3);
  assert.deepEqual((await reopened.storage.resolution(cc.op.id)).reviewed.queued,cc.view.queued);
  // A conflict token cannot be applied to another device/account cache.
  await assert.rejects(reopened.storage.resolveConflict(restore.op.id,restore.view.token,{choice:'remote'}),/Conflict changed/);
  reopened.db.close(); d.db.close();
  console.log('ok: transactional conflict choices, archives, stale guards, tombstones, rollback, ledger gates and idempotent recovery');
})().catch(error => {console.error(error);process.exitCode=1;});
