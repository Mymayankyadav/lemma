import {describe,expect,it} from 'vitest';
import {replay,type AtlasFacts} from '../../../supabase/functions/_shared/adaptive/measure';
import {knowledgeGain,monteCarloExpect,pacing,pruneDecision,type Action} from '../../../supabase/functions/_shared/adaptive/kg';
import {initialPrune,stepPrune,finalReviews,reentryProbes,allocateProjects,type PruneState} from '../../../supabase/functions/_shared/adaptive/scheduler';
import {DAY,seeded} from '../../../supabase/functions/_shared/adaptive/math';

const T=Date.UTC(2026,10,1,10);
const facts=():AtlasFacts=>({concepts:[{id:'s',name:'Sets',kind:'topic',level:'system'} as any,{id:'k',name:'Compactness',kind:'topic',parent_id:'s'} as any,{id:'j',name:'Connectedness',kind:'topic',parent_id:'s'} as any],
 instructions:[{id:1,concept_id:'k',occurred_at:new Date(T).toISOString()},{id:2,concept_id:'j',occurred_at:new Date(T+DAY).toISOString()}],attempts:[
  {id:1,occurred_at:new Date(T+3600e3).toISOString(),session_id:'a',item_kind:'practice',tags:[{concept_id:'k',facet:'use',role:'target',stage:'E',result:'ok',hint_level:0}]},
  {id:2,occurred_at:new Date(T+DAY+3600e3).toISOString(),session_id:'b',item_kind:'practice',tags:[{concept_id:'j',facet:'use',role:'target',stage:'E',result:'fail',hint_level:0}]}]});

describe('10 §4 feasibility prune and restore',()=>{
 const run=(series:number[]):{states:PruneState[];actions:string[]}=>{let s=initialPrune;const states:PruneState[]=[],actions:string[]=[];series.forEach((p,i)=>{const r=stepPrune(s,'2026-11-'+String(i+1).padStart(2,'0'),p);s=r.state;states.push(s);actions.push(r.action);});return {states,actions};};
 it('prunes below 0.80 and restores only after two consecutive days above 0.95',()=>{
  expect(run([.9,.79,.97,.96]).actions).toEqual(['hold','prune','hold','restore']);
  expect(run([.5,.97,.9,.97,.96]).actions).toEqual(['prune','hold','hold','hold','restore']);   // the dip to 0.90 resets the count
 });
 it('never prunes at or above the floor and never restores on the band 0.80–0.95',()=>{
  expect(run([.8,.85,.95,.9]).actions).toEqual(['hold','hold','hold','hold']);
  expect(run([.7,.8,.9,.95,.8,.94]).actions).toEqual(['prune','hold','hold','hold','hold','hold']);
 });
 it('a seeded noisy series around the floor changes state at most once per excursion (no flip-flop)',()=>{
  const rng=seeded(42),series=Array.from({length:400},()=>.8+(rng()-.5)*.1);     // 0.75–0.85
  const {actions}=run(series),flips=actions.filter(a=>a!=='hold').length;
  expect(actions.filter(a=>a==='restore').length).toBe(0);   // never above 0.95 here
  expect(flips).toBe(1);                                      // one prune, then it stays pruned
 });
 it('one decision per study day: the first run of the day is the frozen one',()=>{
  const first=stepPrune(initialPrune,'2026-11-01',.5),again=stepPrune(first.state,'2026-11-01',.99);
  expect(first.action).toBe('prune');expect(again.action).toBe('hold');expect(again.state).toEqual(first.state);
 });
 it('core is never pruned automatically; test-out at P ≥ 0.7; value per minute orders the rest',()=>{
  const out=pruneDecision(.6,.9,[],[{id:'core',tier:'core',weight:3,pTestOut:.1,minutes:60},{id:'a',tier:'standard',weight:2,pTestOut:.8,minutes:60},{id:'b',tier:'venture',weight:1,pTestOut:.1,minutes:60},{id:'c',tier:'standard',weight:2,pTestOut:.1,minutes:30}]);
  expect(out.candidates.map(c=>c.id)).toEqual(['a','b','c']);
  expect(out.candidates.find(c=>c.id==='a')!.testOut).toBe(true);
  expect(out.candidates.some(c=>c.id==='core')).toBe(false);
 });
});

describe('10 §3 pacing: every core KC is taught by the pacing date in a seeded run',()=>{
 it('teaches on each free study day while behind, and finishes before last_study_on − max(7 days, 20%)',()=>{
  const start=T,last=T+60*DAY,rng=seeded(7);let taught=0;const total=12;
  for(let d=0;d<60&&taught<total;d++){
   const free=rng()<.8?60:0,p=pacing(total,taught,start,last,start+d*DAY,free);
   if(p.forceTeach)taught++;
   if(start+d*DAY>=p.finishTeachingAt)break;
  }
  expect(taught).toBe(total);
 });
});

describe('10 §6–§8 final reviews, re-entry, several projects',()=>{
 it('gives each core item below 0.90 recall at the exam one review in the final three study days',()=>{
  const model=replay(facts(),{},T+30*DAY),days=['2026-12-01','2026-12-02','2026-12-03','2026-12-04','2026-12-05'];
  const reviews=finalReviews(model,[{concept_id:'k',facet:'use',core:true},{concept_id:'j',facet:'use',core:true},{concept_id:'s',facet:'use',core:false}],days,'2026-12-06');
  expect(reviews.length).toBe(2);
  for(const r of reviews){expect(['2026-12-03','2026-12-04','2026-12-05']).toContain(r.day);expect(r.retention).toBeLessThan(.9);}
  expect(new Set(reviews.map(r=>r.concept_id)).size).toBe(2);
  expect(finalReviews(model,[{concept_id:'k',facet:'use',core:false}],days,'2026-12-06')).toEqual([]);
 });
 it('opens with three prerequisite probes only after more than three study days away',()=>{
  const pre=[{id:'a',p:.9},{id:'b',p:.3},{id:'c',p:.6},{id:'d',p:.5}];
  expect(reentryProbes(3,pre)).toEqual([]);expect(reentryProbes(4,pre)).toEqual(['b','d','c']);expect(reentryProbes(9,pre.slice(0,2))).toEqual(['b','a']);
 });
 it('keeps every project at the P_core floor first, then shares by weight; share_weight overrides; never over-allocates',()=>{
  const projects=[{id:'a',pCore:.9,deadline:'2026-12-20',weight:2,needMinutes:200},{id:'b',pCore:.5,deadline:'2026-12-10',weight:1,needMinutes:90},{id:'c',pCore:.6,deadline:'2026-12-05',weight:1,needMinutes:90}];
  const out=allocateProjects(projects,120),by=Object.fromEntries(out.map(o=>[o.id,o.minutes]));
  expect(by.a).toBe(0);expect(by.b).toBeCloseTo(60,6);expect(by.c).toBeCloseTo(60,6);                    // 120 min < the two floors' needs: split, nothing for the safe project
  const more=Object.fromEntries(allocateProjects(projects,400).map(o=>[o.id,o.minutes]));
  expect(more.b).toBeCloseTo(90,6);expect(more.c).toBeCloseTo(90,6);expect(more.a).toBeCloseTo(200,6);   // everything fits
  const weighted=Object.fromEntries(allocateProjects([{id:'a',pCore:.9,deadline:null,weight:1,needMinutes:100},{id:'b',pCore:.9,deadline:null,weight:1,share_weight:3,needMinutes:100}],80).map(o=>[o.id,o.minutes]));
  expect(weighted.b).toBeCloseTo(60,6);expect(weighted.a).toBeCloseTo(20,6);
  for(const m of [0,30,500])expect(allocateProjects(projects,m).reduce((a,o)=>a+o.minutes,0)).toBeLessThanOrEqual(m+1e-9);
 });
});

describe('10 §2 knowledge gradient',()=>{
 it('exact enumeration equals a Monte Carlo of the same expectation to 1e-3 (10⁵ draws: the spec\'s 10⁴ leaves a sampling error of about 1e-3 itself)',()=>{
  const s=replay(facts(),{},T+10*DAY);
  for(const a of [{id:'a',kind:'practice' as const,concept_id:'j',minutes:10,p:.6,needAt:T+30*DAY},{id:'b',kind:'practice' as const,concept_id:'k',minutes:10,p:.8,needAt:T+30*DAY}] as Action[]){
   const exact=knowledgeGain(s,a),mc=knowledgeGain(s,a,monteCarloExpect(seeded(11),100000));
   expect(Math.abs(exact-mc)).toBeLessThan(1e-3);
  }
 });
 it('is finite and never negative for any action on seeded states',()=>{
  const rng=seeded(3);
  for(let i=0;i<200;i++){const s=replay(facts(),{},T+rng()*40*DAY),a:Action={id:'x',kind:rng()<.5?'practice':'review',concept_id:rng()<.5?'k':'j',minutes:1+rng()*40,p:rng(),needAt:T+(1+rng()*50)*DAY};
   const g=knowledgeGain(s,a);expect(Number.isFinite(g)).toBe(true);expect(g).toBeGreaterThanOrEqual(0);}
 });
});

import {assembleAtlas} from '../../../supabase/functions/_shared/adaptive/atlas';
describe('10 §6–§8 wired into the read model',()=>{
 const NOW=new Date('2026-11-18T10:00:00Z'),day=(n:number)=>new Date(NOW.getTime()+n*DAY).toISOString().slice(0,10);
 const rows=(away:number):any=>({settings:{capacity:{weekday_minutes:120}},
  concepts:[{id:'s',name:'Sets',kind:'topic',level:'system'},{id:'k',name:'Compactness',kind:'topic',parent_id:'s'},{id:'j',name:'Connectedness',kind:'topic',parent_id:'s'},{id:'i',name:'Interiors',kind:'topic',parent_id:'s'}],
  projects:[{id:'p',last_study_on:day(2)}],
  checkpoints:[{id:'c1',project_id:'p',position:1,status:'demonstrated',tier:'core'},{id:'c2',project_id:'p',position:2,status:'not_started',tier:'core',estimate_minutes:60}],
  prereqs:[{checkpoint_id:'c2',prereq_id:'c1'}],cpConcepts:[{checkpoint_id:'c1',concept_id:'j'},{checkpoint_id:'c1',concept_id:'i'},{checkpoint_id:'c2',concept_id:'k'}],
  sessions:[{id:'x',project_id:'p',started_at:new Date(NOW.getTime()-away*DAY).toISOString(),checkpoint_id:'c1',minutes:60}],
  attempts:[],instructionEvents:[{id:1,concept_id:'k',occurred_at:new Date(NOW.getTime()-away*DAY).toISOString()},{id:2,concept_id:'j',occurred_at:new Date(NOW.getTime()-away*DAY).toISOString()},{id:3,concept_id:'i',occurred_at:new Date(NOW.getTime()-away*DAY).toISOString()}]});
 it('a re-entry after more than three days opens the queue with prerequisite probes',()=>{
  const away=assembleAtlas(rows(9),NOW),near=assembleAtlas(rows(1),NOW);
  expect(away.queue.items.filter(a=>a.id.startsWith('probe:')).map(a=>a.concept_id).sort()).toEqual(['i','j']);
  expect(near.queue.items.some(a=>a.id.startsWith('probe:'))).toBe(false);
 });
 it('in the final three study days a core item with low recall at the exam is forced into today',()=>{
  const view=assembleAtlas(rows(9),NOW);
  expect(view.finalReviews.length).toBeGreaterThan(0);
  expect(view.finalReviews.every(r=>[day(0),day(1),day(2)].includes(r.day))).toBe(true);
  expect(view.queue.items.some(a=>a.id.startsWith('final:'))||view.finalReviews.every(r=>r.day!==day(0))).toBe(true);
 });
 it('exposes a per-project allocation that never exceeds the day capacity',()=>{
  const view=assembleAtlas(rows(1),NOW);
  expect(view.allocation.reduce((a,o)=>a+o.minutes,0)).toBeLessThanOrEqual(120+1e-9);
 });
});

import {sessionQueue} from '../../../supabase/functions/_shared/adaptive/kg';
describe('10 §8 fairness is spent in the daily queue',()=>{
 const s=replay(facts(),{},T+10*DAY);
 const act=(project:string,i:number,p=.6):Action=>({project_id:project,id:project+':'+i,kind:'practice',concept_id:i%2?'k':'j',minutes:10,p,needAt:T+30*DAY});
 it('never spends more than a project\'s share of minutes on KG actions, so a greedy project cannot starve another',()=>{
  const actions=[...[0,1,2,3,4,5].map(i=>act('a',i)),...[0,1].map(i=>act('b',i,.4))];
  const free=sessionQueue(s,actions,120,.125),capped=sessionQueue(s,actions,120,.125,{a:20,b:30});
  const minutes=(q:typeof free,project:string)=>q.items.filter(x=>x.project_id===project).reduce((a,x)=>a+x.minutes,0);
  expect(minutes(free,'a')+minutes(free,'b')).toBeGreaterThan(40);                    // uncapped, the queue spends the block
  expect(minutes(capped,'a')).toBeLessThanOrEqual(20);expect(minutes(capped,'b')).toBeLessThanOrEqual(30);
  expect(minutes(capped,'b')).toBe(20);                                              // b's two actions both fit
 });
 it('forced items count against the share but are never dropped; no caps means no change',()=>{
  const forced:Action={project_id:'a',id:'check:k',kind:'check',concept_id:'k',minutes:5,p:.5,forced:true};
  const q=sessionQueue(s,[forced,act('a',0),act('a',1)],120,.125,{a:10});
  expect(q.items[0].id).toBe('check:k');expect(q.items.filter(x=>x.project_id==='a').reduce((a,x)=>a+x.minutes,0)).toBe(5);   // the forced check (5) is kept and uses half the share; a 10-minute action would exceed 10
  expect(sessionQueue(s,[act('a',0),act('a',1)],120,.125)).toEqual(sessionQueue(s,[act('a',0),act('a',1)],120,.125,undefined));
 });
});
