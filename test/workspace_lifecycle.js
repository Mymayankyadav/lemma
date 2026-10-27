'use strict';
const assert = require('node:assert/strict');
const { create } = require('../src/app/workspace_lifecycle.js');

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const localNote = { id:'private-local',front:'anonymous',back:'',log:[],cards:{} };
const named = id => ({id,front:'account-'+id,back:'',log:[],cards:{}});
const snapshot = note => ({notes:new Map([[note.id,note]]),profile:{settings:{retention:0.9}}});
const defer = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; };

async function run() {
  let user={id:A},idle=true,handle={userId:A};
  let blocked=false,notifications=[],activationGate=null,failRestore=false;
  const model={ notes:new Map(),profile:null,
    loadProfile(p) {this.profile=p;},
    replaceAll(m) {this.notes=new Map(m);} };
  const local=snapshot(localNote);
  const store={
    mode:'local',writes:0,emergency:0,
    async activateAccount(h){
      this.writes++;
      if(activationGate) await activationGate.promise;
      this.mode='account';
      return snapshot(named(h.userId));
    },
    async deactivateAccount() {this.mode='local';return local;},
    async emergencyExitAccount(){
      this.emergency++;
      if(failRestore) throw new Error('local IndexedDB unavailable');
      this.mode='local';return local;
    },
    async localSnapshot(){
      if(failRestore) throw new Error('local IndexedDB unavailable');
      return local;
    }
  };
  const sync={status:{userId:A,phase:'ready',pending:0},accountHandle:()=>handle};
  const account={get user(){return user;},onChange(fn){this.handler=fn;}};
  const switcher=create({store,model,account,sync,idle:()=>idle,
    lock: v=>{blocked=v;},notify:m=>notifications.push(m)});
  switcher.init();

  idle=false;
  await assert.rejects(switcher.activate(),/Close the review/);
  assert.equal(store.writes,0);
  idle=true;
  await switcher.activate();
  assert.equal(store.mode,'account');
  assert.equal(model.notes.has('private-local'),false);
  assert.equal(model.notes.get(A).front,'account-'+A);
  assert.equal(switcher.activeId,A);
  assert.equal(blocked,false);

  // Sign-out must hide A's cards synchronously before any asynchronous read.
  user=null;
  switcher.authChanged(null);
  assert.equal(blocked,true);
  assert.equal(model.notes.size,0);
  const recovering=switcher.recovery;
  assert.ok(recovering);
  await recovering;
  assert.equal(store.mode,'local');
  assert.equal(model.notes.get('private-local').front,'anonymous');
  assert.equal(blocked,false);
  assert.equal(switcher.activeId,null);

  // A -> B -> A should not share either account's note projection.
  user={id:B};sync.status.userId=B;handle={userId:B};
  await switcher.activate();
  assert.equal(model.notes.has(B),true);
  assert.equal(model.notes.has(A),false);
  user={id:A};sync.status.userId=A;handle={userId:A};
  switcher.authChanged(user);
  assert.equal(model.notes.size,0);
  await switcher.recovery;
  assert.equal(model.notes.has(B),false);
  await switcher.activate();
  assert.equal(model.notes.has(A),true);
  await switcher.deactivate();
  assert.equal(model.notes.has('private-local'),true);
  assert.equal(model.notes.has(A),false);
  // A verified identity may explicitly use its already-cached private notes
  // while offline; pending cloud receipts remain tracked rather than erased.
  sync.status.phase='offline';sync.status.pending=2;
  await switcher.activate();
  assert.equal(model.notes.has(A),true);
  assert.equal(switcher.activeId,A);
  await switcher.deactivate();
  sync.status.phase='ready';sync.status.pending=0;

  // Account changes during slow cache loads cannot reintroduce stale cards.
  activationGate=defer();
  const inflight=switcher.activate();
  user={id:B};sync.status.userId=B;handle={userId:B};
  switcher.authChanged(user);
  assert.equal(blocked,true);
  assert.equal(model.notes.size,0);
  const recovery=switcher.recovery;
  activationGate.resolve();
  await assert.rejects(inflight,/Account changed during workspace activation/);
  await recovery;
  assert.equal(store.mode,'local');
  assert.equal(model.notes.has(A),false);
  assert.equal(model.notes.get('private-local').front,'anonymous');
  activationGate=null;

  // A failed local restoration must fail CLOSED, not show stale account cards.
  await switcher.activate();
  failRestore=true;
  user={id:A};sync.status.userId=A;handle={userId:A};
  switcher.authChanged(user);
  assert.equal(blocked,true);
  assert.equal(model.notes.size,0);
  await assert.rejects(switcher.recovery,/local IndexedDB unavailable/);
  assert.equal(blocked,true);
  assert.equal(model.notes.size,0);
  assert.match(notifications.at(-1),/Could not restore local workspace/);

  // App reload starts in local mode; no implicit account activation.
  const restart=create({store:{mode:'local'},model,account,sync,
    idle:()=>true,lock:()=>{}});
  assert.equal(restart.activeId,null);
  console.log('ok: no-loss account switch, A/B/A isolation, pending activation, session guard, failed restore');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
