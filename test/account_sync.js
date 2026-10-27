const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const active = [], channels = [], pulled = [], flushed = [], staged = [];
const local = { id:'new-note', front:'new', back:'answer', log:[], cards:{} };
const model = new Map([[local.id,local],
  ['already-present', { id:'already-present',front:'old',back:'old',log:[],cards:{} }]]);
let accountMode = false, workspaceId = null, workspaceIdle = true;
let localSaved = 0;
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
  Store:{get mode(){return accountMode?'account':'local';},status:()=>({pending:0,failed:0}),whenSaved:async()=>{localSaved++;}},
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
  rowsB.push(remote,dirty);
  accountMode=true;workspaceId=idB;workspaceIdle=false;
  await ctx.sync.refresh();
  assert.equal(model.has('remote-b'),false,'open editor must not be overwritten');
  workspaceIdle=true;
  await ctx.sync.refresh();
  assert.equal(model.get('remote-b').front,'account only');
  assert.equal(model.has('dirty-b'),false,'dirty notes stay in account cache until conflict resolution');
  current=null;accountMode=false;workspaceId=null;
  await ctx.sync.attach(null);
  assert.equal(active[1].closed,true);
  await assert.rejects(ctx.sync.enrollMissingLocal(),/Refresh your signed-in/);
  await assert.rejects(ctx.sync.compareLocal(),/Sign in/);
  assert.deepEqual(staged.map(x=>x.userId),[first.userId],
    'account B and signed-out users receive no implicit local data');
  assert.equal(ctx.sync.status.phase,'signed-out');
  assert.equal(ctx.sync.status.userId,null);
  console.log('ok: account cache uses existing sync adapter, handles lifecycle and account isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
