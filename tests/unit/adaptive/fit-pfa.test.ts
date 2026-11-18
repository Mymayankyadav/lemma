import {describe,expect,it} from 'vitest';
import {fitPfa} from '../../../supabase/functions/_shared/adaptive/fit';
import {sigmoid} from '../../../supabase/functions/_shared/adaptive/math';

// N184: fitPfa took every diagonal-Newton step at once; with correlated features (intercept, KC, system all 1 on every row, as in
// production) the joint step overshot and oscillated 0 -> .2 -> 0, so an even iteration count returned the prior unchanged.
const trace=(n:number,rate:number)=>Array.from({length:n},(_,i)=>({id:String(i),at:i,stream:'attempt',p:.5,kf:.5,pfa:.5,base:.5,y:i%100<rate*100?1:0,hours:0,hint:0,kind:'legacy',
 features:{intercept:1,'kc:a':1,'system:s':1,success:Math.log1p(Math.floor(i*rate)),attempts:Math.log1p(i),b:0},hypotheses:[]})) as any[];
const loss=(w:Record<string,number>,t:any[])=>t.reduce((z,r)=>{const p=sigmoid(Object.entries(r.features as Record<string,number>).reduce((a,[k,x])=>a+w[k]*x,0));return z-(r.y*Math.log(p)+(1-r.y)*Math.log(1-p));},0)/t.length;

describe('N184 PFA fit on correlated features',()=>{
 it('moves off the prior and beats it, whatever the iteration count parity',()=>{
  const t=trace(150,.72),prior=fitPfa(t,0);
  expect(prior.intercept).toBe(0);
  for(const n of [2,10,80,200]){const w=fitPfa(t,n);expect(loss(w,t)).toBeLessThan(loss(prior,t)-.01);expect(w.intercept+w['kc:a']+w['system:s']).toBeGreaterThan(.3);}
 });
 it('never makes the fit worse from one iteration count to the next (monotone)',()=>{
  const t=trace(150,.72);let last=Infinity;
  for(const n of [1,2,3,5,8,13,21,40,80]){const l=loss(fitPfa(t,n),t);expect(l).toBeLessThanOrEqual(last+1e-6);last=l;}
 });
 it('the fitted mean probability matches the observed pass rate, high or low',()=>{
  const meanP=(w:Record<string,number>,t:any[])=>t.reduce((z,r)=>z+sigmoid(Object.entries(r.features as Record<string,number>).reduce((a,[k,x])=>a+w[k]*x,0)),0)/t.length;
  for(const rate of [.2,.72]){const t=trace(150,rate),observed=t.reduce((z,r)=>z+r.y,0)/t.length;expect(Math.abs(meanP(fitPfa(t),t)-observed)).toBeLessThan(.08);}
 });
});
