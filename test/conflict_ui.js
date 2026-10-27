'use strict';
const assert = require('node:assert/strict');
const {blockedReason, decisionFor} = require('../src/app/conflict_ui');
const note = (id,front, cards = {}) => ({id,front,back:'',cards,log:[]});
const base = note('n','base');
const local = note('n','local');
const remote = note('n','remote');
const conflict = () => ({
  id:'op-1', kind:'note', entityId:'n',
  base:{revision:1,known:true,data:base,deleted:false},
  local:{data:local,deleted:false,expectedRevision:1},
  remote:{revision:2,known:true,data:remote,deleted:false},
  queued:[{id:'op-1',kind:'note',entityId:'n',state:'conflict',expectedRevision:1,data:local}]
});
const v = conflict();
assert.equal(blockedReason(v),'');
assert.deepEqual(decisionFor(v,'local','',false,false),{choice:'local'});
assert.deepEqual(decisionFor(v,'remote','',false,false),{choice:'remote'});
assert.deepEqual(decisionFor(v,'merge',JSON.stringify(note('n','combined')),false,false),
  {choice:'merge',data:note('n','combined'),deleted:false});
assert.throws(()=>decisionFor(v,'merge','bad-json',false,false),/invalid/);
assert.throws(()=>decisionFor(v,'merge',JSON.stringify(note('wrong','content')),false,false),/original card ID/);

const unknown = conflict(); unknown.base = {revision:1,known:false};
assert.equal(blockedReason(unknown),'');
assert.throws(()=>decisionFor(unknown,'merge','{}',false,false),/unknown/);

const tomb = conflict(); tomb.remote.deleted = true;
assert.throws(()=>decisionFor(tomb,'remote','',false,false),/Confirm deletion/);
assert.deepEqual(decisionFor(tomb,'remote','',true,false),{choice:'remote',confirmDelete:true});
assert.throws(()=>decisionFor(tomb,'local','',false,false),/Confirm restoration/);
assert.deepEqual(decisionFor(tomb,'local','',false,true),{choice:'local',confirmRestore:true});
const removed = conflict(); removed.local.deleted = true; removed.queued[0].deleted = true;
assert.throws(()=>decisionFor(removed,'local','',false,false),/Confirm deletion/);
assert.deepEqual(decisionFor(removed,'local','',true,false),{choice:'local',confirmDelete:true});
assert.throws(()=>decisionFor(removed,'remote','',false,false),/Confirm restoration/);

const pending = conflict(); pending.queued.push({id:'later',kind:'note',state:'pending',attempted:true});
assert.match(blockedReason(pending),/may have reached the server/);
assert.throws(()=>decisionFor(pending,'remote','',false,false),/earlier request/);
const stale = conflict(); stale.remote.revision = 1;
assert.match(blockedReason(stale),/fresh server/);
const missing = conflict(); missing.remote = null;
assert.match(blockedReason(missing),/fresh server/);
const reviews = conflict(); reviews.queued.push({id:'review',kind:'review',state:'pending'});
assert.match(blockedReason(reviews),/review/);
const schedules = conflict(); schedules.remote.data = note('n','remote',{'1':{s:1}});
assert.match(blockedReason(schedules),/SYNC-03/);
const reordered = conflict();
reordered.base.data.cards = {'2':{d:1,s:2},'1':{d:2,s:1}};
reordered.local.data.cards = {'1':{s:1,d:2},'2':{s:2,d:1}};
reordered.remote.data.cards = {'1':{s:1,d:2},'2':{s:2,d:1}};
reordered.queued[0].data = reordered.local.data;
assert.equal(blockedReason(reordered),'', 'JSONB key reordering is not an FSRS conflict');

const profile = {id:'p',kind:'profile',entityId:'profile',
  base:{known:true,revision:1,data:{settings:{retention:0.9}}},
  local:{data:{settings:{retention:0.93}},deleted:false},
  remote:{known:true,revision:2,data:{settings:{retention:0.95}},deleted:false},
  queued:[{id:'p',kind:'profile',state:'conflict',expectedRevision:1}]};
assert.deepEqual(decisionFor(profile,'remote','',false,false),{choice:'remote'});
console.log('ok: conflict UI choices, tombstones, stale version gates, reviews, JSONB ordering and profile');
