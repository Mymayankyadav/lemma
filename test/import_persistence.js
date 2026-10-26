'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { indexedDB, IDBObjectStore } = require('fake-indexeddb');
const FSRS = require('../src/fsrs.js');
let serial = 0;
const ctx = vm.createContext({ indexedDB, window:{}, clone:structuredClone,
  setTimeout,clearTimeout,console,toast() {},FSRS,
  uid:() => 'import-' + (++serial), clampN:(x,a,b) => Math.min(b,Math.max(a,x)),
  Render:{clozeOrds:() => [],setPreamble() {}} });
for (const [file,symbol] of [['store','Store'],['model','Model'],['io','IO']])
  vm.runInContext(fs.readFileSync('src/app/'+file+'.js','utf8')+'\nglobalThis.test'+symbol+'='+symbol+';',ctx);
const Store=ctx.testStore, Model=ctx.testModel, IO=ctx.testIO;
const parsed = notes => ({format:'json',notes});
const fields = (front,title='',requiresTitles=[]) => ({front,back:'answer',deck:'Proofs',type:'basic',title,tags:[],requiresTitles});
(async () => {
  await Store.init({status() {}});
  const input = parsed([fields('first','First'),fields('abort','Second',['First']),fields('third')]);
  const job = IO.prepare(input);
  assert.equal(Model.notes.size,0,'preparing a job cannot change the collection');
  assert.equal(job.items[1].note.requires[0],job.items[0].note.id,'links resolve before the first durable write');
  const ids = Array.from(job.items,x => x.note.id);
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function(value,...args) {
    const request=add.call(this,value,...args);
    if(value.front==='abort') request.addEventListener('success',()=>this.transaction.abort());
    return request;
  };
  let recovery;
  await assert.rejects(IO.commit(input,{job,checkpoint:j=>{recovery=structuredClone(j);}}));
  assert.equal(Model.notes.size,1,'only committed cards enter the Model');
  assert.equal((await Store.localSnapshot()).notes.size,1);
  assert.equal(recovery.items[0].done,true);
  assert.equal(recovery.items[1].done,false);
  IDBObjectStore.prototype.add=add;
  const first=Model.notes.get(ids[0]);
  first.cards[1].reps=9; first.log.push([100,1,3]);
  await Store.saveNote(first);
  Model.replaceAll((await Store.localSnapshot()).notes); // Browser restart.
  await IO.commit(input,{job:recovery});
  assert.equal(Model.notes.size,3);
  assert.deepEqual([...Model.notes.keys()],ids);
  assert.equal(Model.notes.get(ids[0]).cards[1].reps,9,'retry must not overwrite later reviews');

  // A rejected receipt does not prove the transaction failed. Retry reads the
  // durable card before creating another ID or resetting its review state.
  const lostInput=parsed([fields('lost receipt')]), lostJob=IO.prepare(lostInput);
  const originalSave=Store.saveNote;
  Store.saveNote=async (...args)=>{await originalSave(...args);throw new Error('receipt lost');};
  await assert.rejects(IO.commit(lostInput,{job:lostJob}),/receipt lost/);
  Store.saveNote=originalSave;
  assert.equal(lostJob.items[0].done,false);
  await IO.commit(lostInput,{job:lostJob});
  assert.equal(Model.notes.get(lostJob.items[0].note.id).front,'lost receipt');

  const interrupted=IO.prepare(parsed([fields('old identity first'),fields('must not start')]));
  let current=true, release, committed;
  const transactionDone=new Promise(resolve=>{committed=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  Store.saveNote=async (...args)=>{await originalSave(...args);committed();await gate;};
  const running=IO.commit(null,{job:interrupted,isCurrent:()=>current});
  await transactionDone;
  current=false; Model.replaceAll(new Map()); release();
  await assert.rejects(running,/Workspace changed/);
  Store.saveNote=originalSave;
  assert.equal(Model.notes.size,0,'late import cannot populate the replacement workspace');
  assert.equal((await Store.localSnapshot()).notes.has(interrupted.items[1].note.id),false,'no later write starts in another identity');
  assert.equal(interrupted.items[0].done,true,'original workspace can resume from the confirmed receipt');
  Model.replaceAll((await Store.localSnapshot()).notes);

  // Restoring backup settings is also acknowledged only after persistence.
  const backup={format:'backup',notes:[],backup:{profile:{settings:{retention:0.94}}}};
  const settingsJob=IO.prepare(backup,{restoreSettings:true});
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,...args) {
    const request=put.call(this,value,...args);
    if(this.name==='meta' && value?.settings?.retention===0.94)
      request.addEventListener('success',()=>this.transaction.abort());
    return request;
  };
  await assert.rejects(IO.commit(backup,{job:settingsJob}));
  assert.equal(Model.settings.retention,0.9);
  IDBObjectStore.prototype.put=put;
  await IO.commit(backup,{job:settingsJob});
  assert.equal(Model.settings.retention,0.94);
  assert.equal((await Store.localSnapshot()).profile.settings.retention,0.94);
  console.log('ok: durable import links, partial rollback/retry IDs, lost receipt, identity lease and backup settings');
})().catch(error=>{console.error(error);process.exitCode=1;});
