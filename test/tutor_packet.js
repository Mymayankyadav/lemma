'use strict';
// TUTOR-01 T1: pure, offline, host-independent mock StudyPlan packet tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({TextEncoder});
vm.runInContext(fs.readFileSync('src/app/tutor_handoff.js','utf8') +
  '\nglobalThis.TutorAPI = TutorHandoff;',context);
const api = context.TutorAPI;
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
const D = '00000000-0000-4000-8000-000000000004';
const E = '00000000-0000-4000-8000-000000000005';
const studyPlanMock = {
  async activeContext() { return {
    planId:A, planRevision:5, contextId:B, contextRevision:3,
    checkpoint:{id:'compactness-open-cover-proof', title:'Compactness',
      objective:'Prove a compact subset of a Hausdorff space is closed',status:'in_progress'},
    sessionId:C, hintLevel:1,
    lastAttempt:{eventId:D, type:'attempt',payload:{text:'I tried a finite subcover of K itself, but this seems circular.'}},
    misconceptions:['finite subcover applied to wrong family'],
    sourceRefs:['topology-notes:section-3.2'],
    citedExcerpts:[{ref:'topology-notes:section-3.2',text:'A compact set has the finite subcover property.'}],
    nextTutorAction:'Ask for separating neighbourhoods of x and each point of K',
    pendingPlanAmendment:false,
    secret_access_token:'must never be exported',
    fullTextbook:'entire book content must never be copied'
  }; }
};
const validReply = () => ({
  schema:'lemma.tutor_reply.v1', contract_version:1, plan_id:A,
  checkpoint_id:'compactness-open-cover-proof', expected_plan_revision:5,
  events:[{event_id:E,type:'hint',payload:{level:2,question:'Which points require separation?'},source:'ChatGPT'}],
  card_proposals:[],amendment_proposal:null
});
(async () => {
  assert.equal(api.ready,false, 'T1 must remain hidden');
  const context1 = await studyPlanMock.activeContext();
  const packet = api.exportPacket(context1);
  assert.ok(packet.markdown.includes('```json'));
  assert.equal(packet.json.schema,'lemma.tutor_handoff.v1');
  assert.equal(packet.json.plan_revision,5);
  assert.equal(packet.json.context_revision,3);
  assert.equal(packet.json.checkpoint_id,'compactness-open-cover-proof');
  assert.equal(packet.json.hint_level,1);
  assert.equal(packet.json.last_student_attempt_event,D);
  assert.match(packet.json.last_student_attempt,/circular/);
  assert.equal(packet.json.cited_excerpts[0].ref,'topology-notes:section-3.2');
  assert.ok(!packet.markdown.includes('secret_access_token'));
  assert.ok(!packet.markdown.includes('fullTextbook'));
  assert.ok(!packet.markdown.includes('entire book content'));
  assert.ok(new TextEncoder().encode(packet.markdown).length <= 32768);
  const fenceSafe = api.exportPacket({...context1,lastAttempt:{eventId:D,text:'Begin ```json then the proof'}});
  assert.ok(!fenceSafe.markdown.includes('Begin ```json'), 'markdown fence escaped');
  const jsonExtract = JSON.parse(packet.markdown.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(jsonExtract, JSON.parse(JSON.stringify(packet.json)));
  assert.deepEqual(api.exportPacket(context1).json,packet.json,'stable cross-tutor packet');
  // Claude -> ChatGPT -> Claude needs only the packet and saved hint/attempt.
  assert.equal(packet.json.last_student_attempt_event,D);
  assert.equal(packet.json.hint_level,1);
  assert.match(packet.json.next_tutor_action,/neighbourhoods/);
  const valid = validReply();
  const parsed = api.parseReply(JSON.stringify(valid));
  assert.equal(parsed.ok,true,JSON.stringify(parsed.errors));
  assert.equal(parsed.events.length,1);
  assert.equal(parsed.events[0].eventId,E);
  assert.equal(parsed.events[0].expectedPlanRevision,5);
  assert.equal(parsed.events[0].checkpointId,'compactness-open-cover-proof');
  assert.equal(parsed.events[0].payload.level,2);
  assert.equal(api.parseReply('```json\n'+JSON.stringify(valid)+'\n```').ok,true);
  const second = {...valid,events:[],card_proposals:[{
    proposal_id:E,type:'basic',title:'Hausdorff compact',
    front:'Why is a compact subset of a Hausdorff space closed?',
    back:'Separate each exterior point from every point of K, then take a finite subcover.',
    tags:['topology'],requires:[],source_refs:['topology-notes:section-3.2']
  }]};
  const suggested = api.parseReply(JSON.stringify(second));
  assert.equal(suggested.ok,true);
  assert.equal(suggested.cardProposals[0].sourceRefs[0], 'topology-notes:section-3.2');
  assert.ok(!('approved' in suggested.cardProposals[0]));
  const third = {...valid,events:[],amendment_proposal:{
    proposal_id:E,expected_revision:5,snapshot:{checkpoints:[{checkpoint_id:'prerequisite'}]},
    change_summary:'Add prerequisite before proof',source:'Claude'
  }};
  assert.equal(api.parseReply(JSON.stringify(third)).amendmentProposal.expectedRevision,5);
  const invalid = (reply, reason) => {
    const result = api.parseReply(typeof reply === 'string' ? reply : JSON.stringify(reply));
    assert.equal(result.ok,false,reason);
    assert.equal(result.events.length,0,'invalid reply cannot partially accept events');
    assert.equal(result.cardProposals.length,0);
    assert.equal(result.amendmentProposal,null);
    assert.ok(result.errors.length > 0);
  };
  invalid('{invalid', 'malformed JSON');
  invalid('hello\n'+JSON.stringify(valid), 'extra prose rejected');
  invalid({...valid,schema:'other'}, 'schema mismatch');
  invalid({...valid,contract_version:2}, 'future version rejected');
  invalid({...valid,plan_id:'../../another-plan'},'plan ID');
  invalid({...valid,checkpoint_id:'a\nmalformed'},'checkpoint ID');
  invalid({...valid,expected_plan_revision:0},'revision');
  invalid({...valid,expected_plan_revision:'5'},'revision string');
  invalid({...valid,approved:true}, 'unknown top-level fields');
  invalid({...valid,events:[{...valid.events[0],event_id:'not-a-uuid'}]},'event ID');
  invalid({...valid,events:[{...valid.events[0],type:'mastery_complete'}]},'unknown event');
  invalid({...valid,events:[{...valid.events[0],payload:'text'}]},'payload not JSON object');
  invalid({...valid,events:[{...valid.events[0],role:'system'}]},'untrusted event role');
  invalid({...valid,events:[valid.events[0],valid.events[0]]},'repeated event ID');
  invalid({...valid,events:[{...valid.events[0],payload:JSON.parse('{"__proto__":{"isAdmin":true}}')}]},'prototype pollution');
  invalid({...valid,card_proposals:[{...second.card_proposals[0],type:'arbitrary'}],events:[]},'card type');
  invalid({...valid,amendment_proposal:{...third.amendment_proposal,expected_revision:4}},'stale amendment');
  invalid('{"schema":"lemma.tutor_reply.v1","contract_version":1,"plan_id":"'+A+'","checkpoint_id":"a","expected_plan_revision":5,"events":[],"card_proposals":[],"amendment_proposal":null,"__proto__":{}}','dangerous fields');
  invalid(' '.repeat(65537), 'large reply');
  assert.throws(()=>api.exportPacket({...context1,planRevision:0}),/approved revision/);
  assert.throws(()=>api.exportPacket({...context1,sourceRefs:[],citedExcerpts:context1.citedExcerpts}),/citation/);
  assert.throws(()=>api.exportPacket({...context1,lastAttempt:{eventId:D,text:'x'.repeat(8001)}}),/last attempt/);
  assert.throws(()=>api.exportPacket({...context1,sourceRefs:['ref'],citedExcerpts:[{ref:'ref',text:'😀'.repeat(1500)}]}),/excerpt|32 KB/);
  console.log('PASS TUTOR-01 T1: bounded portable packet, exact proof/hint resume, strict untrusted schema, consent-safe proposals');
})().catch(e=>{console.error('FAIL TUTOR-01 T1: '+e.stack);process.exitCode=1;});
