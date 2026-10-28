'use strict';
// PLAN-01 P4b1: an amendment preview is a pinned, owner-scoped read only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {indexedDB}=require('fake-indexeddb');
const {webcrypto}=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001',
 B='00000000-0000-4000-8000-000000000002',
 P='00000000-0000-4000-8000-000000000003',
 C='00000000-0000-4000-8000-000000000004',
 D='00000000-0000-4000-8000-000000000005';
let current=A,offline=false,identityChange=()=>{},beforeRead=()=>{};
const reads=[],rpc=[];
const approved={checkpoints:Array.from({length:12},(_,i)=>({
 checkpoint_id:'cp-'+(i+1),title:'Checkpoint '+(i+1),
 objective:'Construct rigorous proof',prerequisite_checkpoint_ids:i?['cp-'+i]:[],
 mastery_criterion:'Complete a proof'}))};
const proposal=JSON.parse(JSON.stringify(approved));
proposal.checkpoints.splice(3,0,{checkpoint_id:'cp-new',title:'Missing lemma',
 prerequisite_checkpoint_ids:['cp-3'],mastery_criterion:'Demonstrate proof'});
proposal.checkpoints.find(x=>x.checkpoint_id==='cp-4')
 .prerequisite_checkpoint_ids=['cp-3','cp-new'];
let livePlan={id:P,revision:1};
let liveVersion={revision:1,context_id:null,context_revision:null,
 snapshot:approved};
const client={from(table) {
 const q={where:[],columns:'',
 select(cols){this.columns=cols;return this},
 eq(k,v){this.where.push([k,v]);return this},
 limit(){return this},
 setHeader(k,v) {
  assert.equal(k,'Authorization');assert.equal(v,'Bearer token');
  const predicates=[...this.where];
  reads.push({table,predicates});
  return Promise.resolve().then(async()=>{
   await beforeRead(table);
   const list=table==='study_plans'?(livePlan?[livePlan]:[]):
    table==='study_plan_versions'?(liveVersion?[liveVersion]:[]):[];
   return {data:list.filter(row=>predicates.every(([k,v])=>{
    if(k==='user_id')return v===A;
    if(k==='plan_id')return v===P;
    return row[k]===v;
   }))};
  });
 }
 };return q;},
 rpc(name,args){rpc.push({name,args});throw Error('review must not call RPC')}
};
const scope=vm.createContext({
 LemmaAccount:{get user(){return current?{id:current}:null},
  get client(){return client},onIdentityChange(fn){identityChange=fn}},
 LemmaCloud:{async accountToken(c,u){assert.equal(c,client);assert.equal(u,current);return 'token'}},
 indexedDB,crypto:webcrypto,structuredClone,Date,
 get navigator(){return {onLine:!offline}}
});
vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+
 '\nglobalThis.api=StudyPlan;',scope);
const api=scope.api;
const input={planId:P,expectedRevision:1,title:'Group theory',
 objective:'Derive theorems',snapshot:proposal,changeSummary:'Insert missing prerequisite',
 source:'Claude',proposalId:C};
const rejects=async(p,re)=>assert.rejects(p,re);
(async()=>{
 assert.equal(api.ready,false);
 assert.equal(await api.reviewPendingAmendment(P),null,'no draft never reads server');
 assert.equal(reads.length,0);
 const draft=await api.savePlanDraft(input);
 assert.equal(draft.status,'draft');
 const result=await api.reviewPendingAmendment(P);
 assert.equal(result.status,'review');
 assert.equal(result.expectedRevision,1);
 assert.equal(result.expectedLocalRevision,1);
 assert.equal(result.draftId,C);
 assert.deepEqual([...result.diff.added],['cp-new']);
 assert.deepEqual([...result.diff.modified.map(x=>x.checkpointId)],['cp-4']);
 assert.equal(result.diff.unchanged.length,11);
 assert.equal(rpc.length,0,'no consent, event or publication from review');
 assert.ok(reads.every(r=>r.predicates.some(([k,v])=>k==='user_id'&&v===A)));
 assert.equal(reads.filter(r=>r.table==='study_plans').length,2,
  'pinned plan revision is re-read after assembling review');

 livePlan={id:P,revision:2};
 const stale=await api.reviewPendingAmendment(P);
 assert.equal(stale.status,'stale');
 assert.equal(stale.currentRevision,2);
 assert.equal(rpc.length,0);
 livePlan={id:P,revision:1};liveVersion={...liveVersion,context_id:D,context_revision:3};
 assert.equal((await api.reviewPendingAmendment(P)).status,'stale_context');
 liveVersion={revision:1,context_id:null,context_revision:null,snapshot:approved};

 offline=true;
 await rejects(api.reviewPendingAmendment(P),/offline/);
 offline=false;
 liveVersion=null;
 await rejects(api.reviewPendingAmendment(P),/Accepted study plan version unavailable/);
 liveVersion={revision:1,context_id:null,context_revision:null,snapshot:approved};
 livePlan=null;
 await rejects(api.reviewPendingAmendment(P),/Published study plan unavailable/);
 livePlan={id:P,revision:1};

 // Identity switch during a server read returns no foreign plan or diff.
 beforeRead=async(table)=>{if(table==='study_plans'){
  current=B;identityChange();beforeRead=()=>{};
 }};
 await rejects(api.reviewPendingAmendment(P),/Account changed/);
 current=A;identityChange();
 assert.equal(await api.reviewPendingAmendment(P).then(x=>x.status),'review');
 current=B;identityChange();
 assert.equal(await api.reviewPendingAmendment(P),null,
  'other owner has a distinct draft namespace');
 current=A;identityChange();
 await api.approvePlanDraft(P,1,true);
 await rejects(api.reviewPendingAmendment(P),/not an unapproved draft/);
 assert.equal(rpc.length,0);
 console.log('PASS PLAN-01 P4b1: owner-pinned approved revision, 12-checkpoint diff, stale/context/offline/identity guards, no approval or writes');
})().catch(e=>{console.error('FAIL P4b1: '+e.stack);process.exitCode=1});
