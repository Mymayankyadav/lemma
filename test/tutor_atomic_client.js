'use strict';
// TUTOR-01 T3c2c: no writes without consent and authenticated atomic pairing.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const OWNER='00000000-0000-4000-8000-000000000001';
const PLAN='00000000-0000-4000-8000-000000000002';
const EVENT='00000000-0000-4000-8000-000000000003';
const OTHER='00000000-0000-4000-8000-000000000004';
const input={planId:PLAN,checkpointId:'proof',expectedPlanRevision:2,
 type:'hint',payload:{level:1,text:'First question'},eventId:EVENT,source:'student'};
let identityChanged,afterToken=null,afterRpc=null,fail=null,responseOverride=null,tokenFail=false;
const account={user:{id:OWNER},client:null,onIdentityChange(fn){identityChanged=fn;}};
const app={workspaceRevision:1,workspaceBlocked:false};
const calls=[];
const client={rpc(name,args){
 calls.push({name,args:JSON.parse(JSON.stringify(args))});
 return {setHeader:async(header,token)=>{
  assert.equal(header,'Authorization');
  assert.equal(token,'Bearer mock-token');
  if(afterRpc){const fn=afterRpc;afterRpc=null;fn();}
  if(fail==='network'){fail=null;throw Error('lost response');}
  if(fail){const e=fail;fail=null;return {error:{message:e}};}
  if(responseOverride){const r=responseOverride;responseOverride=null;return {data:r};}
  return {data:{event:{eventId:args.p_event_id,sessionId:OWNER,
   seq:7,planRevision:args.p_expected_plan_revision},
   audit:{receiptId:args.p_event_id,planRevision:args.p_expected_plan_revision,
   createdAt:'2026-10-28T17:30:00Z'}}};
 }};
}};
account.client=client;
const scope=vm.createContext({TextEncoder,Date,LemmaAccount:account,App:app,
 navigator:{onLine:true},
 LemmaCloud:{async accountToken(c,u){
  assert.equal(c,client);assert.equal(u,OWNER);
  if(afterToken){const fn=afterToken;afterToken=null;fn();}
  if(tokenFail){tokenFail=false;throw Error('no network');}
  return 'mock-token';
 }}});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+
 '\nglobalThis.Handoff=TutorHandoff;',scope);
const record=x=>scope.Handoff.recordEventWithAudit(x);
(async()=>{
 assert.equal(scope.Handoff.ready,false);
 assert.equal(calls.length,0,'module load never writes');
 const invalid=[
  {...input,eventId:'invalid'}, {...input,planId:'invalid'},
  {...input,checkpointId:''}, {...input,expectedPlanRevision:0},
  {...input,type:'plan_approved'}, {...input,payload:null},
  {...input,payload:{constructor:{pollution:true}}},
  {...input,payload:{text:'x'.repeat(14000)}}
 ];
 for(const bad of invalid)await assert.rejects(record(bad),/Invalid tutor study event|Invalid tutor handoff|payload limit/);
 assert.equal(calls.length,0,'invalid input must not reach server');
 const result=await record(input);
 assert.equal(result.event.eventId,EVENT);
 assert.equal(result.audit.receiptId,EVENT);
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'record_tutor_evidence_with_receipt');
 assert.deepEqual(calls[0].args,{
  p_plan_id:PLAN,p_checkpoint_id:'proof',p_expected_plan_revision:2,
  p_event_type:'hint',p_payload:{level:1,text:'First question'},p_event_id:EVENT
 },'no tutor-supplied source or actor field sent');
 await record(input);
 assert.deepEqual(calls[1].args,calls[0].args,'same key and exact payload on retries');
 fail='network';
 await assert.rejects(record(input),/same event ID/);
 await record(input);
 assert.deepEqual(calls[3].args,calls[2].args,'ambiguous transport retry stays idempotent');
 for(const reason of ['stale_plan_revision','idempotency_key_reused',
  'checkpoint_not_in_approved_plan','invalid_study_event']){
  fail=reason;await assert.rejects(record(input),new RegExp(reason));
 }
 fail='private diagnostic text';
 await assert.rejects(record(input),/unavailable/,'unexpected backend errors stay private');
 tokenFail=true;await assert.rejects(record(input),/same event ID/);
 afterToken=()=>{account.user={id:OTHER};};
 await assert.rejects(record(input),/account or workspace changed/);
 account.user={id:OWNER};
 afterToken=()=>{identityChanged();};
 await assert.rejects(record(input),/account or workspace changed/,'same owner relogin invalidates pending call');
 afterRpc=()=>{app.workspaceRevision=2;};
 await assert.rejects(record(input),/account or workspace changed/);
 app.workspaceRevision=1;
 app.workspaceBlocked=true;
 await assert.rejects(record(input),/account or workspace changed/);
 app.workspaceBlocked=false;
 scope.navigator.onLine=false;
 await assert.rejects(record(input),/offline/);
 scope.navigator.onLine=true;
 account.user=null;
 await assert.rejects(record(input),/Sign in/);
 account.user={id:OWNER};
 for(const broken of [
  {event:{eventId:EVENT,sessionId:OWNER,seq:1,planRevision:2}},
  {event:{eventId:EVENT,sessionId:OWNER,seq:1,planRevision:2},
   audit:{receiptId:OTHER,planRevision:2,createdAt:'2026-10-28T17:30:00Z'}},
  {event:{eventId:OTHER,sessionId:OWNER,seq:1,planRevision:2},
   audit:{receiptId:EVENT,planRevision:2,createdAt:'2026-10-28T17:30:00Z'}},
  {event:{eventId:EVENT,sessionId:OWNER,seq:1,planRevision:2},
   audit:{receiptId:EVENT,planRevision:2,createdAt:'not a date'}}
 ]){
  responseOverride=broken;await assert.rejects(record(input),/Invalid atomic tutor receipt/);
 }
 assert.equal(scope.Handoff.ready,false,'real tutor handoff acceptance gate remains open');
 console.log('PASS TUTOR-01 T3c2c: atomic RPC, exact retries, owner/relogin/offline guards, malformed dual-receipt denial');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
