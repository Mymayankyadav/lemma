const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const active = [], channels = [], pulled = [], flushed = [], staged = [];
const local = { id:'new-note', front:'new', back:'answer', log:[], cards:{} };
const model = new Map([[local.id,local],
  ['already-present', { id:'already-present',front:'old',back:'old',log:[],cards:{} }]]);
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
  Store:{mode:'local',whenSaved:async()=>{localSaved++;}},
  Model:{notes:model},
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
    ['notes','review_events','review_retractions']);
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
  assert.equal(localSaved,1,'must wait for anonymous data durability');
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
