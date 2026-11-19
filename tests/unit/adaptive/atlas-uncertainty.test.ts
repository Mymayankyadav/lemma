import {afterEach,describe,expect,it} from 'vitest';
import {replay,estimate,memoryAt} from '../../../supabase/functions/_shared/adaptive/measure';
import {certification} from '../../../supabase/functions/_shared/adaptive/policy';
import {Posterior} from '../../../supabase/functions/_shared/adaptive/posterior';
import {seeded} from '../../../supabase/functions/_shared/adaptive/math';

// N186: on the production data of 2026-11-19 the filter's uncertainty was 1.0-1.3 for facets whose joint posterior is 0.55-1.05, so practised
// facets showed "—"; its estimates were also noisier. The reported ability is now the joint (Laplace) fit; predictions are unchanged.
const T=Date.parse('2026-11-01T10:00:00Z'),DAY=86400e3;
const facts=(perDay:number,days:number,failEvery=0):any=>({concepts:[{id:'s',name:'Sets',kind:'topic',level:'system'},{id:'k',name:'Compactness',kind:'topic',parent_id:'s'},{id:'u',name:'Never practised',kind:'topic',parent_id:'s'}],
 instructions:[{id:1,concept_id:'k',occurred_at:new Date(T).toISOString()}],tags:[],links:[],items:[],sessions:[],assumptions:[],cards:[],reviews:[],
 attempts:Array.from({length:perDay*days},(_,i)=>({id:i+1,occurred_at:new Date(T+DAY*(1+Math.floor(i/perDay))+3600e3*(i%perDay)).toISOString(),session_id:'S'+Math.floor(i/perDay),item_kind:'practice',
  tags:[{concept_id:'k',facet:'use',role:'target',stage:'E',result:failEvery&&i%failEvery===failEvery-1?'fail':'ok',hint_level:0}]}))});
const legacy=<R>(run:()=>R):R=>{Posterior.MAX=0;try{return run();}finally{Posterior.MAX=256;}};   // nothing fitted: the filter's own mean and variance, as before N186
afterEach(()=>{Posterior.MAX=256;});

describe('N186 the reported ability is the joint fit; predictions are untouched',()=>{
 const f=facts(4,5,4),now=T+6*DAY+12*3600e3;                                                      // 20 attempts over 5 days, one in four failed
 it('replay predictions are identical with and without the joint fit',()=>{
  const a=replay(f,{},now),b=legacy(()=>replay(f,{},now));
  expect(a.trace).toEqual(b.trace);expect(a.hypotheses).toEqual(b.hypotheses);expect(a.pi).toEqual(b.pi);expect(a.mix).toEqual(b.mix);
  expect(estimate(a,'k','use',now).p).toBe(estimate(b,'k','use',now).p);
 });
 it('a practised facet shows an estimate with an interval where the filter showed "—"',()=>{
  const a=replay(f,{},now),b=legacy(()=>replay(f,{},now)),n=estimate(a,'k','use',now),o=estimate(b,'k','use',now);
  expect(o.state).toBe('none');expect(o.sd).toBeGreaterThan(1.2);
  expect(n.state).toBe('inferred');expect(n.sd).toBeLessThan(.8);expect(n.sd).toBeGreaterThan(.3);               // tighter, not certain
  expect(n.lo).toBeLessThan(n.p);expect(n.hi).toBeGreaterThan(n.p);expect(n.hi-n.lo).toBeLessThan(o.hi-o.lo);
 });
 it('an unpractised concept stays uncertain, and a practised one is the more certain',()=>{
  const a=replay(f,{},now),practised=estimate(a,'k','use',now),fresh=estimate(a,'u','use',now);
  expect(fresh.sd).toBeGreaterThan(practised.sd);expect(fresh.state).toBe('none');
 });
 it('uncertainty falls as evidence accumulates and rises as it ages; ageing never moves the estimate',()=>{
  const at=(perDay:number,t:number)=>estimate(replay(facts(perDay,3,6),{},t),'k','use',t),t=T+4*DAY;
  expect(at(10,t).sd).toBeLessThan(at(4,t).sd);
  expect(at(8,t+30*DAY).sd).toBeGreaterThan(at(8,t).sd);expect(at(8,t+30*DAY).m).toBeCloseTo(at(8,t).m,9);
 });
 it('certification is honest: strong clean evidence certifies, a one-in-four failure rate does not, and P rises with the evidence',()=>{
  const t=T+4*DAY+12*3600e3,cert=(g:any)=>certification(replay(g,{},t),'k','use',.85,t);
  expect(cert(facts(8,3)).certified).toBe(true);expect(cert(facts(6,3,4)).certified).toBe(false);
  expect(cert(facts(8,3,12)).probability).toBeGreaterThan(cert(facts(8,3,6)).probability);
 });
 it('a replay with no attempts reports the prior uncertainty (no evidence, no tightening)',()=>{
  const g=facts(0,0),s=replay(g,{},T+DAY),b=legacy(()=>replay(g,{},T+DAY));
  expect(estimate(s,'k','use',T+DAY).sd).toBeCloseTo(estimate(b,'k','use',T+DAY).sd,9);expect(estimate(s,'k','use',T+DAY).m).toBeCloseTo(estimate(b,'k','use',T+DAY).m,9);
 });
});

// The truth is drawn from the model's own prior, outcomes follow its likelihood (with the filter's memory), and the reported 80% interval is
// checked against it. Measured over 60 learners x 3 concepts: the joint fit covers 82-86% with half the error of the filter's own estimate.
describe('N186 calibration against known truth',()=>{
 const gauss=(r:()=>number)=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);},sig=(x:number)=>1/(1+Math.exp(-x));
 function learner(seed:number,perDay:number,days:number,K=3){
  const r=seeded(seed),mu=gauss(r),phi=gauss(r)*.5,sys=gauss(r)*.5,gal=gauss(r)*.5,kc=Array.from({length:K},()=>gauss(r)*Math.SQRT1_2),cross=Array.from({length:K},()=>gauss(r)*.5);
  const facts:any={concepts:[{id:'g',name:'G',kind:'topic',level:'galaxy'},{id:'s',name:'S',kind:'topic',level:'system',parent_id:'g'},...Array.from({length:K},(_,i)=>({id:'k'+i,name:'K'+i,kind:'topic',parent_id:'s'}))],
   instructions:Array.from({length:K},(_,i)=>({id:i+1,concept_id:'k'+i,occurred_at:new Date(T).toISOString()})),attempts:[],tags:[],links:[],items:[],sessions:[],assumptions:[],cards:[],reviews:[]};
  const counts=Array(K).fill(0);let id=0;
  for(let d=1;d<=days;d++)for(let a=0;a<perDay;a++)for(let k=0;k<K;k++){
   const t=T+d*DAY+(a*K+k)*600e3,eta=mu+phi+sys+gal+kc[k]+cross[k]+.3*Math.log1p(counts[k]),R=memoryAt(replay(facts,{},t).hypotheses[0].memory['k'+k],t);
   facts.attempts.push({id:++id,occurred_at:new Date(t).toISOString(),session_id:'S'+d,item_kind:'practice',tags:[{concept_id:'k'+k,facet:'use',role:'target',stage:'E',result:r()<.05+.92*R*sig(eta)?'ok':'fail',hint_level:0}]});counts[k]++;
  }
  return {facts,now:T+(days+.2)*DAY,truth:Array.from({length:K},(_,k)=>mu+phi+sys+gal+kc[k]+cross[k]+.3*Math.log1p(counts[k])),K};
 }
 it('the 80% interval covers the truth about 80% of the time, and the estimate is closer to it than the filter\'s',()=>{
  const z=1.2815515655,tally={joint:{hit:0,sq:0,n:0},filter:{hit:0,sq:0,n:0}};
  for(let seed=1;seed<=24;seed++){
   const L=learner(1000+seed,4,5);
   for(const [name,max] of [['joint',256],['filter',0]] as const){
    Posterior.MAX=max;const s=replay(L.facts,{},L.now);
    for(let k=0;k<L.K;k++){const e=estimate(s,'k'+k,'use',L.now),t=tally[name];t.n++;t.sq+=(L.truth[k]-e.m)**2;if(Math.abs(L.truth[k]-e.m)<=z*e.sd)t.hit++;}
   }
  }
  const cover=(k:'joint'|'filter')=>tally[k].hit/tally[k].n,rms=(k:'joint'|'filter')=>Math.sqrt(tally[k].sq/tally[k].n);
  expect(cover('joint')).toBeGreaterThan(.72);expect(cover('joint')).toBeLessThan(.95);
  expect(rms('joint')).toBeLessThan(rms('filter')*.8);
 },60000);
});
