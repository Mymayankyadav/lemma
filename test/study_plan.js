'use strict';
// PLAN-01 P1: no network. Mock account-scoped PostgREST and accepted context.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const plan = '00000000-0000-4000-8000-000000000003';
const context = '00000000-0000-4000-8000-000000000004';
const event = '00000000-0000-4000-8000-000000000005';
const session = '00000000-0000-4000-8000-000000000006';
let current = a, online = true, identityChanged = () => {};
let reply = () => ({data:{eventId:event,sessionId:session,seq:8,planRevision:2}});
const rpcCalls = [], reads = [], tokens = [];
const checkpoint = {checkpoint_id:'proof-3',title:'Open cover',
  objective:'Give the finite subcover argument',
  prerequisite_checkpoint_ids:['proof-2'],source_refs:['book:3']};
const records = {
 study_plans:[{id:plan,title:'Topology',revision:2,
   plan:{checkpoints:[checkpoint]},updated_at:'2026-10-28T00:00:00Z'}],
 study_plan_versions:[{context_id:context,context_revision:3,
   snapshot:{checkpoints:[checkpoint]}}],
 study_checkpoints:[{checkpoint_id:'proof-3',title:'Open cover',
   status:'in_progress',progress_details:{}}],
 learning_sessions:[{id:session,state:'active',
   updated_at:'2026-10-28T00:00:00Z'}],
 learning_events:[
   {event_id:event,event_type:'attempt',seq:3,created_at:'t1',
    payload:{checkpoint_id:'proof-3',data:{text:'My proof attempt'}}},
   {event_id:event,event_type:'hint',seq:4,created_at:'t2',
    payload:{checkpoint_id:'proof-3',data:{level:1}}}
 ]
};
const headers = [];
const client = {
 from(table) {
  const query = {
   filters:[],
   select(columns) {this.columns=columns;return this;},
   eq(k,v){this.filters.push([k,v]);return this;},
   order(){return this;},limit(){return this;},
   setHeader(k,v) {
    headers.push([k,v]);reads.push({table,filters:this.filters});
    return Promise.resolve({data:records[table] || []});
   }
  };
  return query;
 },
 rpc(name,args) {
  rpcCalls.push({name,args});
  return {setHeader(k,v){headers.push([k,v]);return Promise.resolve().then(()=>reply());}};
 }
};
const sandbox = vm.createContext({
 LemmaAccount:{
  get client(){return client;},get user(){return current ? {id:current} : null;},
  onIdentityChange(fn){identityChanged=fn;}
 },
 LemmaCloud:{async accountToken(c,u){assert.equal(c,client);tokens.push(u);return 'owner-token';}},
 LemmaCloudBridge:{async readAcceptedContext(id,rev) {
  assert.equal(id,context);assert.equal(rev,3);
  return {context_id:context,revision:3};
 }},
 get navigator(){return {onLine:online};},
});
vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+
  '\nglobalThis.subject=StudyPlan;',sandbox);
const api = sandbox.subject;

(async () => {
 assert.equal(api.ready,true,'Study acceptance enables readiness');
 const first=await api.activeContext();
 assert.equal(first.planId,plan);
 assert.equal(first.planRevision,2);
 assert.equal(first.contextId,context);
 assert.equal(first.contextRevision,3);
 assert.equal(first.checkpoint.id,'proof-3');
 assert.deepEqual([...first.checkpoint.prerequisiteIds],['proof-2']);
 assert.deepEqual([...first.sourceRefs],['book:3']);
 assert.equal(first.sessionId,session);
 assert.equal(first.lastAttempt.payload.text,'My proof attempt');
 assert.equal(first.hintLevel,1);
 assert.ok(reads.every(x=>x.filters.some(([k,v])=>k==='user_id'&&v===a)),
  'every plan read must be scoped by the authenticated owner');
 assert.ok(headers.every(([k,v])=>k==='Authorization'&&v==='Bearer owner-token'));
 assert.ok(tokens.every(x=>x===a));

 const input={planId:plan,checkpointId:'proof-3',expectedPlanRevision:2,
  type:'attempt',payload:{text:'Proof draft: let K be compact'},eventId:event,source:'ChatGPT'};
 const receipt=await api.recordEvent(input);
 assert.equal(receipt.eventId,event);
 assert.equal(rpcCalls[0].name,'record_study_event');
 assert.equal(rpcCalls[0].args.p_expected_plan_revision,2);
 assert.equal(rpcCalls[0].args.p_event_id,event);
 assert.equal(rpcCalls[0].args.p_source,'ChatGPT');
 assert.equal((await api.recordEvent(input)).seq,8);
 assert.equal(rpcCalls[1].args.p_event_id,event,'caller owns retry key');
 const count=rpcCalls.length;
 for (const invalid of [
  {...input,eventId:'bad'}, {...input,expectedPlanRevision:0},
  {...input,checkpointId:''}, {...input,type:'approve'},
  {...input,payload:[]},{...input,source:'x'.repeat(201)}
 ]) await assert.rejects(api.recordEvent(invalid),/Invalid study event/);
 assert.equal(rpcCalls.length,count,'invalid events never touch cloud');
 reply=()=>({data:null,error:{message:'stale_plan_revision'}});
 await assert.rejects(api.recordEvent(input),/stale_plan_revision/);
 reply=()=>({data:null,error:{message:'idempotency_key_reused'}});
 await assert.rejects(api.recordEvent(input),/idempotency_key_reused/);
 reply=()=>({data:null,error:{message:'internal secret data'}});
 await assert.rejects(api.recordEvent(input),/Study request failed; retry/);
 reply=()=>{throw Error('token leaked');};
 await assert.rejects(api.recordEvent(input),/Study request failed; retry/);
 online=false;
 const previous=rpcCalls.length;
 await assert.rejects(api.recordEvent(input),/Study is offline/);
 await assert.rejects(api.activeContext(),/Study is offline/);
 assert.equal(previous,rpcCalls.length);
 online=true;

 // A response initiated in account A must not be returned after a switch.
 reply=()=>{current=b;identityChanged();return {
  data:{eventId:event,sessionId:session,seq:8,planRevision:2}};};
 await assert.rejects(api.recordEvent(input),/Account changed/);
 current=a;identityChanged();
 reply=()=>({data:{eventId:event,sessionId:session,seq:8,planRevision:2}});
 assert.equal((await api.recordEvent(input)).eventId,event);
 const oldReads=reads.length;
 records.study_plans=[];
 assert.equal(await api.activeContext(),null);
 assert.equal(reads.length,oldReads+1,'no plan means no further old-context reads');
 current=null;identityChanged();
 await assert.rejects(api.recordEvent(input),/Sign in/);
 current=a;identityChanged();
 await assert.rejects(api.proposeAmendment({planId:plan}),/Invalid plan draft/,
  'P2a still rejects incomplete/unreviewed proposals before any cloud write');
 assert.ok(!rpcCalls.some(c=>c.name==='publish_study_plan'),
  'tutors cannot publish or approve a plan in P1');
 console.log('PASS PLAN-01 P1 mocked account guards, approved active context, CAS retry key, stale revision, offline failures, explicit amendment hold');
})().catch(e=>{console.error('FAIL PLAN-01 P1: '+e.message);process.exitCode=1;});
