import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {replay,type AtlasFacts} from '../../../supabase/functions/_shared/adaptive/measure';
import {DAY} from '../../../supabase/functions/_shared/adaptive/math';

/** The production `replay` in research mode (single hypothesis; global, system, KC, learning and fatigue terms) must reproduce the harness KF
 *  (research/sim/models.py, stream from research/sim/golden_kf.py) prediction for prediction, including FSRS memory, noisy-AND prerequisites,
 *  blame on failure, card coupling and item difficulty. The full v3 model is a superset of it (facets, ancestors, links, two coupling hypotheses). */
type Run={seed:number;K:number;sys:number[];pre:number[][];events:{kind:string;k:number;t:number;fat?:number;b?:number;y?:number}[];p:number[]};
const runs=JSON.parse(readFileSync('tests/unit/adaptive/atlas-v3-kf-golden.json','utf8')) as Run[];
const iso=(ms:number)=>new Date(ms).toISOString(),pad=(n:number)=>String(n).padStart(6,'0');

function factsFor(run:Run):AtlasFacts{
 const concepts:any[]=[...[0,1,2].map(s=>({id:'sys'+s,name:'System '+s,kind:'topic',level:'system'})),...Array.from({length:run.K},(_,k)=>({id:'k'+k,name:'KC '+k,kind:'topic',parent_id:'sys'+run.sys[k]}))];
 const instructions:any[]=[],attempts:any[]=[],sessions:any[]=[],items:any[]=[],reviews:any[]=[];
 run.events.forEach((e,i)=>{
  if(e.kind==='teach')instructions.push({id:pad(i),concept_id:'k'+e.k,occurred_at:iso(e.t*DAY)});
  else if(e.kind==='attempt'){
   const ok=e.y===1?'ok':'fail',tag=(k:number,role:string)=>({concept_id:'k'+k,facet:'use',role,stage:'E',result:ok,hint_level:0});
   sessions.push({id:'s'+i,started_at:iso(e.t*DAY-e.fat!*3600000)});items.push({id:'i'+i,b:e.b,b_sd:0});
   attempts.push({id:pad(i),occurred_at:iso(e.t*DAY),session_id:'s'+i,item_id:'i'+i,item_kind:'practice',tags:[tag(e.k,'target'),...run.pre[e.k].map(j=>tag(j,'required'))]});
  }else reviews.push({id:pad(i),occurred_at:iso(e.t*DAY),card_id:'card'+e.k,rating:e.y===1?3:1});
 });
 return {concepts,instructions,attempts,sessions,items,reviews,cards:Array.from({length:run.K},(_,k)=>({id:'card'+k,concept_id:'k'+k}))} as unknown as AtlasFacts;
}

describe('research-mode replay reproduces the harness KF',()=>{
 for(const run of runs)it('seed '+run.seed+': '+run.p.length+' attempt predictions to 1e-6',()=>{
  const trace=replay(factsFor(run),{},undefined,{research:true}).trace.filter(x=>x.stream==='attempt');
  expect(trace.length).toBe(run.p.length);
  let worst=0;trace.forEach((x,i)=>{worst=Math.max(worst,Math.abs(x.kf-run.p[i]));});
  expect(worst).toBeLessThan(1e-6);
 });
 it('the production model is not the research model: the same stream gives different predictions by default',()=>{
  const run=runs[0],a=replay(factsFor(run),{},undefined,{research:true}).trace.filter(x=>x.stream==='attempt'),b=replay(factsFor(run)).trace.filter(x=>x.stream==='attempt');
  expect(b.length).toBe(a.length);expect(Math.max(...a.map((x,i)=>Math.abs(x.kf-b[i].kf)))).toBeGreaterThan(1e-3);
 });
});

/** The same equivalence on the harness's own simulated worlds (research/sim/export_stream.py, seeds W1 2000 and W2 2001): fractional days, 24 KCs in 4 systems,
 *  card reviews, prerequisites and item difficulty. Python predictions come from the held-out run of preq.py (KF kf_1.0_1.0). */
type Stream={run:{world:string;seed:number;K:number;sys:number[];pre:number[][];cards:{c:number;k:number}[];events:any[]};p:number[];oracle:number[]};
const streams=JSON.parse(readFileSync('tests/unit/adaptive/atlas-v3-kf-stream-golden.json','utf8')) as Stream[];
function streamFacts(r:Stream['run']):AtlasFacts{
 const concepts:any[]=[...Array.from({length:Math.max(...r.sys)+1},(_,s)=>({id:'sys'+s,name:'S'+s,kind:'topic',level:'system'})),...Array.from({length:r.K},(_,k)=>({id:'k'+k,name:'K'+k,kind:'topic',parent_id:'sys'+r.sys[k]}))];
 const instructions:any[]=[],attempts:any[]=[],sessions:any[]=[],items:any[]=[],reviews:any[]=[];
 r.events.forEach((e,i)=>{
  const at=iso(Math.round(e.t*DAY));
  if(e.kind==='teach')instructions.push({id:pad(i),concept_id:'k'+e.k,occurred_at:at});
  else if(e.kind==='attempt'){const ok=e.y?'ok':'fail',tag=(k:number,role:string)=>({concept_id:'k'+k,facet:'use',role,stage:'E',result:ok,hint_level:0});
   sessions.push({id:'s'+i,started_at:iso(Math.round(e.t*DAY-e.fat*3600000))});items.push({id:'i'+i,b:e.b,b_sd:0});
   attempts.push({id:pad(i),occurred_at:at,session_id:'s'+i,item_id:'i'+i,item_kind:'practice',tags:[tag(e.k,'target'),...r.pre[e.k].map(j=>tag(j,'required'))]});}
  else reviews.push({id:pad(i),occurred_at:at,card_id:'card'+e.c,rating:e.y?3:1});
 });
 return {concepts,instructions,attempts,sessions,items,reviews,cards:r.cards.map(c=>({id:'card'+c.c,concept_id:'k'+c.k}))} as unknown as AtlasFacts;
}
describe('research-mode replay on the harness worlds',()=>{
 for(const s of streams)it(s.run.world+' seed '+s.run.seed+': '+s.p.length+' predictions match the Python KF to 1e-6',()=>{
  const trace=replay(streamFacts(s.run),{},undefined,{research:true}).trace.filter(x=>x.stream==='attempt');
  expect(trace.length).toBe(s.p.length);
  expect(Math.max(...trace.map((x,i)=>Math.abs(x.kf-s.p[i])))).toBeLessThan(1e-6);
 });
 it('the shipped model stays near the research KF in reducible error on the same learners (and under the gate of 07)',()=>{
  const kl=(p:number,q:number)=>{p=Math.min(1-1e-4,Math.max(1e-4,p));q=Math.min(1-1e-4,Math.max(1e-4,q));return p*Math.log(p/q)+(1-p)*Math.log((1-p)/(1-q));};
  for(const s of streams){
   const prod=replay(streamFacts(s.run)).trace.filter(x=>x.stream==='attempt'),mean=prod.reduce((a,x,i)=>a+kl(s.oracle[i],x.kf),0)/prod.length,research=s.p.reduce((a,p,i)=>a+kl(s.oracle[i],p),0)/s.p.length;
   expect(mean).toBeLessThan(research*1.35);expect(mean).toBeLessThan(.05);
  }
 });
});
