const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { indexedDB } = require('fake-indexeddb');
const original = { id:'anonymous', front:'device',back:'',log:[],cards:{} };
const calls = [], wake = [];
const uid = '00000000-0000-4000-8000-000000000001';
let current = { id:uid };
const storage = {
  async notes() { return [{id:'account-card',data:{id:'account-card',front:'cloud',back:'',log:[],cards:{}},
    revision:4,dirty:false,deleted:false}]; },
  async profile() { return {data:{settings:{retention:0.93}},revision:2}; },
  async stageProfile(data) { calls.push({kind:'profile',data}); },
  async stageNote(note, rev, deleted) { calls.push({kind:'note',note,deleted:Boolean(deleted)}); },
  async stageReview(note, event) { calls.push({kind:'review',note,event}); },
  async stageUndo(note, eventId) { calls.push({kind:'undo',note,eventId}); }
};
const handle = { userId:uid,storage };
const context = vm.createContext({
  indexedDB, window:{}, structuredClone, clone:structuredClone, console,
  toast(){}, setTimeout,clearTimeout,
  LemmaAccount:{get user(){return current;}},
  LemmaSync:{kick(){wake.push('wake');}}
});
vm.runInContext(fs.readFileSync('src/app/store.js','utf8')+'\nglobalThis.testStore=Store;',context);
const Store = context.testStore;
(async()=>{
  await Store.init({status(){}});
  assert.equal(Store.mode,'local');
  await Store.saveNote(original);
  await Store.whenSaved();
  const wrong = {...handle,userId:'00000000-0000-4000-8000-000000000002'};
  await assert.rejects(Store.activateAccount(wrong),/identity changed/);
  assert.equal(Store.mode,'local');
  const opened = await Store.activateAccount(handle);
  assert.equal(Store.mode,'account');
  assert.equal(opened.notes.get('account-card').front,'cloud');
  assert.equal(opened.profile.settings.retention,0.93);
  assert.equal(opened.notes.has('anonymous'),false,'anonymous deck is not implicitly enrolled');
  await Store.saveNote({id:'account-card',front:'edited',back:'',log:[],cards:{}});
  const review=[100,1,3,0,200,0,crypto.randomUUID()];
  await Store.saveReview({id:'account-card',front:'edited',back:'',log:[review],cards:{}},review);
  await Store.undoReview({id:'account-card',front:'edited',back:'',log:[],cards:{}},review[6]);
  await Store.deleteNote('account-card');
  await Store.whenSaved();
  assert.deepEqual(calls.map(x=>x.kind),['note','review','undo','note']);
  assert.equal(calls.at(-1).deleted,true);
  assert.equal(calls[1].event[6],review[6]);
  assert.equal(calls[2].eventId,review[6]);
  assert.equal(wake.length,4);
  await Store.saveProfile({settings:{retention:0.8}});
  assert.equal(calls.at(-1).kind,'profile');
  assert.equal(calls.at(-1).data.settings.retention,0.8);
  const restored = await Store.deactivateAccount();
  assert.equal(Store.mode,'local');
  assert.equal(restored.notes.get('anonymous').front,'device');
  assert.equal(restored.notes.has('account-card'),false);
  assert.equal((await Store.localLeftovers()).length,1);
  current = {id:'00000000-0000-4000-8000-000000000002'};
  await assert.rejects(Store.activateAccount(handle),/identity changed/);
  console.log('ok: gated Store account adapter, review/Undo delegation, anonymous backup and account identity');
})().catch(e=>{console.error(e);process.exitCode=1;});
