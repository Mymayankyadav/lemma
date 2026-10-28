'use strict';
// PLAN-01 P5e: study evidence must retain the exact validated JSON payload
// across token refresh and network awaits, even if the caller mutates its input.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const OWNER = '00000000-0000-4000-8000-000000000001';
const PLAN = '00000000-0000-4000-8000-000000000002';
const EVENT = '00000000-0000-4000-8000-000000000003';
const SESSION = '00000000-0000-4000-8000-000000000004';
let gate = null, releaseToken = null, online = true, rpcCalls = 0;
const captured = [];
const client = {
  rpc(name,args) {
    assert.equal(name,'record_study_event');
    rpcCalls++;
    captured.push(args);
    return {setHeader(k,v) {
      assert.equal(k,'Authorization');
      assert.equal(v,'Bearer test-token');
      return Promise.resolve({data:{
        eventId:args.p_event_id,sessionId:SESSION,seq:rpcCalls,
        planRevision:args.p_expected_plan_revision
      }});
    }};
  }
};
const context = vm.createContext({
  LemmaAccount:{
    get client(){return client},
    get user(){return {id:OWNER}},
    onIdentityChange(){}
  },
  LemmaCloud:{async accountToken(c,u) {
    assert.equal(c,client);assert.equal(u,OWNER);
    if (gate) await gate;
    return 'test-token';
  }},
  get navigator(){return {onLine:online}},
  crypto:webcrypto
});
vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+
  '\nglobalThis.study = StudyPlan;',context);
const api = context.study;
const input = payload => ({
  planId:PLAN,checkpointId:'proof-7',expectedPlanRevision:2,
  type:'attempt',payload,eventId:EVENT,source:'student'
});

(async () => {
  const mutable = {text:'Original unfinished proof',
    nested:{hintLevel:2,steps:['first','second']}};
  gate = new Promise(resolve => {releaseToken = resolve});
  const pending = api.recordEvent(input(mutable));
  // The request has already serialized and validated its evidence.
  mutable.text = 'Tampered while awaiting token';
  mutable.nested.hintLevel = 99;
  mutable.nested.steps.push('injected');
  mutable.nested.extra = {new:true};
  releaseToken();
  const receipt = await pending;
  assert.equal(receipt.eventId,EVENT);
  assert.equal(rpcCalls,1);
  assert.deepEqual(JSON.parse(JSON.stringify(captured[0].p_payload)),{
    text:'Original unfinished proof',
    nested:{hintLevel:2,steps:['first','second']}
  },'network request must use pre-await validated JSON, not the mutable input');
  assert.notEqual(captured[0].p_payload,mutable);
  assert.notEqual(captured[0].p_payload.nested,mutable.nested);

  gate = null;
  const invalid = [
    (()=>{const x={text:'cycle'};x.self=x;return x})(),
    {text:BigInt(3)},
    {toJSON(){return 'not an object'}},
    {toJSON(){return null}},
    {toJSON(){throw Error('private toJSON exception')}},
    {text:'x'.repeat(12001)}
  ];
  for (const payload of invalid) {
    await assert.rejects(api.recordEvent(input(payload)),/Invalid study event/,
      'invalid or unserializable payloads must fail closed before network');
  }
  assert.equal(rpcCalls,1,'invalid evidence never reaches an RPC');

  // A normal retry still uses the caller's stable event ID and valid payload.
  await api.recordEvent(input({text:'Original unfinished proof',
    nested:{hintLevel:2,steps:['first','second']}}));
  assert.equal(captured[1].p_event_id,EVENT);
  assert.equal(rpcCalls,2);
  online = false;
  await assert.rejects(api.recordEvent(input({text:'offline'})),/Study is offline/);
  assert.equal(rpcCalls,2,'offline evidence is not submitted');
  console.log('PASS PLAN-01 P5e immutable pre-await JSON event intent, invalid serialization, stable retry ID, offline guard');
})().catch(e=>{console.error('FAIL PLAN-01 P5e: '+e.stack);process.exitCode=1});
