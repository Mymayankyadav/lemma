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

describe('N186 independent histories do not choose another component’s inference rule',()=>{
 const stable:Part={id:'stable',x:1,prior:1,q:0,m0:0,m:0,v:1};
 const unrelated:Part={...stable,id:'unrelated',q:.02};
 it.each([0,1e-10,1])('independent evidence of weight %s cannot change a stable component over later dates',weight=>{
  const baseline=new Posterior(),combined=new Posterior();
  combined.observe([unrelated],0,1,.05,.92,weight,0,T);
  for(const [i,y] of [1,0,1].entries()){
   baseline.observe([stable],0,y,.05,.92,1,0,T+i*DAY);
   combined.observe([stable],0,y,.05,.92,1,0,T+i*DAY);
  }
  const actual=combined.query([stable],T+2*DAY),expected=baseline.query([stable],T+2*DAY);
  expect(actual.m).toBeCloseTo(expected.m,8);
  expect(actual.v).toBeCloseTo(expected.v,8);
 });

 it('an instruction leaves an independent component’s existing mean and variance unchanged immediately',()=>{
  const post=new Posterior();
  post.observe([stable],0,1,.05,.92,10,0,T);
  const before=post.query([stable],T);
  post.touch(unrelated.id,unrelated.prior,unrelated.q,unrelated.m0,T,.3);
  const after=post.query([stable],T);
  expect(after.m).toBeCloseTo(before.m,8);
  expect(after.v).toBeCloseTo(before.v,8);
 });

 // An instruction is an explicit Gaussian-projection boundary in append order.
 // Compare the SAME instruction timeline: inserting a new boundary into one
 // simultaneous likelihood block would instead change the approximation itself.
 // Production replay orders instructions before observations at equal timestamps.
 it.each(['before','after','both'])('independent observations %s an existing instruction do not change another component’s estimates',position=>{
  const run=(weight:number)=>{
   const post=new Posterior();
   post.observe([stable],0,1,.05,.92,10,0,T);
   if(position!=='after')post.observe([unrelated],0,1,.05,.92,weight,0,T);
   post.touch(unrelated.id,unrelated.prior,unrelated.q,unrelated.m0,T,.3);
   if(position!=='before')post.observe([unrelated],0,0,.05,.92,weight,0,T);
   post.observe([stable],0,0,.05,.92,10,0,T);
   return post.query([stable],T);
  };
  const expected=run(0);
  for(const weight of [1e-10,1]){
   const actual=run(weight);
   expect(actual.m).toBeCloseTo(expected.m,8);
   expect(actual.v).toBeCloseTo(expected.v,8);
  }
 });
});

type Site2={x:[number,number];off:number;y:number};
const inverse2=(S:number[][])=>{
 const det=S[0][0]*S[1][1]-S[0][1]*S[1][0];
 return [[S[1][1]/det,-S[0][1]/det],[-S[1][0]/det,S[0][0]/det]];
};
/** Independent Newton reference for a full Gaussian times canonical logistic sites.
 * The positive definite Gaussian makes this objective strictly concave, so the
 * stationary point is unique even with exactly or nearly collinear predictors. */
function gaussianBlock(mean:number[],covariance:number[][],sites:Site2[]){
 const prior=inverse2(covariance),point=mean.slice();
 const system=()=>{
  const H=prior.map(row=>row.slice()),g=prior.map(row=>row.reduce((sum,p,j)=>sum+p*(mean[j]-point[j]),0));
  for(const site of sites){
   const eta=site.off+site.x.reduce((sum,x,j)=>sum+x*point[j],0),p=1/(1+Math.exp(-eta));
   for(let i=0;i<2;i++){
    g[i]+=(site.y-p)*site.x[i];
    for(let j=0;j<2;j++)H[i][j]+=p*(1-p)*site.x[i]*site.x[j];
   }
  }
  return {H,g};
 };
 for(let step=0;step<100;step++){
  const {H,g}=system(),S=inverse2(H),delta=S.map(row=>row.reduce((sum,s,j)=>sum+s*g[j],0));
  for(let i=0;i<2;i++)point[i]+=delta[i];
  if(Math.max(...delta.map(Math.abs))<1e-13)break;
 }
 const {H,g}=system();
 expect(Math.max(...g.map(Math.abs))).toBeLessThan(1e-11);
 return {mean:point,covariance:inverse2(H)};
}

describe('N186 simultaneous sites condition the carried joint Gaussian together',()=>{
 it.each([0,1e-8])('matches an independent Gaussian-block reference with predictor separation %s, in either event order',separation=>{
  const parts:Part[]=[
   {id:'left',x:1,prior:1,q:.02,m0:0,m:0,v:1},
   {id:'right',x:1,prior:.5,q:.01,m0:0,m:0,v:.5},
  ];
  const prepared=()=>{
   const post=new Posterior();
   for(let i=0;i<12;i++)post.observe(parts,0,+(i%3!==0),0,1,1,0,T);
   return post;
  };
  const late=T+2*DAY,prior=prepared(),left=prior.query([parts[0]],late),right=prior.query([parts[1]],late),sum=prior.query(parts,late);
  const cross=(sum.v-left.v-right.v)/2;
  expect(Math.abs(cross)).toBeGreaterThan(.05);
  const sites:Site2[]=[{x:[1,1],off:3.5,y:1},{x:[1,1+separation],off:0,y:0}];
  const reference=gaussianBlock([left.m,right.m],[[left.v,cross],[cross,right.v]],sites);
  for(const order of [sites,[...sites].reverse()]){
   const post=prepared();
   for(const site of order)post.observe(parts.map((p,i)=>({...p,x:site.x[i]})),site.off,site.y,0,1,1,0,late);
   const actual=[post.query([parts[0]],late),post.query([parts[1]],late)],both=post.query(parts,late);
   for(let i=0;i<2;i++){
    expect(actual[i].m).toBeCloseTo(reference.mean[i],7);
    expect(actual[i].v).toBeCloseTo(reference.covariance[i][i],7);
   }
   expect((both.v-actual[0].v-actual[1].v)/2).toBeCloseTo(reference.covariance[0][1],7);
   expect(both.v).toBeGreaterThan(0);
  }
 });
});
