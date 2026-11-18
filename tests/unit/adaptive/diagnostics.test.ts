import {describe,expect,it} from 'vitest';
import {durationDiagnostics,attendanceDiagnostics} from '../../../supabase/functions/_shared/adaptive/diagnostics';
import {seeded} from '../../../supabase/functions/_shared/adaptive/math';

const normal=(rng:()=>number)=>Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(2*Math.PI*rng());
const moments=(mu:number,sd:number)=>({mean:Math.exp(mu+sd*sd/2),variance:0,p10:Math.exp(mu-1.2815515655*sd),p90:Math.exp(mu+1.2815515655*sd)});
const series=(n:number,trueSd:number,statedSd:number,seed=5)=>{const rng=seeded(seed);return Array.from({length:n},()=>{const mu=Math.log(60+rng()*60);return {actual:Math.exp(mu+trueSd*normal(rng)),estimate:moments(mu,statedSd)};});};

describe('01 §9 durations stream (D1, D4, D5)',()=>{
 it('shows insufficient data below 50 events, never a pass',()=>{const h=durationDiagnostics(series(49,.3,.3));expect(h.status).toBe('insufficient data');expect(h.tests.D5).toBeNull();});
 it('a calibrated model passes D1, D4 and D5',()=>{
  const h=durationDiagnostics(series(400,.3,.3));expect(h.n).toBe(400);
  expect(h.tests.D5).toBe(true);expect(h.tests.D4).toBe(true);expect(h.tests.D1).toBe(true);expect(h.status).toBe('ok');expect(h.residuals.coverage).toBeGreaterThan(.75);expect(h.residuals.coverage).toBeLessThan(.85);
 });
 it('intervals that are too narrow fail D5 and say how much to widen; the distribution mismatch fails D4',()=>{
  const h=durationDiagnostics(series(400,.6,.2));expect(h.tests.D5).toBe(false);expect(h.tests.D4).toBe(false);expect(h.status).toBe('action');
  expect(h.actions.some(a=>/widen intervals by (\d\.\d+)/.test(a)&&Number(/by (\d\.\d+)/.exec(a)![1])>1)).toBe(true);
 });
 it('a model worse than the running mean fails D1',()=>{
  const rng=seeded(9),rows=Array.from({length:300},()=>{const actual=60*Math.exp(.1*normal(rng));return {actual,estimate:moments(Math.log(200),.1)};});   // always 200 minutes: far off
  expect(durationDiagnostics(rows).tests.D1).toBe(false);
 });
});

describe('01 §9 attendance stream (D1, D2, D4)',()=>{
 const stream=(n:number,truth:number,stated:number,seed=3)=>{const rng=seeded(seed);return Array.from({length:n},(_,i)=>({p:stated,y:rng()<truth?1:0,at:i}));};
 it('shows insufficient data below 50 blocks',()=>{expect(attendanceDiagnostics(stream(10,.6,.6)).status).toBe('insufficient data');});
 it('a calibrated predictor passes D2 and D4; the stream is named attendance with no residual or interval tests',()=>{
  const rows=Array.from({length:600},(_,i)=>{const rng=seeded(100+i),p=.2+.6*((i*37)%100)/100;return {p,y:rng()<p?1:0,at:i};});
  const h=attendanceDiagnostics(rows);expect(h.stream).toBe('attendance');expect(h.tests.D2).toBe(true);expect(h.tests.D4).toBe(true);expect(h.tests.D3).toBeNull();expect(h.tests.D5).toBeNull();
 });
 it('an over-confident predictor fails calibration and recalibrates',()=>{
  const h=attendanceDiagnostics(stream(400,.5,.92));expect(h.tests.D2).toBe(false);expect(h.actions).toContain('recalibrating');expect(h.status).toBe('action');
 });
});

import {reliabilityBins} from '../../../supabase/functions/_shared/adaptive/diagnostics';
describe('05 calibration chart data',()=>{
 it('is empty below 50 predictions and bins the last 200 above',()=>{
  expect(reliabilityBins(Array.from({length:49},()=>({p:.5,y:1})))).toEqual([]);
  const rng=seeded(21),rows=Array.from({length:500},()=>{const p=rng();return {p,y:rng()<p?1:0};}),bins=reliabilityBins(rows);
  expect(bins.reduce((a,b)=>a+b.n,0)).toBe(200);
  for(const b of bins){expect(b.predicted).toBeGreaterThanOrEqual(b.lo);expect(b.predicted).toBeLessThan(b.hi+1e-9);expect(b.observed).toBeGreaterThanOrEqual(0);expect(b.observed).toBeLessThanOrEqual(1);}
  expect(bins.map(b=>b.lo)).toEqual([...bins.map(b=>b.lo)].sort((a,b)=>a-b));
 });
});
