// N186. The ability the Atlas reports (cards, intervals, certification), fitted jointly, apart from the filter that predicts.
//
// measure.ts updates each component of an ability (you, facet, ancestors, concept, concept×facet, …) one attempt at a time, each with
// its own variance: the diagonal of a Gaussian. One attempt moves all of them by the same observation, so they are negatively
// correlated, and the variance of their SUM (the ability being reported) is smaller than the sum of their variances; the same
// approximation makes each step overshoot. On the production data of 2026-11-19 it reported sd 1.0-1.3 where the exact posterior is
// 0.55-1.05, so practised facets showed "—" and could not be certified. In a simulation drawn from the model's own prior the filter's
// estimate was off by 0.9-1.1 (rms) where a joint fit is off by 0.5-0.7.
//
// So the reported ability is the Gaussian (Laplace) posterior given ALL attempts: the mode of the joint likelihood and prior, and the
// covariance there. A simulation of 60 learners x 3 concepts puts the nominal 80% interval around the truth 82-86% of the time (the
// filter's own mean and sd: 88-92%, with twice the error). The predictions were validated against the research harness with the
// filter, so they are left alone: this module supplies only the reported mean and variance.
//
// It stores, per attempt, the components it touched and what the filter measured (amplitude, guess, outcome, weight); the fit runs once,
// on the first query. Cost: replay is unchanged; the fit is a few Cholesky solves of an n×n precision matrix, about 0.1 s at the cap on
// a large account and a few milliseconds on a normal one. Ageing (variance grows q per day up to its prior, and an instruction event
// adds 0.5 to the concept) is applied at query time; cross-covariances decay as each marginal returns to its prior.
//
// It holds at most MAX components. Item difficulties (one per question, many) and any component beyond the cap are not fitted: they
// keep the filter's own mean and variance, entering the likelihood as a fixed offset and an extra variance. That is the old behaviour
// for them, so a very large account degrades to it, never worse.
import {DAY} from './math.ts';

/** One term of a linear predictor: component id, feature x, prior variance and mean, ageing rate q, and the filter's own current mean and variance. */
export type Part={id:string;x:number;prior:number;q:number;m0:number;m:number;v:number};
export type Obs={ids:number[];xs:number[];y:number;g:number;A:number;off:number;w:number;extra:number;epochs:number[];logs:number[]};
const sig=(x:number)=>1/(1+Math.exp(-x));
const clampP=(p:number)=>Math.min(1-1e-9,Math.max(1e-9,p));

export class Posterior{
 static MAX=256;
 private idx=new Map<string,number>();
 private prior:number[]=[];private m0:number[]=[];private q:number[]=[];private at:number[]=[];private bump:number[]=[];
 /** Evidence-survival snapshots are appended to observations; lastFilterV is supplied by the diagonal filter after each step. */
 private epochs:number[]=[];private logs:number[]=[];private lastFilterV:number[]=[];
 private obs:Obs[]=[];
 private fit:{c:Float64Array;S:Float64Array[];Vs:number[];fisher:boolean;used:Obs[]}|null=null;
 private peer:Posterior|null=null;
 get size():number{return this.prior.length;}
 /** The two hypotheses see identical attempts until a card review couples them; then one fit serves both. */
 link(peer:Posterior):void{this.peer=peer;}
 private same(o:Posterior):boolean{
  if(this.prior.length!==o.prior.length||this.obs.length!==o.obs.length)return false;
  for(let i=0;i<this.prior.length;i++)if(this.prior[i]!==o.prior[i]||this.m0[i]!==o.m0[i]||this.q[i]!==o.q[i]||this.at[i]!==o.at[i]||this.bump[i]!==o.bump[i]||this.epochs[i]!==o.epochs[i]||this.logs[i]!==o.logs[i])return false;
  for(let k=0;k<this.obs.length;k++){const a=this.obs[k],b=o.obs[k];
   if(a.y!==b.y||a.g!==b.g||a.A!==b.A||a.off!==b.off||a.w!==b.w||a.extra!==b.extra||a.ids.length!==b.ids.length)return false;
   for(let j=0;j<a.ids.length;j++)if(a.ids[j]!==b.ids[j]||a.xs[j]!==b.xs[j]||a.epochs[j]!==b.epochs[j]||a.logs[j]!==b.logs[j])return false;}
  return true;
 }
 /** Items are one component per question: never fitted. */
 private slot(id:string,prior:number,q:number,m0:number,t:number):number{
  const found=this.idx.get(id);if(found!==undefined)return found;
  if(id.startsWith('item:')||this.prior.length>=Posterior.MAX)return -1;
  const i=this.prior.length;this.idx.set(id,i);this.prior.push(prior);this.q.push(q);this.m0.push(m0);this.at.push(t);this.bump.push(0);this.epochs.push(0);this.logs.push(0);this.lastFilterV.push(NaN);return i;
 }
 /** An instruction event: the concept's variance rises by `bump` (capped at its prior at query time), as the filter does. */
 touch(id:string,prior:number,q:number,m0:number,t:number,bump:number):void{
  const i=this.slot(id,prior,q,m0,t);if(i<0)return;
  this.bump[i]+=bump;this.fit=null;
 }
 /**
  * One attempt: `parts` are the predictor's components BEFORE the filter updated them; `eta` is the filter's whole linear predictor
  * (including the hint, difficulty offset and any uncued shift), `A` the amplitude and `g` the guess floor of the likelihood, `w` the
  * attempt's weight, `extra` the variance of terms outside the components (the unknown item difficulty).
  */
 observe(parts:Part[],eta:number,y:number,g:number,A:number,w:number,extra:number,t:number):void{
  if(!(w>0))return;
  const ids:number[]=[],xs:number[]=[];let off=eta,nuis=extra;
  for(const p of parts){
   if(p.x===0)continue;
   const i=this.slot(p.id,p.prior,p.q,p.m0,t);
   if(i<0){nuis+=p.x*p.x*p.v;continue;}
   ids.push(i);xs.push(p.x);off-=p.m*p.x;
  }
  if(!ids.length)return;
  // The process variance since the previous observation destroys old evidence about the current latent, not just
  // confidence at query time. An epoch change means the component has fully returned to its independent prior.
  for(const i of new Set(ids)){
   const drift=this.q[i]*Math.max(0,(t-this.at[i])/DAY)+this.bump[i],lastV=this.lastFilterV[i];
   if(drift>0&&Number.isFinite(lastV)){
    const room=Math.max(0,this.prior[i]-lastV);
    if(room<=1e-12||drift>=room){this.epochs[i]++;this.logs[i]=0;}
    else this.logs[i]+=.5*Math.log1p(-drift/room);
   }
   this.at[i]=Math.max(this.at[i],t);this.bump[i]=0;
  }
  this.obs.push({ids,xs,y,g,A,off,w,extra:nuis,epochs:ids.map(i=>this.epochs[i]),logs:ids.map(i=>this.logs[i])});
  this.fit=null;
 }
 /** Call immediately after the production ADF update to retain its actual marginal variance for the next transition. */
 after(parts:Part[]):void{
  for(const part of parts){const i=this.idx.get(part.id);if(i!==undefined)this.lastFilterV[i]=part.v;}
 }
 private solve():{c:Float64Array;S:Float64Array[];Vs:number[];fisher:boolean;used:Obs[]}{
  if(this.fit)return this.fit;
  if(this.peer&&this.same(this.peer))return this.fit=this.peer.solve();
  const n=this.prior.length,c=Float64Array.from(this.m0);
  // Approximate process marginalisation. Old component θ_old = m0 + r(θ_now-m0) + ε,
  // Var(ε)=prior*(1-r²). A full reset (r=0) removes every old likelihood contribution to the component.
  // Group repeated appearances of the same component when calculating the nuisance variance.
  const used=this.obs.map(o=>{
   const xs=o.xs.slice(),groups=new Map<number,{x:number;r:number}>();
   let off=o.off,extra=o.extra;
   for(let a=0;a<o.ids.length;a++){
    const i=o.ids[a],r=o.epochs[a]===this.epochs[i]?Math.exp(Math.min(0,this.logs[i]-o.logs[a])):0;
    xs[a]=o.xs[a]*r;off+=o.xs[a]*(1-r)*this.m0[i];
    const group=groups.get(i);if(group)group.x+=o.xs[a];else groups.set(i,{x:o.xs[a],r});
   }
   for(const [i,group] of groups)extra+=group.x*group.x*this.prior[i]*(1-group.r*group.r);
   return {...o,xs,off,extra};
  });
  // Only excluded components and process innovations are marginalised. Fitted coefficients are conditioned
  // on in the likelihood; attenuating by their posterior variance again double-counts uncertainty.
  const lik=(o:Obs,cc:Float64Array,V:number)=>{
   let eta=o.off;for(let a=0;a<o.ids.length;a++)eta+=cc[o.ids[a]]*o.xs[a];
   const att=1/Math.sqrt(1+Math.PI*Math.max(0,V)/8),e=sig(eta*att),p=clampP(o.g+o.A*e);
   return {p,att,e,d:o.A*att*e*(1-e)};
  };
  const logPost=(cc:Float64Array,Vs:number[]):number=>{
   let z=0;used.forEach((o,k)=>{const {p}=lik(o,cc,Vs[k]);z+=o.w*(o.y?Math.log(p):Math.log(1-p));});
   for(let i=0;i<n;i++)z-=.5*(cc[i]-this.m0[i])**2/this.prior[i];return z;
  };
  /** Cholesky factor, or null when the matrix is not positive definite. */
  const chol=(P:Float64Array[],strict=false):Float64Array[]|null=>{
   const L=Array.from({length:n},()=>new Float64Array(n));
   for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    let sum=P[i][j];for(let k=0;k<j;k++)sum-=L[i][k]*L[j][k];
    if(i===j){if(strict&&!(sum>1e-9))return null;L[i][j]=Math.sqrt(Math.max(sum,1e-12));}else L[i][j]=sum/L[j][j];
   }
   return L;
  };
  const solveWith=(L:Float64Array[],rhs:Float64Array):Float64Array=>{
   const y=new Float64Array(n),x=new Float64Array(n);
   for(let i=0;i<n;i++){let sum=rhs[i];for(let k=0;k<i;k++)sum-=L[i][k]*y[k];y[i]=sum/L[i][i];}
   for(let i=n-1;i>=0;i--){let sum=y[i];for(let k=i+1;k<n;k++)sum-=L[k][i]*x[k];x[i]=sum/L[i][i];}
   return x;
  };
  const inverse=(L:Float64Array[]):Float64Array[]=>{
   const X=Array.from({length:n},()=>new Float64Array(n));
   for(let col=0;col<n;col++){const e=new Float64Array(n);e[col]=1;const x=solveWith(L,e);for(let i=0;i<n;i++)X[i][col]=x[i];}
   return X;
  };
  /** Gradient of the log posterior, and its negative Hessian: the expected information (Fisher, always positive semi-definite, used for
   *  the Newton steps) or the observed one (the true curvature of p = g + A·σ(η), used for the reported covariance). */
  const system=(cc:Float64Array,Vs:number[],observed:boolean):{P:Float64Array[];g:Float64Array}=>{
   const P=Array.from({length:n},(_,i)=>{const r=new Float64Array(n);r[i]=1/this.prior[i];return r;}),g=new Float64Array(n);
   for(let i=0;i<n;i++)g[i]=-(cc[i]-this.m0[i])/this.prior[i];
   used.forEach((o,k)=>{
    const {p,att,e,d}=lik(o,cc,Vs[k]),v=p*(1-p),G=(o.y-p)*d/v;
    let J=d*d/v;
    if(observed){const d2=o.A*att*att*e*(1-e)*(1-2*e);J+=(o.y-p)*(d*d*(1-2*p)/(v*v)-d2/v);}
    for(let a=0;a<o.ids.length;a++){const ia=o.ids[a],xa=o.xs[a];g[ia]+=o.w*G*xa;const row=P[ia];for(let b=0;b<o.ids.length;b++)row[o.ids[b]]+=o.w*J*xa*o.xs[b];}
   });
   return {P,g};
  };
  const newton=(Vs:number[],iterations:number,tolerance:number):void=>{
   let current=logPost(c,Vs);
   for(let it=0;it<iterations;it++){
    const {P,g}=system(c,Vs,false),dc=solveWith(chol(P)!,g);
    let step=1,value=-Infinity;const next=new Float64Array(n);
    for(let tries=0;tries<5;tries++,step/=2){for(let i=0;i<n;i++)next[i]=c[i]+step*dc[i];value=logPost(next,Vs);if(value>=current-1e-12)break;}
    let move=0;for(let i=0;i<n;i++)move=Math.max(move,Math.abs(next[i]-c[i]));
    if(value>=current-1e-12){c.set(next);current=value;}
    if(move<tolerance)break;
   }
  };
  if(!this.obs.length){return this.fit={c,S:Array.from({length:n},(_,i)=>{const r=new Float64Array(n);r[i]=this.prior[i];return r;}),Vs:[],fisher:false,used};}
  // Conditional likelihood for fitted latents; only independent nuisance terms are integrated approximately.
  // Report the observed curvature of the log posterior at this mode.
  const Vs=used.map(o=>o.extra);
  newton(Vs,12,1e-7);
  let fisher=false,L=chol(system(c,Vs,true).P,true);
  if(!L){fisher=true;L=chol(system(c,Vs,false).P)!;}
  return this.fit={c,S:inverse(L),Vs,fisher,used};
 }

 /** Mean and variance of Σ x·component at time t.
  * Each fitted marginal ages at the filter's q/day rate (plus instruction bumps), capped at its prior. Ageing also removes
  * evidence-induced cross-covariances. Each marginal grows linearly by δ while correlations are retained initially
  * and then fade smoothly with r_i² = 1 - (δ/(prior_i-Sii))³. The covariance is D S D plus diagonal
  * (Sii + δ - r_i²·Sii), with D=diag(r_i). It is positive semidefinite, has the exact required marginal
  * ageing rate, and becomes the independent prior when each component's marginal reaches its cap. This cubic
  * relaxation is an explicit reporting approximation (not an exact OU process), avoiding prematurely hiding
  * recent evidence while still completely forgetting its correlations at the prior.
  * The old cap on the summed variance did not do this: all marginals could be at their priors while their negative
  * covariances still hid uncertainty. Means stay fixed, as in the filter.
  */
 query(parts:Part[],t:number):{m:number;v:number}{
  const {c,S}=this.solve();let m=0,extra=0;
  // Combine repeated occurrences of one latent component before ageing its covariance.
  const xs=new Map<number,number>(),others=new Map<string,{x:number;m:number;v:number}>();
  for(const part of parts){
   if(part.x===0)continue;
   const i=this.idx.get(part.id);
   if(i===undefined){
    const prior=others.get(part.id);
    if(prior)prior.x+=part.x;else others.set(part.id,{x:part.x,m:part.m,v:part.v});
    continue;
   }
   m+=part.x*c[i];xs.set(i,(xs.get(i)??0)+part.x);
  }
  // Non-fitted items and components beyond the cap remain independent, but repeated uses of the SAME one are not.
  for(const o of others.values()){m+=o.x*o.m;extra+=o.x*o.x*o.v;}
  let v=extra;
  const used:{i:number;x:number;r:number}[]=[];
  for(const [i,x] of xs){
   const diagonal=S[i][i],room=Math.max(0,this.prior[i]-diagonal);
   const drift=this.q[i]*Math.max(0,(t-this.at[i])/DAY)+this.bump[i];
   const added=Math.min(room,Math.max(0,drift));
   const fraction=room>0?added/room:0;
   const r=room>0?Math.sqrt(Math.max(0,1-fraction*fraction*fraction)):1;
   v+=x*x*(diagonal+added);
   used.push({i,x,r});
  }
  for(let a=0;a<used.length;a++)for(let b=0;b<a;b++){
   const u=used[a],w=used[b];v+=2*u.x*w.x*u.r*w.r*S[u.i][w.i];
  }
  return {m,v:Math.max(v,1e-12)};
 }
 /** For tests: the fitted mean and covariance, the per-attempt attenuation variances it used, the log posterior with them held fixed, and whether the Fisher fallback was taken. */
 inspect():{ids:string[];c:Float64Array;S:Float64Array[];Vs:number[];obs:Obs[];prior:number[];logPosterior:(cc:Float64Array)=>number;fisher:boolean}{
  const {c,S,Vs,fisher,used}=this.solve(),n=this.prior.length;
  const logPosterior=(cc:Float64Array):number=>{
   let z=0;used.forEach((o,k)=>{
    let eta=o.off;for(let a=0;a<o.ids.length;a++)eta+=cc[o.ids[a]]*o.xs[a];
    const att=1/Math.sqrt(1+Math.PI*Math.max(0,Vs[k])/8),p=clampP(o.g+o.A*sig(eta*att));z+=o.w*(o.y?Math.log(p):Math.log(1-p));
   });
   for(let i=0;i<n;i++)z-=.5*(cc[i]-this.m0[i])**2/this.prior[i];return z;
  };
  return {ids:[...this.idx.keys()],c,S,Vs,obs:used,prior:this.prior,logPosterior,fisher};
 }
}
