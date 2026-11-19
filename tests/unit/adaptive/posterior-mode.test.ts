import {describe,expect,it} from 'vitest';
import {Posterior,eventLikelihood,scalarMode,type Part} from '../../../supabase/functions/_shared/adaptive/posterior';

// Independent scalar reference: enumerate stationary points and compare their actual
// posterior density. Neither the fitter's derivatives nor inspect().logPosterior
// participates in the reference, so a nonstationary covariance cannot pass merely
// because the fitter and its inspection hook share the same mistake.
type Case={n:number;g:number;A:number;off:number;y:0|1;extra?:number};
const part:Part={id:'mu',x:1,prior:1,q:0,m0:0,m:0,v:1};
function reference(test:Case){
 const attenuation=1/Math.sqrt(1+Math.PI*(test.extra??0)/8);
 const probability=(x:number)=>test.g+test.A/(1+Math.exp(-(x+test.off)*attenuation));
 const logPosterior=(x:number)=>test.n*Math.log(test.y?probability(x):1-probability(x))-x*x/2;
 const score=(x:number)=>{
  const e=1/(1+Math.exp(-(x+test.off)*attenuation)),p=probability(x),d=test.A*attenuation*e*(1-e);
  return test.n*(test.y-p)*d/(p*(1-p))-x;
 };
 // The likelihood is at most one. Beyond this radius the prior penalty alone
 // makes the posterior lower than at zero, so a global maximizer is inside it.
 const radius=Math.sqrt(-2*logPosterior(0))+1,candidates=[0,-radius,radius],steps=4096;
 for(let i=0;i<steps;i++){
  let lo=-radius+2*radius*i/steps,hi=-radius+2*radius*(i+1)/steps;
  const left=score(lo),right=score(hi);
  if(left===0)candidates.push(lo);
  if(left*right>=0)continue;
  for(let j=0;j<70;j++){
   const mid=(lo+hi)/2;
   if(score(lo)*score(mid)>0)lo=mid;else hi=mid;
  }
  candidates.push((lo+hi)/2);
 }
 const mode=candidates.reduce((best,x)=>logPosterior(x)>logPosterior(best)?x:best,0);
 return {mode,score,logPosterior};
}
function fittedPosterior(test:Case){
 const post=new Posterior();
 for(let i=0;i<test.n;i++)post.observe([part],test.off,test.y,test.g,test.A,1,test.extra??0,0);
 return post.inspect();
}

describe('Posterior: numerical mode and observed curvature',()=>{
 it('converges for ten partial-retrieval passes instead of returning after twelve Fisher steps',()=>{
  const test:Case={n:10,g:.05,A:.4,off:0,y:1},want=reference(test),actual=fittedPosterior(test);
  expect(want.mode).toBeCloseTo(1.536720079072404,10);
  expect(actual.c[0]).toBeCloseTo(want.mode,6);
  expect(Math.abs(want.score(actual.c[0]))).toBeLessThan(2e-6);
  expect(want.logPosterior(actual.c[0])).toBeCloseTo(want.logPosterior(want.mode),9);
 });
 it('the repeated-site mode is unchanged when one observation permutes its component order',()=>{
  const parts=['a','b'].map(id=>({...part,id,prior:.5,v:.5}));
  const ordered=new Posterior(),permuted=new Posterior();
  for(let i=0;i<29;i++){
   ordered.observe(parts,-5,1,.2,.4,1,0,0);
   permuted.observe(i===10?[...parts].reverse():parts,-5,1,.2,.4,1,0,0);
  }
  const a=ordered.query(parts,0),b=permuted.query(parts,0);
  expect(a.m).toBeCloseTo(5.6495480901982855,10);
  expect(b.m).toBeCloseTo(a.m,10);
  expect(b.v).toBeCloseTo(a.v,10);
  const fit=permuted.inspect(),referenceFit=ordered.inspect();
  expect(fit.logPosterior(fit.c)).toBeCloseTo(referenceFit.logPosterior(referenceFit.c),10);
 });
 it.each([1e-15,1e-8])('does not jump to an inferior mode after an amplitude perturbation of %s',perturbation=>{
  const baseline=new Posterior(),perturbed=new Posterior();
  for(let i=0;i<29;i++){
   baseline.observe([part],-5,1,.2,.4,1,0,0);
   perturbed.observe([part],-5,1,.2,.4+(i===10?perturbation:0),1,0,0);
  }
  const actual=perturbed.inspect(),want=baseline.inspect();
  expect(actual.c[0]).toBeCloseTo(5.6495480901982855,6);
  expect(actual.c[0]).toBeCloseTo(want.c[0],6);
  expect(actual.S[0][0]).toBeCloseTo(want.S[0][0],6);
  // Test the perturbed objective itself: the old mode is still a valid
  // candidate and must not have a substantially higher posterior density.
  expect(actual.logPosterior(actual.c)).toBeGreaterThanOrEqual(actual.logPosterior(want.c)-1e-10);
 });
 it('retains the pooled likelihood lobe when all repeated amplitudes become distinct',()=>{
  const post=new Posterior(),amplitudes=Array.from({length:29},(_,i)=>.4+1e-15*i);
  for(const amplitude of amplitudes)post.observe([part],-5,1,.2,amplitude,1,0,0);
  const actual=post.inspect(),mode=actual.c[0],referenceMode=5.649548090198286;
  // Every family now has weight one. Their individual starts alone remain
  // near the inferior mode, although their combined evidence still supports
  // the same far mode. Check the perturbed likelihood directly and independently.
  const log=(x:number)=>-x*x/2+amplitudes.reduce((sum,A)=>sum+Math.log(.2+A/(1+Math.exp(-(x-5)))),0);
  const e=1/(1+Math.exp(-(mode-5)));
  const score=-mode+amplitudes.reduce((sum,A)=>sum+A*e*(1-e)/(.2+A*e),0);
  expect(mode).toBeCloseTo(referenceMode,10);
  expect(Math.abs(score)).toBeLessThan(2e-8);
  expect(log(mode)).toBeGreaterThanOrEqual(log(referenceMode)-1e-10);
  expect(actual.logPosterior(actual.c)).toBeCloseTo(log(mode),10);
 });
 it.each(['before','after'])('an unrelated component observed %s a static batch does not change that batch\'s mode',order=>{
  const baseline=new Posterior(),combined=new Posterior(),other={...part,id:'independent'};
  const unrelated=()=>combined.observe([other],0,1,.05,.92,1,0,0);
  if(order==='before')unrelated();
  for(let i=0;i<29;i++){
   baseline.observe([part],-5,1,.2,.4,1,0,0);
   combined.observe([part],-5,1,.2,.4,1,0,0);
  }
  if(order==='after')unrelated();
  const actual=combined.query([part],0),want=baseline.query([part],0);
  expect(actual.m).toBeCloseTo(want.m,6);
  expect(actual.v).toBeCloseTo(want.v,6);
  const fit=combined.inspect(),a=fit.ids.indexOf(part.id),b=fit.ids.indexOf(other.id);
  expect(fit.S[a][b]).toBeCloseTo(0,12);
 });
 it.each<Case>([
  {n:30,g:.2,A:.1,off:0,y:1},
  {n:300,g:.05,A:.4,off:-5,y:1},
  {n:100,g:.05,A:.4,off:3,y:0},
  {n:10,g:.2,A:.4,off:3,y:0},
  {n:100,g:.05,A:1e-8,off:0,y:1},
  {n:30,g:.2,A:.55,off:-2,y:1,extra:.49},
  {n:29,g:.2,A:.4,off:-5,y:1},
 ])('matches a scalar mode oracle with n=$n, g=$g, A=$A, offset=$off, outcome=$y',test=>{
  const actual=fittedPosterior(test),want=reference(test),x=actual.c[0],h=2e-4;
  const score=(want.logPosterior(x+h)-want.logPosterior(x-h))/(2*h);
  const curvature=-(want.logPosterior(x+h)-2*want.logPosterior(x)+want.logPosterior(x-h))/(h*h);
  expect(actual.fisher).toBe(false);
  expect(x).toBeCloseTo(want.mode,6);
  expect(Math.abs(score)).toBeLessThan(2e-5);
  expect(curvature).toBeGreaterThan(0);
  expect(Math.abs(actual.S[0][0]-1/curvature)).toBeLessThan(2e-5);
  expect(Number.isFinite(actual.S[0][0])).toBe(true);
 });
});

describe('Posterior: scalar Gaussian-site update',()=>{
 it('finds the global mode when the Gaussian and a guessed response create two local maxima',()=>{
  const test:Case={n:29,g:.2,A:.4,off:-5,y:1},want=reference(test);
  const eta=scalarMode({mean:-5,variance:1,y:1,g:.2,A:.4,w:29,extra:0});
  expect(want.mode).toBeCloseTo(5.6495480901982855,10);
  expect(eta+5).toBeCloseTo(want.mode,10);
  expect(Math.abs(want.score(eta+5))).toBeLessThan(1e-10);
  // The same likelihood information, rescaled between prior and site, has
  // the same mode; the update may not assume that site weight is <= 1.
  expect(scalarMode({mean:-5,variance:29,y:1,g:.2,A:.4,w:1,extra:0})).toBeCloseTo(eta,10);
  expect(scalarMode({mean:5,variance:1,y:0,g:.4,A:.4,w:29,extra:0})).toBeCloseTo(-eta,10);
 });
 it.each([-8,-2,0,2,8])('uses observed likelihood curvature, independently checked at eta=%s',eta=>{
  const g=.2,A=.4,extra=.49,att=1/Math.sqrt(1+Math.PI*extra/8),actual=eventLikelihood(eta,g,A,extra),h=1e-4;
  const probability=(x:number)=>g+A/(1+Math.exp(-att*x));
  for(const y of [0,1]){
   const log=(x:number)=>Math.log(y?probability(x):1-probability(x));
   const gradient=(log(eta+h)-log(eta-h))/(2*h);
   const curvature=-(log(eta+h)-2*log(eta)+log(eta-h))/(h*h);
   expect(actual.log(y)).toBeCloseTo(log(eta),12);
   expect(actual.G(y)).toBeCloseTo(gradient,8);
   expect(actual.J(y)).toBeCloseTo(curvature,6);
  }
  const d=(probability(eta+h)-probability(eta-h))/(2*h),p=probability(eta);
  expect(actual.p).toBeCloseTo(p,12);
  expect(actual.fisher).toBeCloseTo(d*d/(p*(1-p)),9);
 });
 it('preserves negative observed likelihood curvature rather than silently replacing it with Fisher information',()=>{
  const event=eventLikelihood(-5,.2,.4,0);
  expect(event.J(1)).toBeLessThan(0);
  expect(event.fisher).toBeGreaterThan(0);
  const input={mean:3,variance:1,y:0,g:.2,A:.4,w:10,extra:0},eta=scalarMode(input),J=eventLikelihood(eta,.2,.4,0).J(0);
  expect(1+input.variance*input.w*J).toBeGreaterThan(0);
  expect(1/(1+input.w*J)).toBeGreaterThan(input.variance);
 });
 it('keeps exact zero-information updates and stable gradients at saturated predictors',()=>{
  const input={mean:2.7,variance:.8,y:1,g:.05,A:0,w:1,extra:0};
  expect(scalarMode(input)).toBe(input.mean);
  expect(scalarMode({...input,A:.92,w:0})).toBe(input.mean);
  expect(scalarMode({...input,A:.92,variance:0})).toBe(input.mean);
  for(const eta of [-1000,1000]){
   const event=eventLikelihood(eta,0,1,0),opposite=eta<0?1:0;
   expect(event.log(opposite)).toBeCloseTo(-1000,12);
   expect(event.G(opposite)).toBe(eta<0?1:-1);
   expect(event.J(opposite)).toBe(0);
   expect(event.fisher).toBe(0);
   expect(Number.isFinite(scalarMode({...input,mean:eta,g:0,A:1,y:opposite}))).toBe(true);
  }
 });
});

type BlockSite={x:number[];off:number;y:0|1;g:number;A:number;w:number;extra:number};
/** Small independent dense inverse, used only for the Gaussian reference. */
function invertDense(input:number[][]):number[][]{
 const n=input.length,a=input.map((row,i)=>[...row,...Array.from({length:n},(_,j)=>+(i===j))]);
 for(let i=0;i<n;i++){
  let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;
  if(Math.abs(a[pivot][i])<1e-12)throw Error('Singular dense reference');
  [a[i],a[pivot]]=[a[pivot],a[i]];const scale=a[i][i];
  for(let j=0;j<2*n;j++)a[i][j]/=scale;
  for(let row=0;row<n;row++)if(row!==i){const factor=a[row][i];for(let j=0;j<2*n;j++)a[row][j]-=factor*a[i][j];}
 }
 return a.map(row=>row.slice(n));
}
function finiteSystem(log:(x:ArrayLike<number>)=>number,point:ArrayLike<number>){
 const n=point.length,h=1e-4,center=log(point);
 const at=(changes:[number,number][])=>{const x=Array.from(point);for(const[i,d]of changes)x[i]+=d;return log(x);};
 const gradient=Array.from({length:n},(_,i)=>(at([[i,h]])-at([[i,-h]]))/(2*h));
 const precision=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?
  -(at([[i,h]])-2*center+at([[i,-h]]))/(h*h):
  -(at([[i,h],[j,h]])-at([[i,h],[j,-h]])-at([[i,-h],[j,h]])+at([[i,-h],[j,-h]]))/(4*h*h)));
 return {gradient,precision};
}
/** The reference uses the actual incoming full Gaussian and direct Bernoulli logs.
 * Its Newton steps and final Hessian both come from finite differences, without
 * calling the production likelihood, scalar solver, or inspection objective. */
function denseBlockReference(mean:number[],covariance:number[][],sites:BlockSite[]){
 const P=invertDense(covariance);
 const log=(x:ArrayLike<number>)=>{
  let value=0;
  for(let i=0;i<mean.length;i++)for(let j=0;j<mean.length;j++)value-=.5*(x[i]-mean[i])*P[i][j]*(x[j]-mean[j]);
  for(const site of sites){
   let eta=site.off;for(let i=0;i<mean.length;i++)eta+=site.x[i]*x[i];
   const att=1/Math.sqrt(1+Math.PI*site.extra/8),p=site.g+site.A/(1+Math.exp(-eta*att));
   value+=site.w*Math.log(site.y?p:1-p);
  }
  return value;
 };
 let mode=mean.slice();
 for(let iteration=0;iteration<30;iteration++){
  const {gradient,precision}=finiteSystem(log,mode),cov=invertDense(precision);
  const step=cov.map(row=>row.reduce((sum,v,j)=>sum+v*gradient[j],0));
  if(Math.max(...step.map(Math.abs))<1e-9)break;
  const before=log(mode);let accepted=false;
  for(let amount=1,attempt=0;attempt<24;attempt++,amount/=2){
   const next=mode.map((v,i)=>v+amount*step[i]);
   if(log(next)>=before-1e-12){mode=next;accepted=true;break;}
  }
  if(!accepted)throw Error('Dense reference line search did not converge');
 }
 return {mode,covariance:invertDense(finiteSystem(log,mode).precision),log};
}

describe('Posterior: same-time block against a full transported Gaussian',()=>{
 const day=86400e3,parts:Part[]=[
  {...part,id:'a',prior:1,v:1,q:0},
  {...part,id:'b',prior:.5,v:.5,q:.02},
  {...part,id:'c',prior:.25,v:.25,q:.01},
 ];
 const cases:{name:string;sites:BlockSite[]}[]=[
  {name:'rank-one hint ladder',sites:[
   {x:[1,1,.4],off:0,y:0,g:.05,A:.92,w:1,extra:.49},
   {x:[1,1,.4],off:1,y:0,g:.05,A:.85,w:1,extra:.49},
   {x:[1,1,.4],off:2,y:1,g:.05,A:.78,w:1,extra:.49},
  ]},
  {name:'different sparse predictors',sites:[
   {x:[1,.4,-.3],off:1.3,y:0,g:.2,A:.6,w:.7,extra:.49},
   {x:[.2,1,.5],off:-.4,y:1,g:.1,A:.65,w:1,extra:0},
   {x:[.8,-.1,1],off:.7,y:1,g:.05,A:.75,w:.4,extra:.25},
  ]},
  {name:'nearly collinear predictors',sites:[
   {x:[1,1,.5],off:0,y:0,g:.05,A:.92,w:1,extra:.49},
   {x:[1,1+1e-7,.5-1e-7],off:1,y:0,g:.05,A:.85,w:1,extra:.49},
   {x:[1-2e-7,1,.5],off:2,y:1,g:.05,A:.78,w:1,extra:.49},
  ]},
  {name:'an unobserved correlated component',sites:[
   {x:[1,0,0],off:.5,y:0,g:.15,A:.7,w:1,extra:.49},
   {x:[0,1,0],off:-.5,y:1,g:.05,A:.85,w:.8,extra:.25},
  ]},
 ];
 it.each(cases)('matches independent dense mode and observed curvature for $name',({sites})=>{
  const post=new Posterior();
  for(let i=0;i<12;i++)post.observe(parts,0,+(i%3!==0),.1,.8,1,0,0);
  const prior=post.inspect(),mean=Array.from(prior.c),gap=2.5;
  const r=parts.map(p=>Math.exp(-p.q*gap/(2*p.prior)));
  const covariance=Array.from(prior.S,(row,i)=>Array.from(row,(value,j)=>i===j?
   (value<parts[i].prior?Math.min(parts[i].prior,value+parts[i].q*gap):Math.max(parts[i].prior,value-parts[i].q*gap)):
   value*r[i]*r[j]));
  expect(covariance[0][1]).toBeLessThan(-.01);
  const expected=denseBlockReference(mean,covariance,sites);
  for(const site of sites)post.observe(parts.map((p,i)=>({...p,x:site.x[i]})),site.off,site.y,site.g,site.A,site.w,site.extra,gap*day);
  const actual=post.inspect(),check=finiteSystem(expected.log,actual.c),inverse=invertDense(check.precision);
  for(let i=0;i<parts.length;i++){
   expect(actual.c[i]).toBeCloseTo(expected.mode[i],5);
   expect(Math.abs(check.gradient[i])).toBeLessThan(2e-6);
   for(let j=0;j<parts.length;j++){
    expect(Math.abs(actual.S[i][j]-expected.covariance[i][j])).toBeLessThan(2e-5);
    expect(Math.abs(actual.S[i][j]-inverse[i][j])).toBeLessThan(2e-5);
   }
  }
  // An objective hook must retain the actual prior's center and precision;
  // substituting a likelihood score to force a zero gradient is not equivalent.
  for(const shift of [[.03,-.02,.015],[-.04,.01,-.025]]){
   const candidate=Float64Array.from(actual.c,(value,i)=>value+shift[i]);
   const reported=actual.logPosterior(candidate)-actual.logPosterior(actual.c);
   const independent=expected.log(candidate)-expected.log(actual.c);
   expect(reported).toBeCloseTo(independent,8);
  }
  expect(actual.fisher).toBe(false);
 });
});

describe('Posterior: block modes are independent of the whitening basis',()=>{
 const day=86400e3,parts=[{...part,id:'a',prior:.5,v:.5,q:.02},{...part,id:'b',prior:.5,v:.5,q:.01}];
 // Two initial balanced canonical responses leave mean zero and covariance
 // diag(.5,.5) - ones(2,2)/12. Ten days restore both marginal priors while
 // multiplying the covariance by exp(-.3), so the sum has this known variance.
 const variance=1-Math.exp(-.3)/6;
 const log=(sum:number)=>{
  const p=.2+.4/(1+Math.exp(-(sum-10))),q=.2+.75/(1+Math.exp(-(sum+8)));
  return -sum*sum/(2*variance)+Math.log(1-p)+20*Math.log(1-q);
 };
 const score=(sum:number)=>{
  const e=1/(1+Math.exp(-(sum-10))),f=1/(1+Math.exp(-(sum+8)));
  return -sum/variance-.4*e*(1-e)/(1-.2-.4*e)-20*.75*f*(1-f)/(1-.2-.75*f);
 };
 // An independent bounded scalar search enumerates all sign-changing stationary
 // points and compares actual densities. The Gaussian bound excludes exterior
 // global maxima; the fine scan resolves both maxima and the intervening minimum.
 const radius=Math.sqrt(-2*variance*log(0))+1,candidates=[0,-radius,radius];
 for(let i=0;i<4096;i++){
  let lo=-radius+2*radius*i/4096,hi=-radius+2*radius*(i+1)/4096;
  const left=score(lo);if(left*score(hi)>=0)continue;
  for(let j=0;j<70;j++){const mid=(lo+hi)/2;if((score(mid)>0)===(left>0))lo=mid;else hi=mid;}
  candidates.push((lo+hi)/2);
 }
 const mode=candidates.reduce((best,x)=>log(x)>log(best)?x:best,0),h=2e-4;
 const curvature=-(log(mode+h)-2*log(mode)+log(mode-h))/(h*h);
 it.each([0,1e-12,1e-8])('fits the supported likelihood lobe with predictor perturbation %s',perturbation=>{
  const post=new Posterior();
  post.observe(parts,0,0,0,1,1,0,0);post.observe(parts,0,1,0,1,1,0,0);
  post.observe([parts[0],{...parts[1],x:1+perturbation}],-10,0,.2,.4,1,0,10*day);
  for(let i=0;i<20;i++)post.observe(parts,8,0,.2,.75,1,0,10*day);
  const actual=post.query(parts,10*day),fit=post.inspect();
  expect(mode).toBeCloseTo(-7.93935089617298,10);
  expect(actual.m).toBeCloseTo(mode,6);
  expect(Math.abs(score(actual.m))).toBeLessThan(2e-6);
  expect(Math.abs(actual.v-1/curvature)).toBeLessThan(2e-5);
  // The far mode remains a concrete better candidate even if a local solver
  // reports a stationary, positive-curvature near-zero mode instead.
  const candidate=Float64Array.of(mode/2,mode/2);
  expect(fit.logPosterior(fit.c)).toBeGreaterThanOrEqual(fit.logPosterior(candidate)-1e-9);
 });
});
