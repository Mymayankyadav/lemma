import {expect,it} from 'vitest';
import {assessmentsFromExport,audit,design,evaluateTrial,report} from '../../../research/sim/exam-evaluation.mjs';
import {applyR0,r0Import} from '../../../scripts/exam/import-r0.mjs';
import {noticePlan} from '../../../supabase/functions/push/notice';
it('counterbalances disjoint families and refuses retrospective or incomplete data',async()=>{
  const blocks=[['a','b','c'],['d','e','f'],['g','h','i']];
  const assignments=design(blocks);
  expect(assignments.filter(x=>x.position===0).map(x=>x.policy)).toEqual(['atlas','weighted','adaptive']);
  expect(()=>design([['a','a','b']])).toThrow();expect((await report()).trial.recommendation).toBe('keep-off');
  const trial={source:'observed',blocks,registeredAt:'2026-10-01',gate:{minimumMarksPer100:3,allowedDelayedLoss:4,maxReentryMinutes:10,maxReviewMinutes:10},
    returnComparisons:[{snapshotHash:'s',preExamSnapshotHash:'s',delayDays:21,
      full:{proof:.7,recall:.8,minutes:4,wronglySkipped:0,repeatDiagnostics:0},preExam:{proof:.6,recall:.7,minutes:8,wronglySkipped:0,repeatDiagnostics:2}}],
    families:assignments.map(a=>({...a,startedAt:'2026-10-05',unseenTransfer:true,independent:true,minutes:20,delayDays:21,pretest:.3,
      transfer:a.policy==='adaptive'?.7:.6,delayedProof:.65,delayedRecall:.68,deferred:a.family==='a',
      reentryMinutes:5,reviewMinutes:4,wronglySkipped:0,repeatDiagnostics:0,prepAuthorMinutes:1,duplicateProposals:0,ideasStillUseful:2}))};
  expect(evaluateTrial(trial)).toMatchObject({recommendation:'eligible-for-independent-review',metrics:{deferredFamilies:1}});
  expect(evaluateTrial({...trial,families:trial.families.slice(1)}).recommendation).toBe('keep-off');
  const d={id:'d',decided_at:'2026-11-24',predictions:[{key:'a',p:.8,low:.4,high:.9,form:'proof',facet:'use',evidence:'shaky',priorCount:2}]};
  const a={decisionId:'d',row:'a',observedAt:'2026-11-25',marks:1,maximum:1,binary:true};
  const measured=audit([d],[a,{...a,observedAt:d.decided_at}]);expect(measured.excluded).toBe(1);expect(measured.groups['prior/1-3'].n).toBe(1);
  expect(measured.groups.all.brier).toBeCloseTo(.04);expect(measured.groups.all.logLoss).toBeCloseTo(-Math.log(.8));
});
it('matches each forecast to its first later answer in the same owner, sitting and blueprint',()=>{
  const d={id:'d',user_id:'a',sitting_id:'s',decided_at:'2026-11-23',inputs:{blueprintVersion:2},predictions:[{key:'r'}]};
  const a={id:'a1',user_id:'a',sitting_id:'s',row_key:'r',blueprint_version:2,created_at:'2026-11-24',occurred_at:'2026-11-24',
    outcome:'correct',independence:'independent',marks_possible:2,marks_awarded:2};
  const rows=[{...a,id:'a2',occurred_at:'2026-11-25',created_at:'2026-11-25'},a,{...a,id:'foreign',user_id:'b'}];
  expect(assessmentsFromExport([d],rows)).toMatchObject([{outcome_attempt_id:'a1',decisionId:'d',marks:2}]);
  expect(assessmentsFromExport([d,{...d,id:'ambiguous'}],rows)).toEqual([]);
  expect(assessmentsFromExport([d],[{...a,occurred_at:d.decided_at}])).toEqual([]);
});
it('only imports matching owner, project and tag, and never dismisses ahead of an acknowledged save',async()=>{
  const event={user_id:'u',id:6,session_id:'s',created_at:'2026-11-24',kind:'attempt',outcome:'partial',body:'EXAM TOP ROW p MARKS 2/3 45s IND'};
  const tables={exam_sittings:[{id:'e',project_id:'p',user_id:'u',blueprint:[{key:'p'}]}],projects:[{id:'p',user_id:'u',slug:'top'}],
    sessions:[{id:'s',project_id:'p',user_id:'u'}],session_events:[event,{...event,id:7,user_id:'v'}],parked_thoughts:[
    {id:'t',user_id:'u',status:'open',version:2,text:'CARD IDEA top · topo/use: State the basis | why: test | evidence: S1'}]};
  const groups=r0Import(tables,'e','TOP');expect(groups.map(g=>g.length)).toEqual([1,2]);expect(groups[0][0].patch.delivery_ref).toBe('r0:6');
  expect(r0Import(tables,'e','TOP')).toEqual(groups);const sent:string[]=[];
  await expect(applyR0(groups,async(c:{resource:string;operationId:string})=>{sent.push(c.resource);return {operationId:c.operationId,status:c.resource==='card_ideas'?'conflict':'ok'};})).rejects.toThrow();
  expect(sent).toEqual(['exam_attempts','card_ideas']);
});
it('offers each deadline reminder only after its own opt-in, at the sitting’s local time',()=>{
  const now=Date.parse('2026-11-27T03:10:00Z'),exam={id:'s',title:'Topology',slug:'topology',startsAt:'2026-11-27T04:00:00Z',zone:'Asia/Kolkata',minutes:120};
  const notices=(kinds:Record<string,boolean>,time=now)=>noticePlan({exams:[exam]}, {kinds,studyTime:'08:00'},time).candidates.filter(c=>c.key.startsWith('exam/'));
  expect(notices({})).toHaveLength(0);expect(notices({examMorning:true})[0].dueAt).toBeLessThan(now);
  expect(notices({examFollowup:true},Date.parse('2026-11-27T05:00Z'))).toHaveLength(0);
  const unknown=noticePlan({exams:[{...exam,minutes:null}]},{kinds:{examFollowup:true}},Date.parse('2026-11-27T06:01Z'));
  expect(unknown.candidates.some(c=>c.key.startsWith('exam/'))).toBe(false);
  expect(notices({examFollowup:true},Date.parse('2026-11-27T06:01Z'))[0].key).toContain('/examFollowup/');
});
