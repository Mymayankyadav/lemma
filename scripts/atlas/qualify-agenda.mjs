// Run with Node 24+ and the retained, read-only handoff directory as the first argument.
// Measures the product port on synthetic reference calendars. No database, network or learner data.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {selectSchedule} from '../../supabase/functions/_shared/agenda/selector.ts';
import {decideAgenda} from '../../supabase/functions/_shared/agenda/decision.ts';
import {validateDecision} from '../../supabase/functions/_shared/agenda/constraints.ts';
const path=process.argv[2];
if(!path)throw Error('Supply the retained lemma-atlas-final research directory');
const base=pathToFileURL(resolve(path)+'/');
const {families,makeCalendar,generator}=await import(new URL('scheduler/calendars.mjs',base));
const {episode}=await import(new URL('scheduler/simulation.mjs',base));
const {selectSchedule:oracle}=await import(new URL('scheduler/selector.mjs',base));
const expected=JSON.parse(await readFile(new URL('scheduler/results/falsification.json',base),'utf8')).summaries;
const latencies=[],fallbacks={},sum={calls:0,hardViolations:0,portfolio:0,budgetFallbacks:0};
function qualify(input,options){
  const candidate=selectSchedule(input,options),reference=oracle(input,options);
  assert.deepEqual(candidate.action,reference.action);
  assert.deepEqual(candidate.hold,reference.hold);
  assert.equal(candidate.policy,reference.policy);
  assert.equal(candidate.reason,reference.reason);
  const violations=validateDecision(input,candidate);
  sum.calls++;sum.hardViolations+=violations.length;
  if(input.now===0){
    const shadow=decideAgenda({asOf:new Date(0).toISOString(),watermark:'fixture',capacityKnown:true,state:input},'legacy',()=>performance.now(),Number.MAX_SAFE_INTEGER);
    const bounded=decideAgenda({asOf:new Date(0).toISOString(),watermark:'fixture',capacityKnown:true,state:input},'new');
    sum.budgetFallbacks+=Number(bounded.served.reason.includes('budget exceeded'));
    sum.hardViolations+=bounded.hardViolations;
    latencies.push(shadow.elapsedMs);
    fallbacks[shadow.candidate.reason]=(fallbacks[shadow.candidate.reason]??0)+1;
    sum.hardViolations+=shadow.hardViolations;sum.portfolio+=Number(shadow.candidate.effective==='new');
    assert.deepEqual(shadow.served.outcome,shadow.served.baseline);
  }
  return candidate;
}
for(const family of families)for(const phase of ['A','B'])for(let seed=1101;seed<=1106;seed++)
  episode(makeCalendar(seed,family,phase),'conservative',false,qualify);
function counterexample(seed){
  const rng=generator(seed);
  const plan=(id,remaining,due,importance,atlasKind='practice',core=false)=>({id,kind:'course',remaining,due,importance,core,
    splittable:false,projectId:'math',atlasAction:{kind:atlasKind,concept_id:id,p:.76,weight:core?3:1,forced:core}});
  const teaching=22+Math.floor(5*rng()),windowEnd=34+Math.floor(5*rng()),distraction=5+Math.floor(3*rng()),practice=6+Math.floor(3*rng());
  return {seed,family:'native_priority_under_hidden_card_bias',phase:'F',end:130,
    tasks:[plan('teach',teaching,windowEnd,10,'teach',true),plan('practice',practice,windowEnd-3,2),
      {id:'cue',kind:'card',remaining:distraction,due:19,importance:1,projectId:'math',atlasAction:{kind:'review',concept_id:'teach',card_id:'cue',p:.65}},
      {id:'errand',kind:'personal',remaining:10,due:125,importance:3,release:99}],
    fixed:[{id:'morning-class',start:windowEnd,end:61}],availability:[{start:0,end:61},{start:94,end:130}],
    history:Array.from({length:12},()=>({estimated:15,actual:15*(.94+.12*rng()),kept:true})),
    actual:{teach:teaching,practice,cue:13+Math.floor(5*rng()),errand:10}};
}
const panel=[];
for(let seed=386744;seed<=386807;seed++){
  const world=counterexample(seed);
  panel.push({native:episode(world,'v3',false,selectSchedule),changed:episode(world,'conservative',false,qualify)});
}
const wins=panel.filter(r=>r.changed.primary>r.native.primary).length,losses=panel.filter(r=>r.changed.primary<r.native.primary).length;
assert.equal(wins,expected.conservative.gains);
assert.equal(losses,expected.conservative.losses);
assert.equal(panel.reduce((v,r)=>v+r.changed.core,0)/panel.length,expected.conservative.core);
assert.equal(sum.hardViolations,0);
latencies.sort((a,b)=>a-b);
const pct=p=>Number(latencies[Math.ceil(p*latencies.length)-1].toFixed(2));
console.log(JSON.stringify({calendarCount:latencies.length,...sum,counterexample:{wins,losses},
  runtimeMs:{p50:pct(.5),p95:pct(.95),p99:pct(.99),max:pct(1)},fallbacks},null,2));
