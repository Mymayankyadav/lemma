import {afterEach,describe,expect,it} from 'vitest';
import {Posterior,type Part} from '../../../supabase/functions/_shared/adaptive/posterior';

// N186: the joint (Laplace) fit behind the reported ability.
const DAY=86400e3,T=Date.UTC(2026,10,1);
const priors:Record<string,{v:number;m0:number}>={mu:{v:1,m0:0},facet:{v:.25,m0:0},sys:{v:.25,m0:0},kc:{v:.5,m0:0},cross:{v:.25,m0:0},learning:{v:.1,m0:.3}};
const ids=Object.keys(priors);
const part=(id:string,x=1,over:Partial<Part>={}):Part=>({id,x,prior:priors[id].v,q:0,m0:priors[id].m0,m:priors[id].m0,v:priors[id].v,...over});
const all=(x=1)=>ids.map(id=>part(id,id==='learning'?Math.log(2):x));
/** One attempt on the whole predictor, the filter's linear predictor at the prior mean. */
const attempt=(post:Posterior,y:number,over:{A?:number;g?:number;w?:number;extra?:number;t?:number;parts?:Part[]}={})=>{
 const parts=over.parts??all();post.observe(parts,parts.reduce((z,p)=>z+p.m*p.x,0),y,over.g??.05,over.A??.92,over.w??1,over.extra??0,over.t??T);
};
afterEach(()=>{Posterior.MAX=256;});


/** Small dense inverse (Gauss-Jordan) for the finite-difference reference. */
function inv(A:number[][]){const n=A.length,M=A.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>+(i===j))]);
 for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];const d=M[c][c];for(let j=0;j<2*n;j++)M[c][j]/=d;
  for(let r=0;r<n;r++)if(r!==c){const f=M[r][c];if(f)for(let j=0;j<2*n;j++)M[r][j]-=f*M[c][j];}}
 return M.map(r=>r.slice(n));}

describe('Posterior: the ability given all attempts',()=>{
 it('with no attempts it is the prior: the prior mean and the sum of prior variances',()=>{
  const post=new Posterior(),q=all(),{m,v}=post.query(q,T);
  expect(m).toBeCloseTo(.3*Math.log(2),12);expect(v).toBeCloseTo(ids.reduce((z,id)=>z+priors[id].v*(id==='learning'?Math.log(2)**2:1),0),12);
 });
 it('passes raise the mean, failures lower it, and either narrows the variance',()=>{
  const prior=new Posterior().query(all(),T);
  const pass=new Posterior(),fail=new Posterior();for(let i=0;i<6;i++){attempt(pass,1);attempt(fail,0);}
  const up=pass.query(all(),T),down=fail.query(all(),T);
  expect(up.m).toBeGreaterThan(prior.m+.5);expect(down.m).toBeLessThan(prior.m-.5);
  expect(up.v).toBeLessThan(prior.v);expect(down.v).toBeLessThan(prior.v);
 });
 it('more evidence means less variance, and a mixed record is less certain than a clean one',()=>{
  const v=(n:number,pattern:(i:number)=>number)=>{const p=new Posterior();for(let i=0;i<n;i++)attempt(p,pattern(i));return p.query(all(),T).v;};
  expect(v(20,i=>+(i%3>0))).toBeLessThan(v(6,i=>+(i%3>0)));
  expect(v(12,i=>+(i%2===0))).toBeLessThan(v(12,i=>+(i%2===0))+1e-9);
  expect(v(12,i=>+(i%2===0))).toBeLessThan(new Posterior().query(all(),T).v);
 });
 it('is far more certain about the sum than the diagonal would be: the components share each attempt',()=>{
  const post=new Posterior();for(let i=0;i<20;i++)attempt(post,+(i%4>0));
  const exact=post.query(all(),T).v,prior=new Posterior().query(all(),T).v;
  // one repeated direction: the sum can shrink to roughly 1/(1/prior + n·H); a diagonal filter shrinks each part by 1/ (number of parts)
  expect(exact).toBeLessThan(prior*.35);
 });
 it('an observation counts for what its weight says; weight 0 or no components is ignored',()=>{
  const none=new Posterior().query(all(),T),w0=new Posterior();attempt(w0,1,{w:0});attempt(w0,0,{parts:[part('mu',0)]});
  expect(w0.query(all(),T)).toEqual(none);expect(w0.size).toBe(0);
  const half=new Posterior(),full=new Posterior();attempt(half,1,{w:.5});attempt(full,1,{w:1});
  expect(Math.abs(half.query(all(),T).m-none.m)).toBeLessThan(Math.abs(full.query(all(),T).m-none.m));
 });
 it('ages like the filter: variance grows q per day since the last evidence, up to the prior; an instruction bump is capped',()=>{
  const q=.01,mk=()=>part('kc',1,{q}),post=new Posterior();
  for(let i=0;i<8;i++)attempt(post,+(i%4>0),{parts:[mk()]});
  const tight=post.query([mk()],T);expect(tight.v).toBeLessThan(.5);
  expect(post.query([mk()],T+10*DAY).v).toBeCloseTo(tight.v+.1,9);
  expect(post.query([mk()],T+1e4*DAY).v).toBeCloseTo(.5,9);
  expect(post.query([mk()],T+10*DAY).m).toBeCloseTo(tight.m,12);                      // ageing never moves the mean
  post.touch('kc',.5,q,0,T,.2);expect(post.query([mk()],T).v).toBeCloseTo(Math.min(.5,tight.v+.2),9);
  post.touch('kc',.5,q,0,T,10);expect(post.query([mk()],T).v).toBeCloseTo(.5,9);
  attempt(post,1,{parts:[mk()],t:T+DAY});expect(post.query([mk()],T+DAY).v).toBeLessThan(.5);   // new evidence absorbs the bump
 });
 it('never fits items, and a component beyond the cap keeps the filter\'s own mean and variance',()=>{
  Posterior.MAX=2;const post=new Posterior();
  const parts=[part('mu'),part('kc'),part('cross',1,{m:.4,v:.2}),{id:'item:q1',x:-1,prior:.5,q:0,m0:0,m:.7,v:.3}];
  for(let i=0;i<6;i++)post.observe(parts,parts.reduce((z,p)=>z+p.m*p.x,0),+(i%2===0),.05,.92,1,0,T);
  expect(post.size).toBe(2);
  const stored=post.query(parts.slice(0,2),T),both=post.query(parts,T);
  expect(both.m).toBeCloseTo(stored.m+.4-.7,9);expect(both.v).toBeCloseTo(stored.v+.2+.3,9);
 });
 it('is deterministic, order-free in the parts, and stays finite under heavy evidence',()=>{
  const run=()=>{const p=new Posterior();for(let o=0;o<400;o++)attempt(p,+(o%7>1),{t:T+o*3600e3,A:.95});return p;};
  const a=run(),b=run(),q=all();expect(a.query(q,T+400*3600e3)).toEqual(b.query(q,T+400*3600e3));
  expect(a.query([...q].reverse(),T+400*3600e3).m).toBeCloseTo(a.query(q,T+400*3600e3).m,12);
  const r=a.query(q,T+400*3600e3);expect(Number.isFinite(r.m)&&Number.isFinite(r.v)).toBe(true);expect(r.v).toBeGreaterThan(0);
 });
 it('two hypotheses that saw identical attempts share one fit; once an amplitude differs (a card review) each has its own',()=>{
  const feed=(post:Posterior,amplitude:number)=>{for(let i=0;i<10;i++)attempt(post,+(i%3>0),{A:i<5?.92:amplitude,t:T+i*3600e3});return post;};
  const a=feed(new Posterior(),.92),b=feed(new Posterior(),.92);b.link(a);
  expect(b.query(all(),T+DAY)).toEqual(a.query(all(),T+DAY));
  const c=feed(new Posterior(),.92),d=feed(new Posterior(),.6);d.link(c);
  expect(d.query(all(),T+DAY).m).not.toBeCloseTo(c.query(all(),T+DAY).m,3);        // not shared: d is fitted on its own attempts
  const alone=feed(new Posterior(),.6);expect(d.query(all(),T+DAY)).toEqual(alone.query(all(),T+DAY));
 });
 it('a hint-shifted attempt (the filter\'s predictor includes the shift) is fitted at that shift',()=>{
  const plain=new Posterior(),hinted=new Posterior(),parts=all();
  plain.observe(parts,parts.reduce((z,p)=>z+p.m*p.x,0),1,.05,.92,1,0,T);
  hinted.observe(parts,parts.reduce((z,p)=>z+p.m*p.x,0)+2,1,.05,.92,1,0,T);       // a +2 shift already explains a pass: less to learn
  expect(hinted.query(all(),T).m).toBeLessThan(plain.query(all(),T).m);
 });
});

describe('Posterior: curvature and ageing are consistent',()=>{
 // A guess floor (g = 0.2, five options) and partial retrieval (A = 0.55-0.8) make p = g + A·σ(η) non-canonical: the observed curvature differs from the
 // expected information, and surprising outcomes (a pass at low η, a fail at high η) make it differ most.
 const fitted=()=>{
  const post=new Posterior();
  for(let i=0;i<12;i++){
   const parts=[part('mu'),part('kc'),part('cross'),part('learning',Math.log1p(i%5))];
   post.observe(parts,parts.reduce((z,p)=>z+p.m*p.x,0),[1,0,0,1,1,0,1,1,1,0,1,1][i],.2,i%2?.55:.8,1,.49,T+i*3600e3);
  }
  return post;
 };
 it('the reported covariance is the inverse of the observed curvature of the log posterior, by finite differences, and the gradient vanishes at the mode',()=>{
  const {c,S,logPosterior,fisher}=fitted().inspect(),n=c.length,h=1e-4;
  expect(fisher).toBe(false);                                                                  // the true curvature was positive definite here
  const at=(d:[number,number][])=>{const x=Float64Array.from(c);for(const [i,k] of d)x[i]+=k;return logPosterior(x);};
  const g=Array.from({length:n},(_,i)=>(at([[i,h]])-at([[i,-h]]))/(2*h));
  for(const gi of g)expect(Math.abs(gi)).toBeLessThan(1e-3);
  const H=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>(at([[i,h],[j,h]])-at([[i,h],[j,-h]])-at([[i,-h],[j,h]])+at([[i,-h],[j,-h]]))/(4*h*h)));
  const ref=inv(H.map(r=>r.map(v=>-v)));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)expect(Math.abs(S[i][j]-ref[i][j])).toBeLessThan(2e-4);
 });
 it('the finite-difference check is discriminating: the expected (Fisher) information gives a visibly different covariance',()=>{
  const {c,S,Vs,obs,prior}=fitted().inspect(),n=c.length,P=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1/prior[i]:0));
  obs.forEach((o,k)=>{
   let eta=o.off;for(let a=0;a<o.ids.length;a++)eta+=c[o.ids[a]]*o.xs[a];
   const att=1/Math.sqrt(1+Math.PI*Vs[k]/8),e=1/(1+Math.exp(-eta*att)),p=o.g+o.A*e,d=o.A*att*e*(1-e),J=d*d/(p*(1-p));
   for(let a=0;a<o.ids.length;a++)for(let b=0;b<o.ids.length;b++)P[o.ids[a]][o.ids[b]]+=o.w*J*o.xs[a]*o.xs[b];
  });
  const F=inv(P);let worst=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)worst=Math.max(worst,Math.abs(F[i][j]-S[i][j]));
  expect(worst).toBeGreaterThan(5e-3);                                          // far above the 2e-4 tolerance of the check above
 });
 // Three components, all ageing, all correlated by the attempts.
 const aged=(q=.02,muQ=q)=>{
  const mk=()=>[part('mu',1,{q:muQ}),part('kc',1,{q}),part('cross',1,{q})],post=new Posterior();
  for(let i=0;i<14;i++){const parts=mk();post.observe(parts,0,+(i%3>0),.05,.9,1,0,T+i*3600e3);}
  return {post,mk};
 };
 const last=T+13*3600e3;
 it('a long-unpractised sum is as uncertain as the prior: ageing a component also forgets its correlations',()=>{
  const {post,mk}=aged(),prior=mk().reduce((z,p)=>z+p.prior,0);
  const now=post.query(mk(),T+DAY),later=post.query(mk(),T+1e4*DAY);
  expect(now.v).toBeLessThan(prior*.8);                                      // evidence narrows the sum
  expect(later.v).toBeCloseTo(prior,9);                                       // fully aged: the prior, not less through leftover negative covariances
  expect(later.m).toBeCloseTo(now.m,12);
 });
 it('uncertainty never falls as time passes, never exceeds the prior, stays positive, and is continuous (no jump where the cap is reached)',()=>{
  const {post,mk}=aged(.01),prior=mk().reduce((z,p)=>z+p.prior,0);let before=post.query(mk(),last).v,capped=false;
  for(let days=.5;days<=400;days+=.5){
   const v=post.query(mk(),last+days*DAY).v;
   expect(v).toBeGreaterThanOrEqual(before-1e-12);expect(v).toBeLessThanOrEqual(prior+1e-9);expect(Number.isFinite(v)).toBe(true);   // positive definite along the ageing trajectory
   if(Math.abs(v-prior)<1e-9)capped=true;before=v;
  }
  expect(capped).toBe(true);
 });

 it('each component ages at q/day and its correlations vanish exactly when the prior is restored',()=>{
  const {post,mk}=aged(.02),{S,prior}=post.inspect(),parts=mk();
  expect(S.length).toBe(3);
  for(const days of [1,3,8]){
   const time=last+days*DAY,room=prior.map((p,i)=>Math.max(0,p-S[i][i]));
   const added=room.map(gap=>Math.min(gap,.02*days));
   const r=room.map((gap,i)=>gap>0?Math.sqrt(Math.max(0,1-added[i]/gap)):1);
   let want=0;
   for(let i=0;i<3;i++){
    const diagonal=S[i][i]+added[i];
    expect(post.query([parts[i]],time).v).toBeCloseTo(diagonal,9);
    want+=diagonal;
    for(let j=0;j<i;j++)want+=2*r[i]*r[j]*S[i][j];
   }
   expect(post.query(parts,time).v).toBeCloseTo(want,9);
  }
  const capDays=Math.max(...prior.map((p,i)=>Math.max(0,p-S[i][i])/.02));
  const atCap=post.query(parts,last+Math.ceil(capDays*DAY)).v;
  expect(atCap).toBeCloseTo(prior.reduce((a,p)=>a+p,0),8);
  expect(post.query(parts,last+(capDays+1)*DAY).v).toBeCloseTo(atCap,8);
 });
 it('repeated appearances of a fitted or excluded component share their variance',()=>{
  const post=new Posterior(),mk=(x:number)=>part('kc',x,{q:.03});
  for(let i=0;i<9;i++)post.observe([mk(1),mk(-.4)],0,+(i%3!==0),.05,.9,1,0,T+i*3600e3);
  const time=T+5*DAY;
  expect(post.query([mk(1),mk(-.4)],time).m).toBeCloseTo(post.query([mk(.6)],time).m,12);
  expect(post.query([mk(1),mk(-.4)],time).v).toBeCloseTo(post.query([mk(.6)],time).v,12);
  const item={id:'item:q',x:1,prior:.5,q:0,m0:0,m:.2,v:.3};
  expect(post.query([item,{...item,x:-.4}],time).v).toBeCloseTo(.6*.6*.3,12);
 });
 it('components that never age (q = 0, like the global level) keep their fitted variance in the limit',()=>{
  const {post,mk}=aged(.02,0),{S}=post.inspect(),limit=S[0][0]+.5+.25;          // mu keeps its posterior; kc and cross are back at their priors, uncorrelated
  expect(post.query(mk(),last+1e4*DAY).v).toBeCloseTo(limit,9);
  expect(limit).toBeLessThan(1.75);
 });
 it('an instruction bump resets the concept and its correlations consistently, and fresh evidence absorbs it',()=>{
  const {post,mk}=aged(0),{S}=post.inspect();                                   // no ageing: only the bump moves anything
  const before=post.query(mk(),T+DAY).v;
  post.touch('kc',.5,0,0,T+DAY,10);                                              // far above the room: the concept is back at its prior, uncorrelated
  const after=post.query(mk(),T+DAY).v;
  const want=S[0][0]+S[2][2]+2*S[0][2]+.5;                                       // mu and cross keep their posterior and their mutual covariance; kc is the prior alone
  expect(after).toBeGreaterThan(before);expect(after).toBeCloseTo(want,9);
  const small=aged(0),cov=small.post.inspect().S;
  const bump=(.5-cov[1][1])/2;expect(bump).toBeGreaterThan(0);
  small.post.touch('kc',.5,0,0,T+DAY,bump);                    // a partial bump preserves sqrt(1/2) of the correlations
  const expected=cov[0][0]+cov[1][1]+bump+cov[2][2]+2*cov[0][2]+Math.SQRT2*(cov[0][1]+cov[1][2]);
  expect(small.post.query(small.mk(),T+DAY).v).toBeCloseTo(expected,9);
  const parts=mk();post.observe(parts,0,1,.05,.9,1,0,T+2*DAY);
  expect(post.query(mk(),T+2*DAY).v).toBeLessThan(after);                         // a new attempt on the concept absorbs the bump
 });
});
