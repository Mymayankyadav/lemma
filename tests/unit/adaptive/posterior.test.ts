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
