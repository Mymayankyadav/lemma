'use strict';
// PLAN-01 P4c3: proof selection and hint state survive a page/module reload.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const PLAN='00000000-0000-4000-8000-000000000003';
const NEW_PLAN='00000000-0000-4000-8000-000000000006';
const SESSION='00000000-0000-4000-8000-000000000004';
const SESSION2='00000000-0000-4000-8000-000000000005';
const ID1='00000000-0000-4000-8000-000000000010';
const ID2='00000000-0000-4000-8000-000000000011';
const ID3='00000000-0000-4000-8000-000000000012';
let owner=A,offline=false,beforeRead=async()=>{},notify=()=>{};
let revision=3,statusOverride=null,seq=0,planDeleted=false;
let activeSessionId=SESSION,sessionState='active',newPlanPublished=false;
const reads=[],rpc=[],events=[],ids=new Map();
const checkpoints=Array.from({length:12},(_,i)=>({
 checkpoint_id:'cp-'+(i+1),title:'Checkpoint '+(i+1),
 objective:'Construct proof '+(i+1),
 prerequisite_checkpoint_ids:i?['cp-'+i]:[],
 source_refs:['synthetic:chapter-'+(i+1)]
}));
const records=table=>{
 if(table==='study_plans')return planDeleted ? [] : [
  {id:PLAN,revision,user_id:A,title:'Topology',
   updated_at:'2026-10-28T00:00:00Z'},
  ...(newPlanPublished ? [{id:NEW_PLAN,revision:1,user_id:A,
   title:'New approved plan',updated_at:'2026-10-29T00:00:00Z'}] : [])
 ];
 if(table==='study_plan_versions')return [
  {plan_id:PLAN,revision,context_id:null,context_revision:null,
   snapshot:{checkpoints},user_id:A},
  ...(newPlanPublished ? [{plan_id:NEW_PLAN,revision:1,
   context_id:null,context_revision:null,snapshot:{checkpoints},user_id:A}] : [])
 ];
 if(table==='study_checkpoints')return checkpoints.map(cp=>({
  user_id:A,plan_id:PLAN,checkpoint_id:cp.checkpoint_id,title:cp.title,
  status:statusOverride?.[cp.checkpoint_id]||'not_started',
  progress_details:{}
 }));
 if(table==='learning_sessions')return sessionState==='active' ?
  [{id:activeSessionId,plan_id:PLAN,state:'active',
    updated_at:'2026-10-28T00:00:00Z',user_id:A}] : [];
 if(table==='learning_events')return events.map(e=>({...e,user_id:A,session_id:SESSION}));
 return [];
};
const client={
 from(table){
  const query={filters:[],less:[],sort:null,count:null,
   select(){return this},
   eq(k,v){this.filters.push([k,v]);return this},
   lt(k,v){this.less.push([k,v]);return this},
   order(k,options){this.sort={key:k,descending:options?.ascending===false};return this},
   limit(n){this.count=n;return this},
   setHeader(k,v){
    assert.equal(k,'Authorization');assert.equal(v,'Bearer test-token');
    const filters=[...this.filters],less=[...this.less],sort=this.sort,count=this.count;
    reads.push({table,filters});
    return Promise.resolve().then(async()=>{
     await beforeRead();
     let result=records(table).filter(row=>
      filters.every(([key,value])=>
       (key==='payload->>checkpoint_id'?row.payload?.checkpoint_id:row[key])===value) &&
       less.every(([key,value])=>row[key]<value));
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
 assert.equal(first.ready,true);
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
 const manual=await reload.activeContext({planId:PLAN,checkpointId:'cp-12'});
 assert.equal(manual.checkpoint.id,'cp-12','student can choose any approved checkpoint');
 assert.equal(manual.lastAttempt,null,'selection must not inherit another checkpoint proof');
 assert.equal(manual.checkpoints.length,12);
 assert.equal((await reload.activeContext({checkpointId:'cp-3'})).lastAttempt.eventId,ID1);
 await assert.rejects(reload.activeContext({checkpointId:'unknown'}),/not in the current approved plan/);
 await assert.rejects(reload.activeContext({planId:NEW_PLAN,checkpointId:'cp-3'}),/changed/);
 assert.equal(events.length,2,'explicit checkpoint selection is read-only');
 // Automatic resume must search past non-resumable activity in the session.
 for(let i=0;i<55;i++)events.push({event_id:'noise-'+i,seq:100+i,event_type:'feedback',
   payload:{checkpoint_id:'cp-12',plan_revision:3,data:{text:'Other feedback'}}});
 events.push({event_id:'obsolete-attempt',seq:200,event_type:'attempt',
   payload:{checkpoint_id:'cp-12',plan_revision:2,data:{text:'Old plan'}}});
 const autoBusy=await reload.activeContext();
 assert.equal(autoBusy.checkpoint.id,'cp-3','resume past fifty non-resumable events');
 assert.equal(autoBusy.lastAttempt.eventId,ID1);
 assert.equal(autoBusy.hintLevel,2);
 let globalPageReads=0;
 beforeRead=async()=>{
  const r=reads.at(-1);
  if(r?.table==='learning_events' && !r.filters.some(([key])=>key==='payload->>checkpoint_id') && ++globalPageReads===2)
   {owner=B;notify();}
 };
 await assert.rejects(reload.activeContext(),/Account changed/);
 beforeRead=async()=>{};owner=A;notify();
 events.splice(2);
 // Newer activity on other checkpoints must not evict this proof or hint.
 for(let i=0;i<55;i++)events.push({event_id:'other-'+i,seq:100+i,event_type:'session_note',
   payload:{checkpoint_id:'cp-12',plan_revision:3,data:{text:'Other work'}}});
 const busy=await reload.activeContext({planId:PLAN,checkpointId:'cp-3'});
 assert.equal(busy.lastAttempt.eventId,ID1);
 assert.equal(busy.hintLevel,2);
 events.splice(2);
 // A long same-checkpoint feedback trail must not evict the older proof/hint.
 for(let i=0;i<51;i++)events.push({event_id:'same-'+i,seq:200+i,event_type:'feedback',
   payload:{checkpoint_id:'cp-3',plan_revision:3,data:{text:'Feedback'}}});
 const longProof=await reload.activeContext({planId:PLAN,checkpointId:'cp-3'});
 assert.equal(longProof.lastAttempt.eventId,ID1);
 assert.equal(longProof.hintLevel,2);
 let pageReads=0;
 beforeRead=async()=>{
  const r=reads.at(-1);
  if(r?.table==='learning_events' && r.filters.some(([key])=>key==='payload->>checkpoint_id') && ++pageReads===2)
   {owner=B;notify();}
 };
 await assert.rejects(reload.activeContext({planId:PLAN,checkpointId:'cp-3'}),/Account changed/);
 beforeRead=async()=>{};owner=A;notify();
 events.splice(2);
 // Newer evidence from an old plan revision must not hide eligible legacy rows.
 for(let i=0;i<55;i++)events.push({event_id:'old-'+i,seq:300+i,event_type:'attempt',
   payload:{checkpoint_id:'cp-3',plan_revision:2,data:{text:'old version'}}});
 events.push({event_id:'legacy-hint',seq:290,event_type:'hint',
   payload:{checkpoint_id:'cp-3',data:{level:4}}});
 const legacy=await reload.activeContext({planId:PLAN,checkpointId:'cp-3'});
 assert.equal(legacy.lastAttempt.eventId,ID1);
 assert.equal(legacy.hintLevel,4);
 events.splice(2);
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

 // A different device can rotate the active learning session after the
 // first session query but before the selected proof/hint events return.
 // Returning the old sessionId would attach a tutor to obsolete work.
 let rotated=false;
 beforeRead=async()=>{
  if(!rotated && reads.at(-1)?.table==='learning_events'){
   rotated=true;activeSessionId=SESSION2;
  }
 };
 await assert.rejects(load().activeContext(),
  /Active study session changed; reload checkpoint/,
  'concurrent session replacement must invalidate stale proof context');
 assert.equal(rotated,true,'test must rotate while events are in flight');
 assert.equal(activeSessionId,SESSION2);
 assert.equal(events.length,evidenceCount,'session rotation cannot delete proof history');
 assert.equal(rpc.length,writeCount,'session rotation cannot append evidence');

 // The same check rejects an ended session when no successor is active.
 activeSessionId=SESSION;sessionState='active';beforeRead=async()=>{};
 let ended=false;
 beforeRead=async()=>{
  if(!ended && reads.at(-1)?.table==='learning_events'){
   ended=true;sessionState='ended';
  }
 };
 await assert.rejects(load().activeContext(),
  /Active study session changed; reload checkpoint/,
  'a completed session must not be returned as still active');
 assert.equal(ended,true);
 sessionState='active';beforeRead=async()=>{};
 const stableSession=await load().activeContext();
 assert.equal(stableSession.sessionId,SESSION,
  'unchanged active session still resumes the exact unfinished proof');
 assert.equal(stableSession.checkpoint.id,'cp-3',
  'latest unfinished session note remains the resume target');
 assert.equal(stableSession.lastAttempt.eventId,ID1);
 assert.equal(stableSession.hintLevel,2);
 assert.equal(events.length,evidenceCount);
 assert.equal(rpc.length,writeCount);
 assert.ok(reads.every(r=>r.filters.some(([k,v])=>k==='user_id'&&(v===A||v===B))),
  'session rechecks must also be owner scoped');

 // A different plan can become the latest approved plan while this tab reads
 // the old plan's proof. Its unchanged revision is not sufficient evidence
 // that the old packet is still the active one.
 let switched=false;
 beforeRead=async()=>{
  if(!switched && reads.at(-1)?.table==='learning_events'){
   switched=true;newPlanPublished=true;
  }
 };
 await assert.rejects(load().activeContext(),
  /Approved study plan changed; reload checkpoint/,
  'a newly approved different plan must invalidate the in-flight old packet');
 assert.equal(switched,true,'test must publish a different plan during the read');
 assert.equal(events.length,evidenceCount,'switching plans cannot erase history');
 assert.equal(rpc.length,writeCount,'a read cannot approve or append events');
 beforeRead=async()=>{};
 const newContext=await load().activeContext();
 assert.equal(newContext.planId,NEW_PLAN,
  'the next fresh read must select the newer approved plan');
 assert.equal(newContext.planRevision,1);
 assert.equal(newContext.lastAttempt,null,
  'a new plan must not inherit the older plan proof');
 newPlanPublished=false;
 const oldContext=await load().activeContext();
 assert.equal(oldContext.planId,PLAN,'the old plan remains intact');
 assert.equal(oldContext.lastAttempt.eventId,ID1);
 assert.ok(reads.every(r=>r.filters.some(([k,v])=>k==='user_id'&&(v===A||v===B))),
  'latest-plan recheck must remain owner scoped');
 // P5i: a different device may finish the selected checkpoint after the
 // first checkpoint-status query but before the immutable proof events load.
 // The approved plan and session stay identical; the read must still fail.
 const checkpointRaceEvents=events.length,checkpointRaceWrites=rpc.length;
 let completedDuringRead=false;
 beforeRead=async()=>{
  if(!completedDuringRead && reads.at(-1)?.table==='learning_events'){
   completedDuringRead=true;statusOverride={'cp-3':'completed'};
  }
 };
 await assert.rejects(load().activeContext(),
  /Study checkpoint status changed; reload checkpoint/,
  'a newly completed checkpoint must not return stale in-progress proof');
 assert.equal(completedDuringRead,true,'test must change status during event read');
 assert.equal(events.length,checkpointRaceEvents,'stale status cannot erase evidence');
 assert.equal(rpc.length,checkpointRaceWrites,'read must not write a checkpoint');
 statusOverride=null;beforeRead=async()=>{};
 const stableCheckpoint=await load().activeContext();
 assert.equal(stableCheckpoint.checkpoint.id,'cp-3',
  'unchanged checkpoint statuses still resume the original proof');
 assert.equal(stableCheckpoint.lastAttempt.eventId,ID1);

 // A newly in-progress checkpoint elsewhere must also invalidate the old
 // selected proof even though the old checkpoint's status is unchanged.
 let changedFocus=false;
 beforeRead=async()=>{
  if(!changedFocus && reads.at(-1)?.table==='learning_events'){
   changedFocus=true;statusOverride={'cp-9':'in_progress'};
  }
 };
 await assert.rejects(load().activeContext(),
  /Study checkpoint status changed; reload checkpoint/,
  'new explicit in-progress focus must invalidate prior proof selection');
 assert.equal(changedFocus,true);
 assert.equal(events.length,checkpointRaceEvents);
 assert.equal(rpc.length,checkpointRaceWrites);
 beforeRead=async()=>{};
 const freshFocus=await load().activeContext();
 assert.equal(freshFocus.checkpoint.id,'cp-9',
  'fresh read must follow the new explicit in-progress checkpoint');
 statusOverride=null;
 assert.ok(reads.every(r=>r.filters.some(([k,v])=>k==='user_id'&&(v===A||v===B))),
  'checkpoint consistency reads remain owner scoped');
 // Even a change while the final approved-plan check is in flight must
 // be detected by the last checkpoint-status read before returning context.
 let armedLate=false,changedLate=false;
 beforeRead=async()=>{
  const table=reads.at(-1)?.table;
  if(table==='learning_events')armedLate=true;
  if(armedLate && table==='study_plans' && !changedLate){
   changedLate=true;statusOverride={'cp-3':'completed'};
  }
 };
 await assert.rejects(load().activeContext(),
  /Study checkpoint status changed; reload checkpoint/,
  'late checkpoint completion must not escape after plan consistency check');
 assert.equal(changedLate,true,'late race must fire during final plan read');
 assert.equal(events.length,checkpointRaceEvents);
 assert.equal(rpc.length,checkpointRaceWrites);
 beforeRead=async()=>{};statusOverride=null;
 assert.equal((await load().activeContext()).checkpoint.id,'cp-3',
  'stable checkpoint remains resumable after late-race rejection');
 console.log('PASS PLAN-01 P5i: twelve checkpoints, plan/session/checkpoint races fail closed, immutable proof resume');
})().catch(e=>{console.error('FAIL PLAN-01 P4c3: '+e.stack);process.exitCode=1});

