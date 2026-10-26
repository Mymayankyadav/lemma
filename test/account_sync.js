const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const active = [], channels = [], pulled = [], flushed = [];
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
  const item = { userId:id, close(){this.closed=true;},
    outbox:{online:false,flush:async()=>{flushed.push(id);},pending:async()=>[]},
    pull:async()=>{pulled.push(id);} };
  active.push(item);return item;
};
const source=fs.readFileSync('src/app/account_sync.js','utf8');
const ctx=vm.createContext({
  window:{addEventListener(){}}, document:{hidden:false,addEventListener(){}},
  navigator:{onLine:true}, setTimeout,clearTimeout,setInterval(){},
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
  const first=active[0], idB='00000000-0000-4000-8000-000000000002';
  current={id:idB};
  await ctx.sync.attach(current);
  assert.equal(first.closed,true,'switch must close previous cache');
  assert.equal(channels[0].closed,true,'switch must remove previous Realtime channel');
  await ctx.sync.refresh();
  assert.deepEqual(pulled,[first.userId,idB]);
  await ctx.sync.attach(null);
  assert.equal(active[1].closed,true);
  assert.equal(ctx.sync.status.phase,'signed-out');
  assert.equal(ctx.sync.status.userId,null);
  console.log('ok: account cache uses existing sync adapter, handles lifecycle and account isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
