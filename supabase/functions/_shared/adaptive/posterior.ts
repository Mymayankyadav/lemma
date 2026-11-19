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
// adds 0.5 to the concept) is applied at query time, only for what has happened since a component was last observed.
//
// It holds at most MAX components. Item difficulties (one per question, many) and any component beyond the cap are not fitted: they
// keep the filter's own mean and variance, entering the likelihood as a fixed offset and an extra variance. That is the old behaviour
// for them, so a very large account degrades to it, never worse.
import {DAY} from './math.ts';

/** One term of a linear predictor: component id, feature x, prior variance and mean, ageing rate q, and the filter's own current mean and variance. */
export type Part={id:string;x:number;prior:number;q:number;m0:number;m:number;v:number};
type Obs={ids:number[];xs:number[];y:number;g:number;A:number;off:number;w:number;extra:number};
const sig=(x:number)=>1/(1+Math.exp(-x));
const clampP=(p:number)=>Math.min(1-1e-9,Math.max(1e-9,p));

export class Posterior{
 static MAX=256;
 private idx=new Map<string,number>();
 private prior:number[]=[];private m0:number[]=[];private q:number[]=[];private at:number[]=[];private bump:number[]=[];
 private obs:Obs[]=[];
 private fit:{c:Float64Array;S:Float64Array[]}|null=null;
 private peer:Posterior|null=null;
 get size():number{return this.prior.length;}
 /** The two hypotheses see identical attempts until a card review couples them; then one fit serves both. */
 link(peer:Posterior):void{this.peer=peer;}
 private same(o:Posterior):boolean{
  if(this.prior.length!==o.prior.length||this.obs.length!==o.obs.length)return false;
  for(let i=0;i<this.prior.length;i++)if(this.prior[i]!==o.prior[i]||this.m0[i]!==o.m0[i]||this.q[i]!==o.q[i]||this.at[i]!==o.at[i]||this.bump[i]!==o.bump[i])return false;
  for(let k=0;k<this.obs.length;k++){const a=this.obs[k],b=o.obs[k];
   if(a.y!==b.y||a.g!==b.g||a.A!==b.A||a.off!==b.off||a.w!==b.w||a.extra!==b.extra||a.ids.length!==b.ids.length)return false;
   for(let j=0;j<a.ids.length;j++)if(a.ids[j]!==b.ids[j]||a.xs[j]!==b.xs[j])return false;}
  return true;
 }
 /** Items are one component per question: never fitted. */
 private slot(id:string,prior:number,q:number,m0:number,t:number):number{
  const found=this.idx.get(id);if(found!==undefined)return found;
  if(id.startsWith('item:')||this.prior.length>=Posterior.MAX)return -1;
  const i=this.prior.length;this.idx.set(id,i);this.prior.push(prior);this.q.push(q);this.m0.push(m0);this.at.push(t);this.bump.push(0);return i;
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
  this.obs.push({ids,xs,y,g,A,off,w,extra:nuis});
  for(const i of ids){this.at[i]=Math.max(this.at[i],t);this.bump[i]=0;}   // fresh evidence absorbs earlier ageing and bumps
  this.fit=null;
 }
 private solve():{c:Float64Array;S:Float64Array[]}{
  if(this.fit)return this.fit;
  if(this.peer&&this.same(this.peer))return this.fit=this.peer.solve();
  const n=this.prior.length,c=Float64Array.from(this.m0);let S:Float64Array[]|null=null;
  const quad=(o:Obs):number=>{
   let v=o.extra;
   if(!S){for(let a=0;a<o.ids.length;a++)v+=o.xs[a]*o.xs[a]*this.prior[o.ids[a]];return v;}
   for(let a=0;a<o.ids.length;a++){const row=S[o.ids[a]];for(let b=0;b<o.ids.length;b++)v+=o.xs[a]*o.xs[b]*row[o.ids[b]];}
   return v;
  };
  const eval1=(o:Obs,cc:Float64Array):{p:number;d:number}=>{
   let eta=o.off;for(let a=0;a<o.ids.length;a++)eta+=cc[o.ids[a]]*o.xs[a];
   const att=1/Math.sqrt(1+Math.PI*Math.max(0,quad(o))/8),e=sig(eta*att);return {p:clampP(o.g+o.A*e),d:o.A*e*(1-e)*att};
  };
  const logPost=(cc:Float64Array):number=>{
   let z=0;for(const o of this.obs){const {p}=eval1(o,cc);z+=o.w*(o.y?Math.log(p):Math.log(1-p));}
   for(let i=0;i<n;i++)z-=.5*(cc[i]-this.m0[i])**2/this.prior[i];return z;
  };
  const chol=(P:Float64Array[]):Float64Array[]=>{
   const L=Array.from({length:n},()=>new Float64Array(n));
   for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let sum=P[i][j];for(let k=0;k<j;k++)sum-=L[i][k]*L[j][k];L[i][j]=i===j?Math.sqrt(Math.max(sum,1e-12)):sum/L[j][j];}
   return L;
  };
  const solveWith=(L:Float64Array[],rhs:Float64Array):Float64Array=>{
   const y=new Float64Array(n),x=new Float64Array(n);
   for(let i=0;i<n;i++){let sum=rhs[i];for(let k=0;k<i;k++)sum-=L[i][k]*y[k];y[i]=sum/L[i][i];}
   for(let i=n-1;i>=0;i--){let sum=y[i];for(let k=i+1;k<n;k++)sum-=L[k][i]*x[k];x[i]=sum/L[i][i];}
   return x;
  };
  const system=(cc:Float64Array):{P:Float64Array[];g:Float64Array}=>{
   const P=Array.from({length:n},(_,i)=>{const r=new Float64Array(n);r[i]=1/this.prior[i];return r;}),g=new Float64Array(n);
   for(let i=0;i<n;i++)g[i]=-(cc[i]-this.m0[i])/this.prior[i];
   for(const o of this.obs){
    const {p,d}=eval1(o,cc),G=(o.y-p)*d/(p*(1-p)),H=d*d/(p*(1-p));
    for(let a=0;a<o.ids.length;a++){const ia=o.ids[a],xa=o.xs[a];g[ia]+=o.w*G*xa;const row=P[ia];for(let b=0;b<o.ids.length;b++)row[o.ids[b]]+=o.w*H*xa*o.xs[b];}
   }
   return {P,g};
  };
  // The probit attenuation needs the posterior variance of each attempt's predictor. It is taken from the prior for the first step, from
  // the posterior after it for the rest (one inverse), and recomputed once more at the end for the reported covariance.
  const inverse=(L:Float64Array[]):Float64Array[]=>{
   const X=Array.from({length:n},()=>new Float64Array(n));
   for(let col=0;col<n;col++){const e=new Float64Array(n);e[col]=1;const x=solveWith(L,e);for(let i=0;i<n;i++)X[i][col]=x[i];}
   return X;
  };
  let current=this.obs.length?logPost(c):0,last:{P:Float64Array[];L:Float64Array[]}|null=null;
  for(let it=0;it<10&&this.obs.length;it++){
   const {P,g}=system(c),L=chol(P),dc=solveWith(L,g);
   let step=1,value=-Infinity;const next=new Float64Array(n);
   for(let tries=0;tries<5;tries++,step/=2){for(let i=0;i<n;i++)next[i]=c[i]+step*dc[i];value=logPost(next);if(value>=current-1e-12)break;}
   let move=0;for(let i=0;i<n;i++)move=Math.max(move,Math.abs(next[i]-c[i]));
   if(value>=current-1e-12){c.set(next);current=value;}
   last={P,L};
   if(it===0)S=inverse(L);
   if(move<1e-4)break;
  }
  if(last){const {P}=system(c),L=chol(P);S=inverse(L);}
  if(!S)S=Array.from({length:n},(_,i)=>{const r=new Float64Array(n);r[i]=this.prior[i];return r;});
  return this.fit={c,S};
 }
 /** Mean and variance of Σ x·component at time `t`, including the ageing since each component was last observed. */
 query(parts:Part[],t:number):{m:number;v:number}{
  const {c,S}=this.solve();let m=0,v=0;const used:{i:number;x:number}[]=[];
  for(const p of parts){
   if(p.x===0)continue;
   const i=this.idx.get(p.id);
   if(i===undefined){m+=p.x*p.m;v+=p.x*p.x*p.v;continue;}
   const pending=Math.min(this.prior[i]-S[i][i],this.q[i]*Math.max(0,(t-this.at[i])/DAY)+this.bump[i]);
   m+=p.x*c[i];v+=p.x*p.x*Math.max(0,pending);used.push({i,x:p.x});
  }
  for(const a of used){const row=S[a.i];for(const b of used)v+=a.x*b.x*row[b.i];}
  return {m,v:Math.max(v,1e-12)};
 }
}
