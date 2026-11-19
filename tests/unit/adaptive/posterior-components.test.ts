import {afterEach,describe,expect,it} from 'vitest';
import {Posterior,type Part} from '../../../supabase/functions/_shared/adaptive/posterior';

const DAY=86400e3,T=Date.UTC(2026,10,1);
const part=(id:string,x=1):Part=>({id,x,prior:1,q:0,m0:.2,m:.35,v:.4});
const feed=(parts:Part[],extra=.17):Posterior=>{
 const post=new Posterior();
 for(let i=0;i<18;i++)post.observe(parts,parts.reduce((sum,p)=>sum+p.x*p.m,0),+(i%3!==0),.1,.8,1,extra,T);
 return post;
};
const sameEstimate=(actual:{m:number;v:number},expected:{m:number;v:number})=>{
 expect(actual.m).toBeCloseTo(expected.m,11);
 expect(actual.v).toBeCloseTo(expected.v,11);
};
afterEach(()=>{Posterior.MAX=256;});

describe('N186 repeated components denote the same random variable',()=>{
 for(const id of ['item:q1','overflow']){
  it(`cancelling occurrences of an excluded ${id} contribute no observation uncertainty`,()=>{
   Posterior.MAX=1;
   const ability=part('ability'),a=part(id),parts=[ability,a,{...a,x:-1}];
   const repeated=feed(parts),omitted=feed([ability]);
   expect(repeated.inspect().ids).toEqual(['ability']);
   for(const variance of repeated.inspect().Vs)expect(variance).toBeCloseTo(.17,12);
   sameEstimate(repeated.query([ability],T),omitted.query([ability],T));
   sameEstimate(repeated.query(parts,T),omitted.query([ability],T));
  });

  it(`non-cancelling occurrences of an excluded ${id} match their summed coefficient`,()=>{
   Posterior.MAX=1;
   const ability=part('ability'),a=part(id),parts=[ability,a,{...a,x:-.4}],combined=[ability,{...a,x:.6}];
   const repeated=feed(parts),summed=feed(combined);
   // Var(X - .4X) = .6² Var(X), not (1 + .4²) Var(X).
   for(const variance of repeated.inspect().Vs)expect(variance).toBeCloseTo(.17+.6**2*a.v,12);
   sameEstimate(repeated.query([ability],T),summed.query([ability],T));
   sameEstimate(repeated.query(parts,T),summed.query(combined,T));
  });
 }

 it('a cancelling component cannot use the fitted-component cap before the nonzero predictor',()=>{
  Posterior.MAX=1;
  const cancelled=part('cancelled'),ability=part('ability');
  const post=feed([cancelled,{...cancelled,x:-1},ability]),baseline=feed([ability]);
  expect(post.inspect().ids).toEqual(['ability']);
  sameEstimate(post.query([ability],T),baseline.query([ability],T));
 });

 it('observation and query aggregation leave the caller’s arrays and component objects unchanged',()=>{
  Posterior.MAX=1;
  const ability=part('ability'),item=part('item:q1'),overflow=part('overflow');
  const parts=[ability,{...ability,x:-.2},item,{...item,x:-.4},overflow,{...overflow,x:-1}];
  const snapshot=parts.map(p=>({...p}));
  for(const p of parts)Object.freeze(p);
  Object.freeze(parts);
  const post=feed(parts);
  expect(parts).toEqual(snapshot);
  const once=post.query(parts,T),twice=post.query(parts,T);
  expect(parts).toEqual(snapshot);
  expect(twice).toEqual(once);
  expect(Number.isFinite(once.m)&&Number.isFinite(once.v)).toBe(true);
 });
});

describe('N186 linked posterior component identities',()=>{
 const trained=(ids:[string,string],q=0)=>{
  const post=new Posterior();
  for(let i=0;i<16;i++){
   const parts=ids.map((id,j)=>({...part(id,j===0?1:i%2?.5:-.5),q}));
   post.observe(parts,parts.reduce((sum,p)=>sum+p.x*p.m,0),+(i%3!==0),.1,.8,1,0,T);
  }
  return post;
 };
 it('reversed component insertion orders retain their own meanings before and after one peer changes',()=>{
  const a=trained(['left','right']),b=trained(['right','left']),baseline=trained(['right','left']);
  b.link(a);
  expect(a.inspect().ids).toEqual(['left','right']);
  expect(b.inspect().ids).toEqual(['right','left']);
  for(const id of ['left','right'])sameEstimate(b.query([part(id)],T),baseline.query([part(id)],T));
  // The same name now refers to a different numeric coordinate in the two peers.
  // Updating it must not borrow the other peer's fitted mean or covariance.
  const update=[part('left')];
  b.observe(update,update[0].m,0,.1,.8,1,0,T);
  baseline.observe(update,update[0].m,0,.1,.8,1,0,T);
  for(const direction of [[part('left')],[part('right')],[part('left'),part('right',-1)]]){
   sameEstimate(b.query(direction,T),baseline.query(direction,T));
  }
 });

 it('instructions and differently timed fresh evidence do not leak between previously identical linked peers',()=>{
  const a=trained(['left','right'],.02),b=trained(['left','right'],.02),aloneA=trained(['left','right'],.02),aloneB=trained(['left','right'],.02);
  const directions=[[part('left')],[part('right')],[part('left'),part('right',-1)],[part('left'),part('right')]];
  const compare=(actual:Posterior,reference:Posterior,time:number)=>{
   for(const direction of directions)sameEstimate(actual.query(direction,time),reference.query(direction,time));
  };
  b.link(a);
  compare(b,aloneB,T); // fit is eligible for reuse before the histories diverge
  for(const post of [a,aloneA])post.touch('left',1,.02,.2,T+DAY,.3);
  compare(a,aloneA,T+DAY);
  compare(b,aloneB,T+DAY);
  for(const post of [a,aloneA])post.observe([part('left')],.35,0,.1,.8,1,0,T+2*DAY);
  for(const post of [b,aloneB])post.observe([part('right')],.35,1,.1,.8,1,0,T+3*DAY);
  compare(a,aloneA,T+4*DAY);
  compare(b,aloneB,T+4*DAY);
 });
});
