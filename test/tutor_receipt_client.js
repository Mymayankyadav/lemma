'use strict';
// TUTOR-01 T3c2a: contract-only transport; the UI does not invoke this yet.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const OWNER='00000000-0000-4000-8000-000000000001';
const PLAN='00000000-0000-4000-8000-000000000002';
const RECEIPT='00000000-0000-4000-8000-000000000003';
const ARTIFACT='00000000-0000-4000-8000-000000000004';
const OTHER='00000000-0000-4000-8000-000000000005';
const input={receiptId:RECEIPT,planId:PLAN,checkpointId:'proof-1',
 expectedPlanRevision:2,action:'evidence_recorded',artifactId:ARTIFACT};
let error=null,tokenError=false,afterToken=null,afterRpc=null,apiCalls=[];
let identityListener=null;
const account={user:{id:OWNER},client:null,
 onIdentityChange(fn){identityListener=fn;}};
const app={workspaceRevision:1,workspaceBlocked:false};
const client={rpc(name,args){
 apiCalls.push({name,args:JSON.parse(JSON.stringify(args))});
 return {setHeader(name,value){
  apiCalls[apiCalls.length-1].header={name,value};
  if(afterRpc){const fn=afterRpc;afterRpc=null;fn();}
  if(error==='network'){error=null;return Promise.reject(Error('socket reset'));}
  if(error){const reason=error;error=null;return Promise.resolve({error:{message:reason}});}
  return Promise.resolve({data:{receiptId:args.p_receipt_id,
    planRevision:args.p_expected_plan_revision,
    createdAt:'2026-10-28T12:00:00+00:00'}});
 }};
}};
account.client=client;
const scope=vm.createContext({TextEncoder,Date,LemmaAccount:account,App:app,
 navigator:{onLine:true},
 LemmaCloud:{async accountToken(c,u){
  assert.equal(c,client);assert.equal(u,OWNER);
  if(afterToken){const fn=afterToken;afterToken=null;fn();}
  if(tokenError){tokenError=false;throw Error('network');}
  return 'mock-access-token';
 }}});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8')+
 '\nglobalThis.Tutor=TutorHandoff;',scope);
const receipt=x=>scope.Tutor.recordReceipt(x);

(async()=>{
 assert.equal(scope.Tutor.ready,false,'T4 gate is not yet accepted');
 assert.equal(apiCalls.length,0,'module load must not record audit');
 for(const invalid of [
  {...input,receiptId:'invalid'},
  {...input,artifactId:'invalid'},
  {...input,planId:'invalid'},
  {...input,checkpointId:''},
  {...input,checkpointId:'\u0000'},
  {...input,expectedPlanRevision:0},
  {...input,action:'plan_approved'},
  {...input,action:'card_saved'},
  {...input,artifactId:null}
 ]) await assert.rejects(receipt(invalid),/Invalid tutor audit receipt/);
 assert.equal(apiCalls.length,0,'validation must be prior to RPC');

 const success=await receipt(input);
 assert.equal(success.receiptId,RECEIPT);
 assert.equal(success.planRevision,2);
 assert.equal(apiCalls.length,1);
 assert.equal(apiCalls[0].name,'record_tutor_handoff_receipt');
 assert.deepEqual(apiCalls[0].args,{
  p_receipt_id:RECEIPT,p_plan_id:PLAN,p_checkpoint_id:'proof-1',
  p_expected_plan_revision:2,p_action:'evidence_recorded',
  p_artifact_id:ARTIFACT,p_tutor_label:null
 },'transport must send bounded metadata only');
 assert.deepEqual(apiCalls[0].header,{name:'Authorization',
  value:'Bearer mock-access-token'});

 await receipt(input);
 assert.equal(apiCalls.length,2,'caller may retry identical receipt');
 assert.deepEqual(apiCalls[1].args,apiCalls[0].args);

 error='network';
 await assert.rejects(receipt(input),/retry the same receipt ID/);
 await receipt(input);
 assert.deepEqual(apiCalls[3].args,apiCalls[2].args,
  'network uncertainty must preserve caller UUID and audit tuple');

 for(const reason of ['idempotency_key_reused','stale_plan_revision',
  'checkpoint_not_in_approved_plan','invalid_handoff_receipt']){
  error=reason;
  await assert.rejects(receipt(input),new RegExp(reason));
 }
 error='unexpected server diagnostics private fields';
 await assert.rejects(receipt(input),/Tutor audit unavailable/);

 tokenError=true;
 await assert.rejects(receipt(input),/retry the same receipt ID/);
 afterToken=()=>{account.user={id:OTHER};};
 await assert.rejects(receipt(input),/account or workspace changed/);
 account.user={id:OWNER};
 afterToken=()=>{assert.ok(identityListener);identityListener();};
 await assert.rejects(receipt(input),/account or workspace changed/,
  'same-user relogin must invalidate in-flight audit');
 afterRpc=()=>{app.workspaceRevision=2;};
 await assert.rejects(receipt(input),/account or workspace changed/);
 app.workspaceRevision=1;
 app.workspaceBlocked=true;
 await assert.rejects(receipt(input),/account or workspace changed/);
 app.workspaceBlocked=false;
 scope.navigator.onLine=false;
 await assert.rejects(receipt(input),/offline/);
 scope.navigator.onLine=true;
 account.user=null;
 await assert.rejects(receipt(input),/Sign in/);
 account.user={id:OWNER};

 const malformed=client.rpc;
 client.rpc=()=>({setHeader:async()=>({data:{
  receiptId:OTHER,planRevision:2,createdAt:'2026-10-28T12:00:00Z'
 }})});
 await assert.rejects(receipt(input),/Invalid tutor audit response/);
 client.rpc=malformed;
 assert.equal(scope.Tutor.ready,false);
 console.log('PASS TUTOR-01 T3c2a: explicit metadata-only audit transport, stable retries, identity/workspace/offline/stale guards; still hidden');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
