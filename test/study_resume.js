'use strict';
// PLAN-01 P4c3: proof selection and hint state survive a page/module reload.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const PLAN='00000000-0000-4000-8000-000000000003';
const SESSION='00000000-0000-4000-8000-000000000004';
const ID1='00000000-0000-4000-8000-000000000010';
const ID2='00000000-0000-4000-8000-000000000011';
const ID3='00000000-0000-4000-8000-000000000012';
let owner=A,offline=false,beforeRead=async()=>{},notify=()=>{};
let revision=3,statusOverride=null,seq=0,planDeleted=false;
const reads=[],rpc=[],events=[],ids=new Map();
const checkpoints=Array.from({length:12},(_,i)=>({
 checkpoint_id:'cp-'+(i+1),title:'Checkpoint '+(i+1),
 objective:'Construct proof '+(i+1),
 prerequisite_checkpoint_ids:i?['cp-'+i]:[],
 source_refs:['synthetic:chapter-'+(i+1)]
}));
const records=table=>{
 if(table==='study_plans')return planDeleted ? [] : [{id:PLAN,revision,
  user_id:A,title:'Topology',updated_at:'2026-10-28T00:00:00Z'}];
 if(table==='study_plan_versions')return [{plan_id:PLAN,
  revision,context_id:null,context_revision:null,
  snapshot:{checkpoints},user_id:A}];
 if(table==='study_checkpoints')return checkpoints.map(cp=>({
  user_id:A,plan_id:PLAN,checkpoint_id:cp.checkpoint_id,title:cp.title,
  status:statusOverride?.[cp.checkpoint_id]||'not_started',
  progress_details:{}
 }));
 if(table==='learning_sessions')return [{id:SESSION,plan_id:PLAN,
  state:'active',updated_at:'2026-10-28T00:00:00Z',user_id:A}];
 if(table==='learning_events')return events.map(e=>({...e,user_id:A,session_id:SESSION}));
 return [];
};
const client={
 from(table){
  const query={filters:[],sort:null,count:null,
   select(){return this},
   eq(k,v){this.filters.push([k,v]);return this},
   order(k,options){this.sort={key:k,descending:options?.ascending===false};return this},
   limit(n){this.count=n;return this},
   setHeader(k,v){
    assert.equal(k,'Authorization');assert.equal(v,'Bearer test-token');
    const filters=[...this.filters],sort=this.sort,count=this.count;
    reads.push({table,filters});
    return Promise.resolve().then(async()=>{
     await beforeRead();
     let result=records(table).filter(row=>
      filters.every(([key,value])=>row[key]===value));
     if(sort)result.sort((x,y)=>sort.descending?
       (y[sort.key]>x[sort.key]?1:y[sort.key]<x[sort.key]?-1:0):
       (x[sort.key]>y[sort.key]?1:x[sort.key]<y[sort.key]?-1:0));
     if(count!=null)result=result.slice(0,count);
     return {data:result};
    });
   }
  };return query;
 },
 rpc(name,args){
  assert.equal(name,'record_study_event');rpc.push(args);
  return {setHeader(k,v) {
   assert.equal(k,'Authorization');assert.equal(v,'Bearer test-token');
   return Promise.resolve().then(()=>{
    if(revision!==args.p_expected_plan_revision)
      return {data:null,error:{message:'stale_plan_revision'}};
    const existing=ids.get(args.p_event_id);
    if(existing)return {data:existing};
    const result={eventId:args.p_event_id,sessionId:SESSION,
      seq:++seq,planRevision:revision};
    events.push({event_id:result.eventId,seq:result.seq,
      event_type:args.p_event_type,created_at:'timestamp',
      payload:{checkpoint_id:args.p_checkpoint_id,
        plan_revision:revision,data:args.p_payload}});
    ids.set(args.p_event_id,result);
    return {data:result};
   });
  }};
 }
};
function load(){
 const scope=vm.createContext({
  LemmaAccount:{get user(){return owner?{id:owner}:null},
   get client(){return client},onIdentityChange(fn){notify=fn}},
  LemmaCloud:{async accountToken(c,u){
   assert.equal(c,client);assert.equal(u,owner);return 'test-token';
  }},
  crypto:webcrypto,Date,
  get navigator(){return {onLine:!offline}}
 });
 vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+
  '\nglobalThis.study=StudyPlan;',scope);
 return scope.study;
}
(async()=>{
 let first=load();
 assert.equal(first.ready,false);
 assert.equal((await first.activeContext()).checkpoint.id,'cp-1',
  'without events, select the first pending checkpoint');
 await first.recordEvent({planId:PLAN,checkpointId:'cp-3',
  expectedPlanRevision:3,type:'attempt',
  payload:{text:'My compactness proof, unfinished at the finite subcover'},
  eventId:ID1,source:'student'});
 await first.recordEvent({planId:PLAN,checkpointId:'cp-3',
  expectedPlanRevision:3,type:'hint',
  payload:{text:'Focus on an open cover',level:2},
  eventId:ID2,source:'student'});
 const reload=load(); // new page/module, same server/immutable ledger
 const resumed=await reload.activeContext();
 assert.equal(resumed.checkpoint.id,'cp-3','latest proof beats earlier not_started');
 assert.equal(resumed.lastAttempt.payload.text,
  'My compactness proof, unfinished at the finite subcover');
 assert.equal(resumed.hintLevel,2);
 assert.equal(resumed.lastAttempt.eventId,ID1);
 assert.deepEqual([...resumed.sourceRefs],['synthetic:chapter-3']);
 assert.equal(events.length,2,'rendering/resuming cannot append evidence');
 // Two demonstrated checkpoints: last proof activity for cp-7 takes focus.
 await reload.recordEvent({planId:PLAN,checkpointId:'cp-7',
  expectedPlanRevision:3,type:'proof_step',
  payload:{text:'I need to justify the final implication'},
  eventId:ID3,source:'student'});
 const anotherReload=load();
 assert.equal((await anotherReload.activeContext()).checkpoint.id,'cp-7');
 assert.equal((await anotherReload.activeContext()).lastAttempt.payload.text,
  'I need to justify the final implication');
 statusOverride={'cp-7':'completed'};
 assert.equal((await load().activeContext()).checkpoint.id,'cp-3',
  'completed checkpoint cannot steal unfinished proof focus');
 statusOverride={'cp-9':'in_progress'};
 assert.equal((await load().activeContext()).checkpoint.id,'cp-9',
  'explicit in-progress state overrides inferred latest proof');
 statusOverride=null;
 revision=4;
 assert.equal((await load().activeContext()).checkpoint.id,'cp-1',
  'older plan revision activity does not auto-apply to a new plan revision');
 await assert.rejects(anotherReload.recordEvent({planId:PLAN,checkpointId:'cp-7',
  expectedPlanRevision:3,type:'attempt',payload:{text:'stale'},
  eventId:'00000000-0000-4000-8000-000000000013'}),/stale_plan_revision/);
 assert.equal(events.length,3);
 revision=3;
 offline=true;
 await assert.rejects(load().activeContext(),/offline/);
 offline=false;
 owner=B;notify();
 assert.equal(await load().activeContext(),null,'other owner sees no plan or proof');
 owner=A;notify();
 let changed=false;
 beforeRead=async()=>{if(!changed){changed=true;owner=B;notify();}};
 await assert.rejects(load().activeContext(),/Account changed/);
 owner=A;notify();beforeRead=async()=>{};
 assert.equal((await load().activeContext()).checkpoint.id,'cp-7');
 assert.ok(reads.every(r=>r.filters.some(([k,v])=>k==='user_id'&&(v===A||v===B))),
  'all plan/event reads are owner scoped');
 assert.equal(rpc.length,4,'only explicit event calls may write');
 // An accepted amendment must retain immutable historical evidence without
 // displaying an old proof/hint/feedback as if it belonged to revision 4.
 const oldRevisionDetails=[
  ['feedback',{text:'Rev 3 feedback'},'00000000-0000-4000-8000-000000000014'],
  ['mastery_evidence',{text:'Rev 3 evidence'},'00000000-0000-4000-8000-000000000015'],
  ['session_note',{text:'Rev 3 next action'},'00000000-0000-4000-8000-000000000016']
 ];
 for(const [type,payload,eventId] of oldRevisionDetails)
  await load().recordEvent({planId:PLAN,checkpointId:'cp-3',
   expectedPlanRevision:3,type,payload,eventId,source:'student'});
 const historicalCount=events.length;
 assert.equal(historicalCount,6,'all original proof and detail events remain');
 revision=4;statusOverride={'cp-3':'in_progress'};
 const amended=await load().activeContext();
 assert.equal(amended.checkpoint.id,'cp-3',
  'a checkpoint can remain explicitly in progress after amendment');
 assert.equal(amended.lastAttempt,null,'old-revision proof must not appear as current');
 assert.equal(amended.hintLevel,0,'old-revision hint level must not carry over');
 assert.equal(amended.lastFeedback,null,'old-revision feedback is historical');
 assert.equal(amended.lastEvidence,null,'old-revision evidence is historical');
 assert.equal(amended.nextAction,null,'old-revision next action is historical');
 assert.equal(events.length,historicalCount,'reads must not erase old evidence');
 const amendedReadCalls=rpc.length;
 const freshId='00000000-0000-4000-8000-000000000017';
 await load().recordEvent({planId:PLAN,checkpointId:'cp-3',
  expectedPlanRevision:4,type:'attempt',
  payload:{text:'New proof following the amended prerequisite'},
  eventId:freshId,source:'student'});
 await load().recordEvent({planId:PLAN,checkpointId:'cp-3',
  expectedPlanRevision:4,type:'hint',payload:{text:'Use the new lemma',level:1},
  eventId:'00000000-0000-4000-8000-000000000018',source:'student'});
 const current=await load().activeContext();
 assert.equal(current.lastAttempt.eventId,freshId);
 assert.equal(current.lastAttempt.payload.text,
  'New proof following the amended prerequisite');
 assert.equal(current.hintLevel,1,'only current revision hints set the level');
 assert.equal(current.lastFeedback,null);
 assert.equal(current.lastEvidence,null);
 assert.equal(current.nextAction,null);
 assert.equal(events.filter(e=>e.payload.plan_revision===3).length,historicalCount,
  'prior accepted revision history is preserved without rewriting');
 assert.equal(rpc.length,amendedReadCalls+2,'only two deliberate new events write');

 // Another device can publish an approved amendment while this page is
 // reading checkpoint and event state. The read must never return revision 3
 // as the current plan once revision 4 is committed mid-request.
 revision=3;statusOverride=null;
 const evidenceCount=events.length,writeCount=rpc.length;
 let published=false;
 beforeRead=async()=>{
  if(!published && reads.at(-1)?.table==='learning_events'){
   published=true;revision=4;
  }
 };
 await assert.rejects(load().activeContext(),
  /Approved study plan changed; reload checkpoint/,
  'a concurrent publication must invalidate the in-flight context packet');
 assert.equal(published,true,'test must actually publish during the event read');
 assert.equal(revision,4);
 assert.equal(events.length,evidenceCount,'stale read cannot mutate proof history');
 assert.equal(rpc.length,writeCount,'stale read cannot write or approve anything');

 // The same rule applies when the plan is removed from the current owner.
 revision=3;beforeRead=async()=>{};
 let removed=false;
 beforeRead=async()=>{
  if(!removed && reads.at(-1)?.table==='learning_events'){
   removed=true;planDeleted=true;
  }
 };
 await assert.rejects(load().activeContext(),
  /Approved study plan changed; reload checkpoint/,
  'deleted plan must not produce a supposedly current checkpoint');
 assert.equal(removed,true);
 planDeleted=false;beforeRead=async()=>{};
 const fresh=await load().activeContext();
 assert.equal(fresh.planRevision,3,'a stable approved revision still resumes');
 assert.equal(events.length,evidenceCount);
 assert.equal(rpc.length,writeCount);
 assert.ok(reads.every(r=>r.filters.some(([k,v])=>k==='user_id'&&(v===A||v===B))),
  'initial and final plan reads must both remain owner scoped');
 console.log('PASS PLAN-01 P5f: twelve checkpoints, revision-pinned evidence, concurrent publication/deletion fail closed, stable resume, no extra writes');
})().catch(e=>{console.error('FAIL PLAN-01 P4c3: '+e.stack);process.exitCode=1});
