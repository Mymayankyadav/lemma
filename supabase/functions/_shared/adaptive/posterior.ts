// N186. Joint Gaussian reporting, independent of the production prediction filter.
// With no process noise, fit the joint likelihood and prior by Laplace approximation.
// At a time/instruction transition, carry that Gaussian (including its correlations)
// forward, then condition on each new scalar likelihood. This is a sequential Laplace
// approximation, not an exact temporal posterior or a refit of forgotten observations.
// Recording remains cheap; fitting is lazy and identical hypotheses share its result.
import {DAY} from './math.ts';

export type Part={id:string;x:number;prior:number;q:number;m0:number;m:number;v:number};
export type Obs={ids:number[];xs:number[];y:number;g:number;A:number;off:number;w:number;extra:number;t:number};
type Event={kind:'observation';obs:Obs}|{kind:'instruction';i:number;t:number;bump:number};
type Matrix=Float64Array[];
type Gaussian={c:Float64Array;S:Matrix;fisher:boolean;used:Obs[];logPosterior:(cc:Float64Array)=>number};
type Fit=Gaussian&{at:number};

/** A failed factorization is explicit: never manufacture positive pivots. */
function cholesky(P:Matrix):Matrix|null{
 const n=P.length,L=Array.from({length:n},()=>new Float64Array(n));
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
  let sum=P[i][j];for(let k=0;k<j;k++)sum-=L[i][k]*L[j][k];
  if(i===j){if(!(sum>0)||!Number.isFinite(sum))return null;L[i][j]=Math.sqrt(sum);}
  else L[i][j]=sum/L[j][j];
 }
 return L;
}
function solveWith(L:Matrix,rhs:Float64Array):Float64Array{
 const n=L.length,y=new Float64Array(n),x=new Float64Array(n);
 for(let i=0;i<n;i++){let sum=rhs[i];for(let k=0;k<i;k++)sum-=L[i][k]*y[k];y[i]=sum/L[i][i];}
 for(let i=n-1;i>=0;i--){let sum=y[i];for(let k=i+1;k<n;k++)sum-=L[k][i]*x[k];x[i]=sum/L[i][i];}
 return x;
}
function inverse(L:Matrix):Matrix{
 const n=L.length,S=Array.from({length:n},()=>new Float64Array(n));
 for(let i=0;i<n;i++){const e=new Float64Array(n);e[i]=1;const x=solveWith(L,e);for(let j=0;j<n;j++)S[j][i]=x[j];}
 return S;
}
function gaussianObjective(c:Float64Array,S:Matrix):(cc:Float64Array)=>number{
 let factor:Matrix|null=null;
 return cc=>{
  factor??=cholesky(S);if(!factor)throw Error('Invalid reporting covariance');
  const delta=Float64Array.from(cc,(value,i)=>value-c[i]),solved=solveWith(factor,delta);
  return -.5*delta.reduce((sum,value,i)=>sum+value*solved[i],0);
 };
}

export class Posterior{
 static MAX=256;
 private idx=new Map<string,number>();
 private prior:number[]=[];private m0:number[]=[];private q:number[]=[];
 private rates:number[]=[];private rateGroups:number[]=[];
 private ageWork:{r:Float64Array;diagonal:Float64Array;retention:Float64Array}|null=null;
 private events:Event[]=[];
 private fit:Fit|null=null;
 private peer:Posterior|null=null;
 private covarianceWork=new WeakMap<Matrix,{d:Float64Array;x:Float64Array;u:Float64Array}>();
 get size():number{return this.prior.length;}
 link(peer:Posterior):void{this.peer=peer;}
 private same(o:Posterior):boolean{
  if(this.size!==o.size||this.events.length!==o.events.length)return false;
  for(const [id,i] of this.idx)if(o.idx.get(id)!==i||this.prior[i]!==o.prior[i]||this.m0[i]!==o.m0[i]||this.q[i]!==o.q[i])return false;
  for(let k=0;k<this.events.length;k++){
   const a=this.events[k],b=o.events[k];
   if(a.kind==='instruction'){
    if(b.kind!=='instruction'||a.i!==b.i||a.t!==b.t||a.bump!==b.bump)return false;
   }else{
    if(b.kind!=='observation')return false;
    const x=a.obs,y=b.obs;
    if(x.y!==y.y||x.g!==y.g||x.A!==y.A||x.off!==y.off||x.w!==y.w||x.extra!==y.extra||x.t!==y.t||x.ids.length!==y.ids.length)return false;
    for(let j=0;j<x.ids.length;j++)if(x.ids[j]!==y.ids[j]||x.xs[j]!==y.xs[j])return false;
   }
  }
  return true;
 }
 private slot(p:Pick<Part,'id'|'prior'|'q'|'m0'>):number{
  const found=this.idx.get(p.id);if(found!==undefined)return found;
  if(p.id.startsWith('item:')||this.size>=Posterior.MAX)return -1;
  const i=this.size,rate=p.q/(2*p.prior);let group=this.rates.indexOf(rate);
  if(group<0){group=this.rates.length;this.rates.push(rate);}
  this.rateGroups.push(group);this.idx.set(p.id,i);this.prior.push(p.prior);this.m0.push(p.m0);this.q.push(p.q);return i;
 }
 touch(id:string,prior:number,q:number,m0:number,t:number,bump:number):void{
  if(!(bump>0))return;
  const i=this.slot({id,prior,q,m0});if(i<0)return;
  this.events.push({kind:'instruction',i,t,bump});this.fit=null;
 }
 /** eta includes the filter's hint/difficulty shifts; only omitted latents are marginalised. */
 observe(parts:Part[],eta:number,y:number,g:number,A:number,w:number,extra:number,t:number):void{
  // A constant likelihood must not advance the process clock or consume an instruction bump.
  if(!(w>0)||!(A>0))return;
  const groups=new Map<string,Part>();
  for(const p of parts){const previous=groups.get(p.id);if(previous)previous.x+=p.x;else groups.set(p.id,{...p});}
  const ids:number[]=[],xs:number[]=[];let off=eta,nuisance=extra;
  for(const p of groups.values()){
   if(p.x===0)continue;
   const i=this.slot(p);
   if(i<0){nuisance+=p.x*p.x*p.v;continue;}
   ids.push(i);xs.push(p.x);off-=p.m*p.x;
  }
  if(!ids.length)return;
  // A permutation of one predictor must not select a different fitting strategy.
  const order=ids.map((_,i)=>i).sort((a,b)=>ids[a]-ids[b]);
  this.events.push({kind:'observation',obs:{ids:order.map(i=>ids[i]),xs:order.map(i=>xs[i]),y,g,A,off,w,extra:nuisance,t}});this.fit=null;
 }
 private eta(o:Obs,c:Float64Array):number{
  let value=o.off;for(let j=0;j<o.ids.length;j++)value+=o.xs[j]*c[o.ids[j]];return value;
 }
 /** Same PSD transport for reporting and the next observation's Gaussian prior.
  * Time: v_i moves toward its prior by q_i*days; Sij *= r_i*r_j, r_i=exp(-q_i*days/(2*prior_i)).
  * Usually v_i is below its prior (the specified capped variance growth). Noncanonical
  * likelihoods can instead increase observed variance above prior; that excess relaxes
  * at the same rate, without clipping a fitted covariance at zero elapsed time.
  * This is D S D plus a nonnegative diagonal, and composes across subdivisions of time.
  * Correlations vanish in the long-gap limit, without a discontinuity when one nearly
  * unidentifiable marginal reaches its prior. Instruction bumps are separate events:
  * they remove the corresponding fraction of remaining marginal information, including
  * all correlations at a full reset. Both transitions preserve the fitted mean.
  * This is a Gaussian reporting approximation, not an exact temporal posterior.
  */
 private ageing(S:Matrix,days:number,bumps?:number[]):{r:Float64Array;diagonal:Float64Array;changed:boolean}{
  const n=this.size,{prior,q,rates,rateGroups}=this,elapsed=Math.max(0,days);
  let work=this.ageWork;
  if(!work||work.r.length!==n||work.retention.length!==rates.length){
   work={r:new Float64Array(n),diagonal:new Float64Array(n),retention:new Float64Array(rates.length)};this.ageWork=work;
  }
  // These buffers are consumed synchronously by transport/query; they never
  // escape an evaluation. Reuse avoids allocating two dense vectors per event.
  const {r,diagonal,retention}=work;let changed=false,decay=false;
  // Hundreds of components share a handful of q/prior rates. Evaluate each
  // exponential once per transition, with storage bounded by the component cap.
  for(let i=0;i<rates.length;i++){retention[i]=Math.exp(-Math.max(0,elapsed*rates[i]));if(retention[i]!==1)decay=true;}
  if(!bumps?.length){
   for(let i=0;i<n;i++){
    const value=S[i][i],target=prior[i],drift=Math.max(0,q[i]*elapsed);
    const aged=value===target?value:value+(value<target?Math.min(target-value,drift):-Math.min(value-target,drift));
    r[i]=retention[rateGroups[i]];diagonal[i]=aged;if(aged!==value)changed=true;
   }
  }else for(let i=0;i<n;i++){
   const value=S[i][i],target=prior[i],drift=Math.max(0,q[i]*elapsed);
   const aged=value===target?value:value+(value<target?Math.min(target-value,drift):-Math.min(value-target,drift));
   const room=Math.max(0,target-aged),instruction=Math.max(0,bumps[i]??0),bump=Math.min(room,instruction);
   r[i]=retention[rateGroups[i]]*(instruction>0?(room>0?Math.sqrt(Math.max(0,1-bump/room)):0):1);
   if(r[i]!==1)decay=true;
   diagonal[i]=aged+bump;if(diagonal[i]!==value)changed=true;
  }
  if(!changed&&decay){
   changedEntry:for(let i=0;i<n;i++)for(let j=0;j<i;j++)if(S[i][j]!==0&&r[i]*r[j]!==1){changed=true;break changedEntry;}
  }
  return {r,diagonal,changed};
 }
 private workspace(S:Matrix):{d:Float64Array;x:Float64Array;u:Float64Array}{
  let work=this.covarianceWork.get(S);
  if(!work){const n=S.length;work={d:new Float64Array(n).fill(1),x:new Float64Array(n),u:new Float64Array(n)};this.covarianceWork.set(S,work);}
  return work;
 }
 private transport(S:Matrix,age:ReturnType<Posterior['ageing']>):void{
  // Diagonals stay in their actual units; an off-diagonal is stored as
  // Sij/(d_i*d_j). Time transport then only updates d, not n² entries.
  const {r,diagonal}=age,{d}=this.workspace(S),n=S.length;
  for(let i=0;i<n;i++){
   S[i][i]=diagonal[i];const previous=d[i],retention=r[i],next=previous*retention;
   if(next>=1e-40)d[i]=next;
   else{
    // Rebase one row/column before scaling can underflow or make the stored
    // covariance huge. A full instruction reset (r=0) clears it exactly.
    // Multiply the factors separately: their product can underflow before
    // multiplying a large scaled entry, even though that entry remains finite.
    for(let j=0;j<i;j++)S[i][j]=(S[i][j]*previous)*retention;
    for(let j=i+1;j<n;j++)S[j][i]=(S[j][i]*previous)*retention;
    d[i]=1;
   }
  }
 }
 /** One rank-one likelihood against a full Gaussian; O(n²), including process transport. */
 private condition(state:Gaussian,o:Obs,age?:ReturnType<Posterior['ageing']>):Gaussian{
  const {c,S}=state,n=this.size,eta0=this.eta(o,c);
  if(age)this.transport(S,age);
  const {d,x:Sx,u}=this.workspace(S),{ids,xs}=o;
  Sx.fill(0);u.fill(0);
  // Feature-major multiplication avoids a triangular lookup branch for every
  // matrix entry. Each output still accumulates features in their input order.
  for(let j=0;j<ids.length;j++){
   const index=ids[j],row=S[index],weight=xs[j]*d[index];
   u[index]=row[index]*xs[j];
   for(let i=0;i<index;i++)Sx[i]+=row[i]*weight;
   for(let i=index+1;i<n;i++)Sx[i]+=S[i][index]*weight;
  }
  for(let i=0;i<n;i++){Sx[i]=Sx[i]*d[i]+u[i];u[i]=Sx[i]/d[i];}
  let V=0;for(let j=0;j<o.ids.length;j++)V+=o.xs[j]*Sx[o.ids[j]];
  if(!(V>0))return state;
  const mode=scalarMode({mean:eta0,variance:V,y:o.y,g:o.g,A:o.A,w:o.w,extra:o.extra}),lik=eventLikelihood(mode,o.g,o.A,o.extra);
  const move=(mode-eta0)/V,J=o.w*lik.J(o.y),den=1+V*J;
  if(!(den>0)||!Number.isFinite(den))throw Error('Reporting posterior has non-positive curvature at its scalar mode');
  const scale=J/den;
  for(let i=0;i<n;i++){
   const row=S[i],si=Sx[i],scaled=scale*u[i];c[i]+=si*move;row[i]-=scale*si*si;
   if(scaled!==0){
    let j=0;
    for(;j+3<i;j+=4){row[j]-=scaled*u[j];row[j+1]-=scaled*u[j+1];row[j+2]-=scaled*u[j+2];row[j+3]-=scaled*u[j+3];}
    for(;j<i;j++)row[j]-=scaled*u[j];
   }
  }
  // This hook reconstructs the last Gaussian prior's quadratic form from the posterior
  // precision P = P_prior + J xxᵀ. It is evaluated only by numerical audit tests.
  let factor:Matrix|null=null;
  const logPosterior=(cc:Float64Array):number=>{
   factor??=cholesky(S);if(!factor)throw Error('Invalid reporting covariance');
   const d=Float64Array.from(cc,(value,i)=>value-c[i]),z=solveWith(factor,d);
   let quad=0,dx=0;for(let i=0;i<n;i++)quad+=d[i]*z[i];
   for(let j=0;j<o.ids.length;j++)dx+=o.xs[j]*d[o.ids[j]];
   return -.5*(quad-J*dx*dx)-move*dx+o.w*(eventLikelihood(mode+dx,o.g,o.A,o.extra).log(o.y)-lik.log(o.y));
  };
  return {c,S,fisher:false,used:[o],logPosterior};
 }
 /** A batch without process noise uses the actual joint objective and observed Hessian. */
 private batch(used:Obs[]):Gaussian{
  const n=this.size,c=Float64Array.from(this.m0),S=this.prior.map((v,i)=>{const row=new Float64Array(n);row[i]=v;return row;});
  const logPosterior=(cc:Float64Array):number=>{
   let value=0;for(const o of used)value+=o.w*eventLikelihood(this.eta(o,cc),o.g,o.A,o.extra).log(o.y);
   for(let i=0;i<n;i++)value-=.5*(cc[i]-this.m0[i])**2/this.prior[i];return value;
  };
  if(!used.length)return {c,S,fisher:false,used,logPosterior};
  // Independent likelihood blocks factor exactly. Fit them separately so adding
  // an unrelated component cannot change which mode an existing block selects.
  const parent=Array.from({length:n},(_,i)=>i),root=(i:number):number=>{
   while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;
  };
  for(const o of used)for(let j=1;j<o.ids.length;j++)parent[root(o.ids[j])]=root(o.ids[0]);
  const blocks=new Map<number,Obs[]>();
  for(const o of used){const key=root(o.ids[0]),block=blocks.get(key);if(block)block.push(o);else blocks.set(key,[o]);}
  if(blocks.size>1){
   for(const observations of blocks.values()){
    const block=this.batch(observations),active=[...new Set(observations.flatMap(o=>o.ids))];
    for(const i of active){c[i]=block.c[i];for(const j of active)S[i][j]=block.S[Math.max(i,j)][Math.min(i,j)];}
   }
   return {c,S,fisher:false,used,logPosterior};
  }
  // Repeated identical sites reduce exactly to one scalar likelihood with summed weight.
  // The scalar solver compares every mode, including non-concave guess-floor cases.
  const first=used[0],identical=used.every(o=>o.y===first.y&&o.g===first.g&&o.A===first.A&&o.off===first.off&&o.extra===first.extra&&o.ids.length===first.ids.length&&o.ids.every((id,j)=>id===first.ids[j]&&o.xs[j]===first.xs[j]));
  if(identical){
   const out=this.condition({c,S,fisher:false,used,logPosterior},{...first,w:used.reduce((sum,o)=>sum+o.w,0)});
   return {...out,used,logPosterior};
  }
  const system=(cc:Float64Array,observed:boolean):{P:Matrix;g:Float64Array}=>{
   const P=this.prior.map((v,i)=>{const row=new Float64Array(n);row[i]=1/v;return row;}),g=new Float64Array(n);
   for(let i=0;i<n;i++)g[i]=-(cc[i]-this.m0[i])/this.prior[i];
   for(const o of used){
    const l=eventLikelihood(this.eta(o,cc),o.g,o.A,o.extra),G=o.w*l.G(o.y),J=o.w*(observed?l.J(o.y):l.fisher);
    for(let a=0;a<o.ids.length;a++){
     const i=o.ids[a],x=o.xs[a];g[i]+=G*x;
     for(let b=0;b<o.ids.length;b++)P[i][o.ids[b]]+=J*x*o.xs[b];
    }
   }
   return {P,g};
  };
  // Guess floors make the objective non-concave. Seed both likelihood lobes as
  // well as the prior, so perturbing one repeated site does not strand Newton
  // at an inferior nearby mode. Each candidate is judged on the REAL objective.
  // This bounded search does not claim a global MAP guarantee in many dimensions.
  const directions=new Map<string,{site:Obs;weight:number}>();
  for(const o of used){const key=JSON.stringify([o.ids,o.xs]),group=directions.get(key);if(group)group.weight+=o.w;else directions.set(key,{site:o,weight:o.w});}
  const [,dominant]=[...directions].sort(([ka,a],[kb,b])=>b.weight-a.weight||ka.localeCompare(kb))[0],site=dominant.site;
  const starts=[Float64Array.from(c)],eta0=this.eta(site,c),weight=used.reduce((sum,o)=>sum+o.w,0);
  const V=site.ids.reduce((sum,id,j)=>sum+this.prior[id]*site.xs[j]**2,0);
  for(const y of [0,1]){
   const mode=scalarMode({mean:eta0,variance:V,y,g:site.g,A:site.A,w:weight,extra:site.extra});
   const start=Float64Array.from(c);
   for(let j=0;j<site.ids.length;j++)start[site.ids[j]]+=this.prior[site.ids[j]]*site.xs[j]*(mode-eta0)/V;
   starts.push(start);
  }
  let best:{point:Float64Array;L:Matrix;value:number}|null=null;
  for(const point of starts){
   let value=logPosterior(point);
   for(let iteration=0;iteration<80;iteration++){
    const {P,g}=system(point,true);
    if(g.every(x=>Math.abs(x)<1e-8))break;
    const L=cholesky(P)??cholesky(system(point,false).P);if(!L)break;
    const delta=solveWith(L,g);let slope=0;for(let i=0;i<n;i++)slope+=g[i]*delta[i];
    let accepted=false;const next=new Float64Array(n);
    for(let step=1,backtrack=0;backtrack<32;backtrack++,step/=2){
     for(let i=0;i<n;i++)next[i]=point[i]+step*delta[i];
     const candidate=logPosterior(next);
     if(candidate>=value+1e-4*step*slope-1e-12){point.set(next);value=candidate;accepted=true;break;}
    }
    if(!accepted)break;
   }
   const observed=system(point,true),L=cholesky(observed.P);
   if(L&&observed.g.every(x=>Math.abs(x)<1e-6)&&(!best||value>best.value))best={point,L,value};
  }
  // Never advertise a nonstationary iterate or Fisher information as Laplace curvature.
  if(!best)throw Error('Reporting posterior did not converge to a positive-curvature mode');
  c.set(best.point);
  return {c,S:inverse(best.L),fisher:false,used,logPosterior};
 }
 private solve():Fit{
  if(this.fit)return this.fit;
  if(this.peer&&this.same(this.peer))return this.fit=this.peer.solve();
  const batch:Obs[]=[];let state:Gaussian|null=null,time=this.events[0]?.kind==='instruction'?this.events[0].t:0;
  for(const event of this.events){
   if(event.kind==='instruction'){
    if(!state&&!batch.length){time=Math.max(time,event.t);continue;}
    state??=this.batch(batch);
    const bumps=Array(this.size).fill(0);bumps[event.i]=event.bump;
    this.transport(state.S,this.ageing(state.S,Math.max(0,(event.t-time)/DAY),bumps));time=Math.max(time,event.t);
    state={...state,used:[],logPosterior:gaussianObjective(state.c,state.S)};
    continue;
   }
   const o=event.obs;
   if(!state&&!batch.length){batch.push(o);time=o.t;continue;}
   if(!state){
    // Keep static observations together until an actual covariance transition is needed.
    if(!(o.t>time)||!this.q.some(x=>x>0)){batch.push(o);time=Math.max(time,o.t);continue;}
    const fitted=this.batch(batch),age=this.ageing(fitted.S,Math.max(0,(o.t-time)/DAY));
    if(!age.changed){batch.push(o);time=Math.max(time,o.t);continue;}
    state=this.condition(fitted,o,age);
   }else state=this.condition(state,o,this.ageing(state.S,Math.max(0,(o.t-time)/DAY)));
   time=Math.max(time,o.t);
  }
  state??=this.batch(batch);
  // Public inspection and shared fits expose actual symmetric covariances.
  // Materialise lazy scaling and the second triangle only once per fit.
  const d=this.covarianceWork.get(state.S)?.d;
  for(let i=0;i<this.size;i++)for(let j=0;j<i;j++)state.S[j][i]=state.S[i][j]*=(d?.[i]??1)*(d?.[j]??1);
  this.covarianceWork.delete(state.S);
  return this.fit={...state,at:time};
 }
 query(parts:Part[],t:number):{m:number;v:number}{
  const {c,S,at}=this.solve(),age=this.ageing(S,Math.max(0,(t-at)/DAY));
  const xs=new Map<number,number>(),others=new Map<string,Part>();let m=0,v=0;
  for(const part of parts){
   if(part.x===0)continue;
   const i=this.idx.get(part.id);
   if(i===undefined){const old=others.get(part.id);if(old)old.x+=part.x;else others.set(part.id,{...part});}
   else xs.set(i,(xs.get(i)??0)+part.x);
  }
  for(const p of others.values()){m+=p.x*p.m;v+=p.x*p.x*p.v;}
  for(const [i,x] of xs){
   m+=x*c[i];v+=x*x*age.diagonal[i];
   for(const [j,y] of xs)if(j<i)v+=2*x*y*age.r[i]*age.r[j]*S[i][j];
  }
  return {m,v:Math.max(v,1e-12)};
 }
 /** The objective is the static batch or the last conditional Gaussian update, up to a constant. */
 inspect():{ids:string[];c:Float64Array;S:Matrix;Vs:number[];obs:Obs[];prior:number[];logPosterior:(cc:Float64Array)=>number;fisher:boolean}{
  const {c,S,used,logPosterior,fisher}=this.solve();
  return {ids:[...this.idx.keys()],c,S,Vs:used.map(o=>o.extra),obs:used,prior:this.prior,logPosterior,fisher};
 }
}

// Scalar conditional likelihood and Gaussian-site Laplace mode. Keeping this
// one-dimensional step separate makes its observed curvature independently testable.
const sigmoid=(x:number)=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const logSigmoid=(x:number)=>x>=0?-Math.log1p(Math.exp(-x)):x-Math.log1p(Math.exp(x));
const attenuation=(extra:number)=>1/Math.sqrt(1+Math.PI*Math.max(0,extra)/8);
const logAdd=(a:number,b:number)=>{
 if(a===-Infinity)return b;if(b===-Infinity)return a;
 const hi=Math.max(a,b);return hi+Math.log1p(Math.exp(Math.min(a,b)-hi));
};

/** log(a + A sigmoid(z)) and its first two derivatives with respect to z. */
function mixture(z:number,a:number,A:number,withLog=true):{log:number;h:number;dh:number}{
 if(!(A>0))return {log:Math.log(a),h:0,dh:0};
 const tail=Math.exp(-Math.abs(z)),large=1/(1+tail),small=tail*large,e=z>=0?large:small,r=z>=0?small:large;
 if(!(a>0))return {log:withLog?Math.log(A)+logSigmoid(z):0,h:r,dh:-e*r};
 const mass=A*e,total=a+mass;
 let share:number,floorShare:number;
 // Ordinary probabilities need no logarithms. Subnormal mixtures and an
 // underflowed signal use log responsibilities to retain tiny relative scores.
 if(mass>0&&total>=2.2250738585072014e-308){share=mass/total;floorShare=a/total;}
 else{const signal=Math.log(A)+logSigmoid(z),floor=Math.log(a);share=sigmoid(signal-floor);floorShare=sigmoid(floor-signal);}
 const h=share*r;
 // Computing 1-sigmoid(z), or subtracting two saturated sigmoids, loses
 // derivatives in the tails. r and a/p retain those small terms directly.
 return {log:withLog?logAdd(Math.log(a),Math.log(A)+logSigmoid(z)):0,h,dh:h*(floorShare*r-e)};
}

/** Exact conditional Bernoulli derivatives; extra integrates only excluded nuisance variance. */
export function eventLikelihood(eta:number,g:number,A:number,extra:number):{
 p:number;G:(y:number)=>number;J:(y:number)=>number;fisher:number;log:(y:number)=>number;
}{
 const att=attenuation(extra),z=eta*att;
 const pass=mixture(z,g,A),fail=mixture(-z,Math.max(0,1-g-A),A);
 const p=g+A*sigmoid(z),q=Math.max(0,1-g-A)+A*sigmoid(-z);
 const G=(y:number)=>att*(y?pass.h:-fail.h);
 const J=(y:number)=>-att*att*(y?pass.dh:fail.dh);
 return {p,G,J,fisher:p*G(1)**2+q*G(0)**2,log:y=>y?pass.log:fail.log};
}

/**
 * Global mode of N(mean, variance) times one weighted Bernoulli mixture site.
 * The caller's fixed offset is already included in mean and in the returned eta.
 * Repeated identical sites are equivalent to one site with their summed weight.
 */
export function scalarMode(input:{mean:number;variance:number;y:number;g:number;A:number;w:number;extra:number}):number{
 const {mean,variance,y,g,A,w,extra}=input;
 if(!(variance>0)||!(w>0)||!(A>0))return mean;
 const att=attenuation(extra),B=variance*att*att;
 if(!(B>0))return mean;
 // Write a failure as a success at -eta. The likelihood is now increasing,
 // so every possible mode lies to the right of the Gaussian prior mean z0.
 const sign=y?1:-1,z0=sign*att*mean,a=y?g:Math.max(0,1-g-A);
 const likelihood=(z:number)=>mixture(z,a,A,false),logLikelihood=(z:number)=>mixture(z,a,A).log;
 const score=(z:number)=>w*likelihood(z).h-(z-z0)/B;
 const derivative=(z:number)=>w*likelihood(z).dh-1/B;
 // |d log likelihood / dz| <= 1. Also likelihood <= 1: outside the
 // second radius, the Gaussian penalty alone loses to the value at z0.
 const radius=Math.min(w*B,Math.sqrt(Math.max(0,-2*B*w*logLikelihood(z0))));
 const end=z0+radius;
 if(!(end>z0))return mean;
 const bracketRoot=(fn:(z:number)=>number,lo:number,hi:number,slope?:(z:number)=>number):number=>{
  const left=fn(lo);if(left===0)return lo;if(fn(hi)===0)return hi;
  let x=(lo+hi)/2;
  for(let i=0;i<80;i++){
   const value=fn(x);
   if(value===0||x===lo||x===hi)return x;
   if((value>0)===(left>0))lo=x;else hi=x;
   const next=slope?x-value/slope(x):NaN;
   // A Newton step may accelerate convergence, but it never replaces the
   // sign bracket. Reject nonfinite, exterior, or excessively long steps.
   if(next===x)return x;
   x=Number.isFinite(next)&&next>lo&&next<hi&&Math.abs(next-x)<.75*(hi-lo)?next:(lo+hi)/2;
  }
  return (lo+hi)/2;
 };
 const cuts=[z0,end];
 if(a>0){
  // h(z)=sigmoid(z+c)-sigmoid(z), c=log((a+A)/a). Its derivative
  // has one positive maximum, then crosses zero at -c/2. The two
  // possible roots of w*h'(z)=1/B partition the score into monotone
  // intervals. This brackets ALL stationary points, including both
  // maxima of a non-log-concave posterior, without a resolution grid.
  const c=Math.log(a+A)-Math.log(a),K=Math.cosh(c/2);
  const peak=-c/2-Math.acosh((K+Math.hypot(K,Math.sqrt(8)))/2),center=-c/2;
  for(const [lo,hi] of [[z0,Math.min(end,peak)],[Math.max(z0,peak),Math.min(end,center)]]){
   if(!(hi>lo))continue;
   const dLo=derivative(lo),dHi=derivative(hi);
   if(dLo===0)cuts.push(lo);if(dHi===0)cuts.push(hi);
   if((dLo>0)!==(dHi>0))cuts.push(bracketRoot(derivative,lo,hi));
  }
 }
 cuts.sort((l,r)=>l-r);
 const candidates:number[]=[];
 for(let i=0;i<cuts.length-1;i++){
  const lo=cuts[i],hi=cuts[i+1],sLo=score(lo),sHi=score(hi);
  if(sLo===0)candidates.push(lo);if(sHi===0)candidates.push(hi);
  if((sLo>0)!==(sHi>0))candidates.push(bracketRoot(score,lo,hi,derivative));
 }
 // At a saturated tail the exact score is smaller than floating point can
 // represent. Otherwise a monotone bracket above always contains a root.
 if(!candidates.length)return mean;
 const logPosterior=(z:number)=>w*logLikelihood(z)-(z-z0)**2/(2*B);
 let best=candidates[0];
 for(const z of candidates)if(logPosterior(z)>logPosterior(best))best=z;
 return mean+sign*(best-z0)/att;
}
