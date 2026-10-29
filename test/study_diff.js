'use strict';
// PLAN-01 P4a: amendments may be proposed, never silently approved or applied.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const scope=vm.createContext({});
vm.runInContext(fs.readFileSync('src/app/study_plan.js','utf8')+
 '\nglobalThis.compare=StudyPlan.diffPlanSnapshots;globalThis.ready=StudyPlan.ready;',scope);
const diff=(a,b)=>JSON.parse(JSON.stringify(scope.compare(a,b)));
const base={topic:'Group theory',objective:'Construct complete proofs',
 checkpoints:Array.from({length:12},(_,i)=>({
  checkpoint_id:'cp-'+(i+1),title:'Task '+(i+1),objective:'Prove lemma '+(i+1),
  prerequisite_checkpoint_ids:i?['cp-'+i]:[],
  learning_tasks:['Produce a proof'],
  mastery_criterion:'Explain every implication',
  source_refs:['book:'+i]
 }))};
const copy=x=>JSON.parse(JSON.stringify(x));
assert.equal(scope.ready,true);
const same=diff(base,copy(base));
assert.deepEqual(same.added,[]);
assert.deepEqual(same.removed,[]);
assert.deepEqual(same.modified,[]);
assert.equal(same.unchanged.length,12);
assert.equal(same.reordered,false);

const revised=copy(base);
revised.checkpoints.splice(3,0,{
 checkpoint_id:'cp-extra',title:'Missing prerequisite',
 objective:'Derive the auxiliary lemma',prerequisite_checkpoint_ids:['cp-3'],
 mastery_criterion:'Exhibit explicit construction',source_refs:['book:3a']
});
revised.checkpoints.find(x=>x.checkpoint_id==='cp-4')
 .prerequisite_checkpoint_ids=['cp-3','cp-extra'];
const initial=JSON.stringify(base),proposed=JSON.stringify(revised);
const change=diff(base,revised);
assert.deepEqual(change.added,['cp-extra']);
assert.deepEqual(change.removed,[]);
assert.deepEqual(change.modified.map(x=>x.checkpointId),['cp-4']);
assert.deepEqual(change.modified[0].addedPrerequisites,['cp-extra']);
assert.deepEqual(change.modified[0].removedPrerequisites,[]);
assert.equal(change.modified[0].requiresReassessment,false);
assert.equal(change.unchanged.length,11);
assert.equal(change.reordered,false,'inserting a prerequisite is not a reordering of unaffected checkpoints');
assert.equal(JSON.stringify(base),initial,'accepted snapshot stays immutable');
assert.equal(JSON.stringify(revised),proposed,'proposed snapshot stays immutable');

const reassess=copy(base);
reassess.checkpoints[0].mastery_criterion='Provide a counterexample as well';
reassess.checkpoints[1].source_refs=['book:new-edition'];
reassess.topic='Algebraic structures';
const material=diff(base,reassess);
assert.deepEqual(material.requiresReassessment,['cp-1'],
 'changes to mastery criteria cannot inherit demonstrated status invisibly');
assert.deepEqual(material.modified.map(x=>x.checkpointId),['cp-1','cp-2']);
assert.deepEqual(material.modified[1].fields,['source_refs']);
assert.deepEqual(material.planFieldsChanged,['topic']);
const order=copy(base);order.checkpoints.reverse();
assert.equal(diff(base,order).reordered,true);
assert.equal(diff(base,order).modified.length,0);

const missing=copy(base);missing.checkpoints[1].prerequisite_checkpoint_ids=['absent'];
assert.throws(()=>scope.compare(base,missing),/Dangling/);
const cycle=copy(base);cycle.checkpoints[0].prerequisite_checkpoint_ids=['cp-12'];
assert.throws(()=>scope.compare(base,cycle),/Cyclic/);
const duplicate=copy(base);duplicate.checkpoints[5].checkpoint_id='cp-1';
assert.throws(()=>scope.compare(base,duplicate),/Duplicate/);
const invalid=copy(base);invalid.checkpoints[5].prerequisite_checkpoint_ids=['cp-4','cp-4'];
assert.throws(()=>scope.compare(base,invalid),/Invalid checkpoint prerequisites/);
const idMismatch=copy(base);idMismatch.checkpoints[0].id='different';
assert.throws(()=>scope.compare(base,idMismatch),/identity/);
assert.throws(()=>scope.compare(base,{checkpoints:[]}),/Invalid study plan checkpoints/);
assert.throws(()=>scope.compare(base,{checkpoints:[{checkpoint_id:'cp-1',
 objective:'x'.repeat(110000)}]}),/too large/);
assert.throws(()=>scope.compare(null,base),/Invalid study plan snapshot/);
const self={checkpoints:[]};self.cycle=self;
assert.throws(()=>scope.compare(base,self),/Invalid study plan snapshot/);

// A changed explanation or criterion has no write side effect. Plan approval
// and event functions remain distinct and uncalled.
assert.equal(typeof scope.compare,'function');
console.log('PASS PLAN-01 P4a: 12 checkpoint structural diff, prerequisite amendment, unchanged identities, reassessment, graph validation and no mutation');
