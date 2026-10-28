const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const active = [], channels = [], pulled = [], flushed = [], staged = [];
const local = { id:'new-note', front:'new', back:'answer', log:[], cards:{} };
const model = new Map([[local.id,local],
  ['already-present', { id:'already-present',front:'old',back:'old',log:[],cards:{} }]]);
let accountMode = false, workspaceId = null, workspaceIdle = true;
let localSaved = 0;
let localPending = 0;
let current = { id:'00000000-0000-4000-8000-000000000001' };
const client = {
  channel(name) {
    const item = { name, filters:[], on(_type,filter,cb){this.filters.push(filter);return this;},
      subscribe(cb){this.subscriber=cb;return this;} };
    channels.push(item);return item;
  },
  removeChannel: async ch => { ch.closed = true; }
};
const account = id => {
  const cached = id.endsWith('0001')?[{id:'already-present',deleted:true}]:[];
  const item = { userId:id, close(){this.closed=true;},
    storage:{
      notes:async()=>cached,
      profile:async()=>null,
      inspectAgainst:async(local)=>({ localInputCount:local.length, cachedInputCount:cached.length }),
      stageNote:async(note,revision)=>{
        staged.push({userId:id,note,revision});
        cached.push({id:note.id,deleted:false});
      }
    },
    outbox:{online:false,flush:async()=>{flushed.push(id);},
      pending:async()=>staged.filter(x=>x.userId===id).map(x=>({kind:'note',state:'pending'}))},
    pull:async()=>{pulled.push(id);} };
  active.push(item);return item;
};
const source=fs.readFileSync('src/app/account_sync.js','utf8');
const ctx=vm.createContext({
  window:{addEventListener(){}}, document:{hidden:false,addEventListener(){}},
  navigator:{onLine:true}, structuredClone,
  Store:{get mode(){return accountMode?'account':'local';},status:()=>({pending:localPending,failed:0}),whenSaved:async()=>{localSaved++;}},
  App:{get workspaceController(){return {activeId:workspaceId};},workspaceIdle:()=>workspaceIdle},
  Model:{notes:model,applyRemote(changes){for(const {id,note} of changes) note===null?model.delete(id):model.set(id,note);},
    profile:()=>({settings:{retention:0.9},decks:[]}),loadProfile(){}},
  setTimeout,clearTimeout,setInterval(){},
  LemmaAccount:{client,get user(){return current;},onChange(fn){this.notify=fn;}},
  LemmaCloud:{startAccount:async (_client,id)=>account(id)}
});
vm.runInContext(source+'\nglobalThis.sync=LemmaSync',ctx);
(async()=>{
  await ctx.sync.attach(current);
  await ctx.sync.refresh();
  assert.equal(ctx.sync.status.phase,'ready');
  assert.deepEqual(pulled,[current.id]);
  assert.deepEqual(flushed,[current.id]);
  assert.deepEqual(channels[0].filters.map(f=>f.table),
    ['notes','profiles','review_events','review_retractions']);
  const comparison = await ctx.sync.compareLocal();
  assert.equal(comparison.localInputCount,2);
  assert.equal(comparison.cachedInputCount,1);
  assert.equal(comparison.fresh,true);
  assert.equal(comparison.accountUserId,current.id);
  const enrollment = await ctx.sync.enrollMissingLocal();
  assert.equal(enrollment.queued,1);
  assert.equal(enrollment.skipped,1,'tombstones cannot be resurrected');
  assert.equal(staged.length,1);
  assert.equal(staged[0].note.front,'new');
  assert.equal(staged[0].revision,0);
  assert.equal(localSaved,2,'comparison and enrollment each require durable source data');
  assert.equal(model.size,2,'source notes must be retained');
  const secondPass = await ctx.sync.enrollMissingLocal();
  assert.equal(secondPass.queued,0,'repeated enrollment cannot duplicate queued writes');
  assert.equal(secondPass.skipped,2);
  const first=active[0], idB='00000000-0000-4000-8000-000000000002';
  current={id:idB};
  await ctx.sync.attach(current);
  assert.equal(first.closed,true,'switch must close previous cache');
  assert.equal(channels[0].closed,true,'switch must remove previous Realtime channel');
  await ctx.sync.refresh();
  assert.deepEqual(pulled,[first.userId,idB]);
  // In an explicitly active account workspace, pulls refresh only clean
  // owner-scoped cache rows and never replace open edits or dirty drafts.
  const bCache = active[1].storage;
  const remote = {id:'remote-b',data:{id:'remote-b',front:'account only',back:'',log:[],cards:{}},
    deleted:false,dirty:false,revision:2};
  const dirty = {id:'dirty-b',data:{id:'dirty-b',front:'local draft',back:'',log:[],cards:{}},
    dirty:true,deleted:false,revision:1};
  const rowsB = await bCache.notes();
  const tombstone = {id:'deleted-b',data:{id:'deleted-b',front:'old remote card',back:'',log:[],cards:{}},
    deleted:false,dirty:false,revision:2};
  // Simulate an account client that still displays an otherwise clean note
  // when an independent device has already deleted it on the server.
  model.set(tombstone.id,structuredClone(tombstone.data));
  rowsB.push(remote,dirty,tombstone);
  accountMode=true;workspaceId=idB;workspaceIdle=false;
  await ctx.sync.refresh();
  assert.equal(model.has('remote-b'),false,'open editor must not be overwritten');
  workspaceIdle=true;
  await ctx.sync.refresh();
  assert.equal(model.get('remote-b').front,'account only');
  assert.equal(model.has('dirty-b'),false,'dirty notes stay in account cache until conflict resolution');
  // Tombstone pull must not mutate the visible Model while editing or while
  // Store has a pending local write; it must then remove the clean remote note.
  tombstone.deleted=true; tombstone.revision=3;
  workspaceIdle=false;
  await ctx.sync.refresh();
  assert.equal(model.has('deleted-b'),true,'an open editor blocks remote deletion');
  workspaceIdle=true; localPending=1;
  await ctx.sync.refresh();
  assert.equal(model.has('deleted-b'),true,'pending local writes block remote deletion');
  localPending=0;
  await ctx.sync.refresh();
  assert.equal(model.has('deleted-b'),false,'a clean tombstone removes the visible note');
  assert.equal(model.get('remote-b').front,'account only','unrelated notes survive the tombstone');
  assert.equal(staged.length,1,'remote deletion must not queue a new local mutation');
  // A stale view projected during client restoration must be invalidated on
  // the next owner-scoped refresh rather than resurrect the tombstoned note.
  model.set('deleted-b',structuredClone(tombstone.data));
  await ctx.sync.refresh();
  assert.equal(model.has('deleted-b'),false,'stale restoration cannot resurrect a tombstone');
  model.set('dirty-b',structuredClone(dirty.data));
  await ctx.sync.refresh();
  assert.equal(model.get('dirty-b').front,'local draft','dirty rows are never clobbered');
  // A remote tombstone pulled while editing must be projected automatically
  // when the sheet closes. No manual Sync/refresh or second server pull is
  // required; the previously fetched owner-scoped cache remains authoritative.
  const deferred = {id:'deferred-b',data:{id:'deferred-b',front:'cached before remote deletion',
    back:'',log:[],cards:{}},deleted:true,dirty:false,revision:3};
  rowsB.push(deferred);
  model.set(deferred.id,structuredClone(deferred.data));
  workspaceIdle=false;
  await ctx.sync.refresh();
  assert.equal(model.has(deferred.id),true,'open sheet must keep visible Model stable');
  workspaceIdle=true;
  const until = Date.now() + 3000;
  while (model.has(deferred.id) && Date.now() < until)
    await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(model.has(deferred.id),false,'closing sheet must apply deferred tombstone');
  assert.equal(model.get('remote-b').front,'account only','deferred invalidation must preserve other notes');
  assert.equal(model.get('dirty-b').front,'local draft','deferred invalidation must preserve dirty rows');
  // Staged local writes also defer projection without making a new server
  // mutation; draining them must eventually reconcile the cached deletion.
  const deferredPending = {id:'pending-delete-b',data:{id:'pending-delete-b',front:'before deletion',
    back:'',log:[],cards:{}},deleted:true,dirty:false,revision:4};
  rowsB.push(deferredPending);
  model.set(deferredPending.id,structuredClone(deferredPending.data));
  localPending=1;
  await ctx.sync.refresh();
  assert.equal(model.has(deferredPending.id),true,'pending local work blocks remote projection');
  localPending=0;
  const untilPending = Date.now() + 3000;
  while (model.has(deferredPending.id) && Date.now() < untilPending)
    await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(model.has(deferredPending.id),false,'draining writes must apply cached tombstones');
  assert.equal(staged.length,1,'deferred remote invalidation cannot enqueue new writes');

  // A real failed write must stay visibly failed while an automatic retry is
  // in flight. Only confirmed outbox flush + pull may clear the warning.
  const bHandle=active[1], originalFlush=bHandle.outbox.flush;
  const observedPhases=[];
  const unsubscribe=ctx.sync.onChange(state=>observedPhases.push(state.phase));
  bHandle.outbox.flush=async()=>{throw new Error('synthetic blocked HTTP write');};
  await assert.rejects(ctx.sync.refresh(),/synthetic blocked HTTP write/);
  assert.equal(ctx.sync.status.phase,'error','failed RPC must surface an error');
  const afterFailure=observedPhases.length;
  let finishRetry;
  bHandle.outbox.flush=()=>new Promise(resolve=>{finishRetry=resolve;});
  const retry=ctx.sync.refresh();
  assert.equal(ctx.sync.status.phase,'error',
    'scheduled retries must not clear the error before server acknowledgment');
  assert.equal(typeof finishRetry,'function');
  finishRetry();
  await retry;
  assert.equal(ctx.sync.status.phase,'ready','successful retry must clear the error');
  assert.equal(ctx.sync.status.error,'');
  assert.deepEqual(observedPhases.slice(afterFailure),['ready'],
    'no transient Queued/refreshing state may mask an unresolved RPC failure');
  // No queued write: a periodic poll must keep the confirmed cloud status,
  // even if the HTTP request itself is delayed.
  let markIdleStarted, finishIdle;
  const idleStarted=new Promise(resolve=>{markIdleStarted=resolve;});
  bHandle.outbox.flush=()=>{
    markIdleStarted();
    return new Promise(resolve=>{finishIdle=resolve;});
  };
  const idlePoll=ctx.sync.refresh();
  await idleStarted;
  assert.equal(ctx.sync.status.phase,'ready',
    'a clean background poll must not temporarily show checking cloud');
  finishIdle();
  await idlePoll;
  assert.equal(ctx.sync.status.phase,'ready');

  // But an actual durable outbox item still needs the checking-cloud cue.
  const previousPending=bHandle.outbox.pending;
  bHandle.outbox.pending=async()=>[{kind:'note',state:'pending'}];
  let markDirtyStarted, finishDirty;
  const dirtyStarted=new Promise(resolve=>{markDirtyStarted=resolve;});
  bHandle.outbox.flush=()=>{
    markDirtyStarted();
    return new Promise(resolve=>{finishDirty=resolve;});
  };
  const dirtyPoll=ctx.sync.refresh();
  await dirtyStarted;
  assert.equal(ctx.sync.status.phase,'refreshing',
    'a new queued edit must still display a pending cloud check');
  finishDirty();
  await dirtyPoll;
  bHandle.outbox.pending=previousPending;
  bHandle.outbox.flush=originalFlush;
  unsubscribe();

  // A pull that started for account B must never project its late result
  // after B signs out, even if its IndexedDB read completes afterward.
  const late = {id:'late-b',data:{id:'late-b',front:'stale account B card',back:'',log:[],cards:{}},
    deleted:true,dirty:false,revision:5};
  rowsB.push(late);
  model.set(late.id,structuredClone(late.data));
  let releaseRead;
  let reading;
  const readStarted = new Promise(resolve=>{reading=resolve;});
  bCache.notes = ()=>new Promise(resolve=>{
    releaseRead=()=>resolve(rowsB);
    reading();
  });
  const lateRefresh=ctx.sync.refresh();
  await readStarted;
  current=null;accountMode=false;workspaceId=null;
  await ctx.sync.attach(null);
  releaseRead();
  await lateRefresh;
  assert.equal(model.has(late.id),true,
    'an in-flight previous-owner read must not alter Model after account exit');
  assert.equal(active[1].closed,true);
  await assert.rejects(ctx.sync.enrollMissingLocal(),/Refresh your signed-in/);
  await assert.rejects(ctx.sync.compareLocal(),/Sign in/);
  assert.deepEqual(staged.map(x=>x.userId),[first.userId],
    'account B and signed-out users receive no implicit local data');
  assert.equal(ctx.sync.status.phase,'signed-out');
  assert.equal(ctx.sync.status.userId,null);
  // Recovery shares the exact per-owner cross-tab sync lock and keeps the
  // account stopped after a failed action. A caller must explicitly resume.
  current={id:first.userId};await ctx.sync.attach(current);
  const recoveryHandle=ctx.sync.accountHandle();let closed=0,locked=null;
  ctx.navigator.locks={request:async(name,action)=>{locked=name;return action();}};
  ctx.LemmaCloud.openAccountDB=async()=>({close(){closed++;}});
  ctx.LemmaCloud.AccountStorage=class {constructor(db,userId){this.db=db;this.userId=userId;}};
  await assert.rejects(ctx.sync.withRecovery(async(storage,isActive)=>{
    assert.equal(locked,'lemma-sync-'+first.userId);
    assert.equal(recoveryHandle.closed,true);
    assert.equal(ctx.sync.accountHandle(),null);
    assert.equal(storage.userId,first.userId);assert.equal(isActive(),true);
    throw new Error('Synthetic interrupted recovery');
  }),/interrupted recovery/);
  assert.equal(closed,1);assert.equal(ctx.sync.accountHandle(),null);
  await ctx.sync.withRecovery(async(_storage,isActive)=>{
    current={id:idB};assert.equal(isActive(),false,'identity change invalidates pending recovery');
  });
  assert.equal(closed,2);ctx.sync.stop();current=null;
  console.log('ok: recovery holds cross-tab sync lock, closes handles and stays paused after failure');
  console.log('ok: account cache lifecycle, scoped tombstone invalidation and dirty write isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
