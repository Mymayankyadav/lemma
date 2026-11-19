import {afterEach,describe,expect,it} from 'vitest';
import {Posterior,type Part} from '../../../supabase/functions/_shared/adaptive/posterior';
import {estimate,replay,type AtlasFacts,type Attempt} from '../../../supabase/functions/_shared/adaptive/measure';

const DAY=86400e3,T=Date.parse('2026-11-01T10:00:00Z');
const part=(id:string,prior:number,q=0,x=1):Part=>({id,prior,q,x,m0:0,m:0,v:prior});
const scalar=(q=.02)=>part('kc:k',.5,q);
const observe=(post:Posterior,parts:Part[],t:number,y=1,A=1,w=1)=>{
 post.observe(parts,parts.reduce((sum,p)=>sum+p.x*p.m,0),y,0,A,w,0,t);
};
function trained(parts:Part[],count=40):Posterior{
 const post=new Posterior();
 for(let i=0;i<count;i++)observe(post,parts,T,+(i%3!==0));
 return post;
}
/** Independent one-dimensional Laplace reference for N(mean,variance) times one Bernoulli-logistic likelihood. */
function oneStep(mean:number,variance:number,y:number):{m:number;v:number}{
 let m=mean;
 for(let i=0;i<100;i++){
  const p=1/(1+Math.exp(-m)),precision=1/variance+p*(1-p),step=((mean-m)/variance+y-p)/precision;
  m+=step;if(Math.abs(step)<1e-14)break;
 }
 const p=1/(1+Math.exp(-m));
 return {m,v:1/(1/variance+p*(1-p))};
}
afterEach(()=>{Posterior.MAX=256;});

describe('N186 process transitions preserve the already-reported uncertainty',()=>{
 it('a constant likelihood after a partial gap cannot erase the uncertainty accumulated during that gap',()=>{
  const p=scalar(),post=trained([p]),late=T+5*DAY,before=post.query([p],late);
  expect(before.v).toBeGreaterThan(post.query([p],T).v+.09);
  // A=0 gives p(y=0)=1 for every latent value: this observation carries exactly no information.
  observe(post,[p],late,0,0);
  expect(post.query([p],late).m).toBeCloseTo(before.m,10);
  expect(post.query([p],late).v).toBeCloseTo(before.v,10);
 });
 it('a constant likelihood after a partial instruction bump cannot erase that bump',()=>{
  const p=scalar(0),post=trained([p]);
  post.touch(p.id,p.prior,p.q,p.m0,T,.1);
  const before=post.query([p],T);
  observe(post,[p],T,0,0);
  expect(post.query([p],T).m).toBeCloseTo(before.m,10);
  expect(post.query([p],T).v).toBeCloseTo(before.v,10);
 });
 it('one fresh logistic observation updates the aged scalar Gaussian, not the pre-gap posterior',()=>{
  const p=scalar(),post=trained([p]),late=T+5*DAY,aged=post.query([p],late),expected=oneStep(aged.m,aged.v,0);
  observe(post,[p],late,0);
  const actual=post.query([p],late);
  expect(actual.m).toBeCloseTo(expected.m,7);
  expect(actual.v).toBeCloseTo(expected.v,7);
 });
 it('forgetting one component preserves the joint uncertainty of the stable components when the next likelihood is constant',()=>{
  const stable=[part('mu',1),part('facet:use',.25)],kc=scalar(0),parts=[...stable,kc],post=trained(parts);
  post.touch(kc.id,kc.prior,kc.q,kc.m0,T,.5);
  const directions=[...parts.map(p=>[p]),stable,parts,[stable[0],{...stable[1],x:-1}], [{...kc,x:2},stable[0]]];
  const before=directions.map(direction=>post.query(direction,T));
  // The historical KC is a single shared latent, not independent nuisance noise in every old row.
  observe(post,parts,T,0,0);
  for(let i=0;i<directions.length;i++){
   const after=post.query(directions[i],T);
   expect(after.m).toBeCloseTo(before[i].m,9);
   expect(after.v).toBeCloseTo(before[i].v,9);
  }
 });
 it('a negligible intermediate event cannot change a later query by splitting the ageing interval',()=>{
  const parts=[part('mu',1),scalar()],direct=trained(parts),split=trained(parts),mid=T+3*DAY,late=T+6*DAY;
  observe(split,parts,mid,1,1,1e-10);
  for(const direction of [parts,[parts[0]],[parts[1]],[parts[0],{...parts[1],x:-1}]]){
   const expected=direct.query(direction,late),actual=split.query(direction,late);
   expect(actual.m).toBeCloseTo(expected.m,8);expect(actual.v).toBeCloseTo(expected.v,8);
  }
 });
 it('reading estimates at arbitrary times does not affect later observations or shared fits',()=>{
  const parts=[part('mu',1),scalar()],quiet=new Posterior(),queried=new Posterior(),linked=new Posterior();
  for(let i=0;i<12;i++){
   const time=T+i*DAY;
   for(const post of [quiet,queried,linked]){
    if(i===6)post.touch('kc:k',.5,.02,0,time,.1);
    observe(post,parts,time,+(i%3!==0));
   }
   queried.query(parts,time);queried.query(parts,time+500*DAY);queried.inspect();
  }
  linked.link(quiet);
  const at=T+12*DAY,expected=quiet.query(parts,at),fit=quiet.inspect(),mean=Array.from(fit.c),covariance=fit.S.map(row=>Array.from(row));
  expect(queried.query(parts,at)).toEqual(expected);expect(linked.query(parts,at)).toEqual(expected);
  expect(linked.inspect().S).toBe(fit.S);
  queried.query(parts,at+1e4*DAY);linked.query(parts,at+1e4*DAY);quiet.query(parts,at+DAY);
  expect(Array.from(fit.c)).toEqual(mean);expect(fit.S.map(row=>Array.from(row))).toEqual(covariance);
  expect(quiet.query(parts,at)).toEqual(expected);expect(queried.query(parts,at)).toEqual(expected);
 });
 it('observing a newly introduced independent component preserves all ageing of existing components',()=>{
  const old=[part('mu',1),scalar()],reference=trained(old),post=trained(old),fresh={...part('new',.4,.03),m0:.7,m:.7},mid=T+3*DAY,late=T+6*DAY;
  const freshOnly=new Posterior();observe(post,[fresh],mid,0);observe(freshOnly,[fresh],mid,0);
  expect(post.query([fresh],mid)).toEqual(freshOnly.query([fresh],mid));
  for(const direction of [old,[old[0]],[old[1]],[old[0],{...old[1],x:-1}]]){
   const expected=reference.query(direction,late),actual=post.query(direction,late);
   expect(actual.m).toBeCloseTo(expected.m,9);expect(actual.v).toBeCloseTo(expected.v,9);
  }
 });
 it('a full instruction reset clears remaining correlations even when ageing has already capped the marginal',()=>{
  const stable=part('mu',1),kc=scalar(),parts=[stable,kc],post=trained(parts),initial=post.query([kc],T),
   late=Math.ceil(T+((kc.prior-initial.v)/kc.q+1)*DAY),before=post.query(parts,late),mu=post.query([stable],late),latent=post.query([kc],late);
  expect(latent.v).toBeCloseTo(kc.prior,10);
  // Time relaxation is continuous: a finite prior cap alone need not have removed all correlations.
  expect(Math.abs(before.v-mu.v-latent.v)).toBeGreaterThan(.01);
  post.touch(kc.id,kc.prior,kc.q,kc.m0,late,kc.prior);
  const reset=post.query(parts,late);
  expect(reset.v).toBeCloseTo(mu.v+kc.prior,10);expect(reset.m).toBeCloseTo(before.m,10);
  expect(post.query([stable],late)).toEqual(mu);expect(post.query([kc],late)).toEqual(latent);
 });
 it('instruction timing is independent of unrelated observations inserted between instructions',()=>{
  const parts=[part('mu',1),scalar()],quiet=trained(parts),interleaved=trained(parts);
  for(const [day,bump] of [[1,.02],[3,.03]]){
   const time=T+day*DAY;
   for(const post of [quiet,interleaved])post.touch('kc:k',.5,.02,0,time,bump);
   // Observing an independent new latent carries no information about either old component.
   // It therefore cannot change when their pending instruction/process noise is applied.
   observe(interleaved,[part('independent:'+day,.4)],time,0);
  }
  for(const direction of [parts,[parts[0]],[parts[1]],[parts[0],{...parts[1],x:-1}]]){
   const expected=quiet.query(direction,T+6*DAY),actual=interleaved.query(direction,T+6*DAY);
   expect(actual.m).toBeCloseTo(expected.m,9);expect(actual.v).toBeCloseTo(expected.v,9);
  }
 });
 it('a fresh observation of one component uses the aged covariance of an unobserved correlated component',()=>{
  const stable=part('mu',1),kc=scalar(),parts=[stable,kc],post=trained(parts),late=T+5*DAY;
  const mu=post.query([stable],late),latent=post.query([kc],late),sum=post.query(parts,late),cross=(sum.v-mu.v-latent.v)/2,
   expectedMu=oneStep(mu.m,mu.v,0),J=1/expectedMu.v-1/mu.v,
   expectedKC={m:latent.m+cross*(expectedMu.m-mu.m)/mu.v,v:latent.v-cross*cross*J/(1+mu.v*J)};
  // There is no KC feature in this new observation, but process noise on the KC must already be in its carried covariance.
  observe(post,[stable],late,0);
  const actualMu=post.query([stable],late),actualKC=post.query([kc],late);
  expect(actualMu.m).toBeCloseTo(expectedMu.m,7);expect(actualMu.v).toBeCloseTo(expectedMu.v,7);
  expect(actualKC.m).toBeCloseTo(expectedKC.m,7);expect(actualKC.v).toBeCloseTo(expectedKC.v,7);
 });
});

describe('N186 covariance transport from below and above the prior',()=>{
 for(const side of ['below','above'] as const)it(`composes exactly and stays positive definite when the fitted marginals start ${side} prior`,()=>{
  const parts=side==='below'?[part('a',.6,.03),part('b',.4,.02)]:[
   {...part('a',.6,.03),m0:1.8,m:1.8},{...part('b',.4,.02),m0:1.2,m:1.2},
  ];
  const make=()=>{
   if(side==='below')return trained(parts);
   const post=new Posterior();
   // This noncanonical likelihood has negative observed curvature at its mode.
   // Its legitimate Laplace covariance is above prior and must not be clipped at zero time.
   post.observe(parts,3,0,.2,.4,10,0,T);return post;
  };
  const direct=make(),split=make(),initial=direct.inspect().S;
  for(let i=0;i<2;i++){
   if(side==='below')expect(initial[i][i]).toBeLessThan(parts[i].prior);
   else expect(initial[i][i]).toBeGreaterThan(parts[i].prior);
   expect(direct.query([parts[i]],T).v).toBeCloseTo(initial[i][i],12);
  }
  for(const days of [0,.01,.5,1,2,6,30,1e4]){
   const time=T+days*DAY,a=direct.query([parts[0]],time).v,c=direct.query([parts[1]],time).v,
    sum=direct.query(parts,time).v,b=(sum-a-c)/2,
    expected=parts.map((p,i)=>initial[i][i]+Math.sign(p.prior-initial[i][i])*Math.min(Math.abs(p.prior-initial[i][i]),p.q*days));
   expect(a).toBeCloseTo(expected[0],10);expect(c).toBeCloseTo(expected[1],10);
   expect(b).toBeCloseTo(initial[0][1]*Math.exp(-days*(parts[0].q/parts[0].prior+parts[1].q/parts[1].prior)/2),10);
   // For a symmetric 2×2 matrix this is the exact smallest eigenvalue, checking every direction.
   expect((a+c-Math.hypot(a-c,2*b))/2).toBeGreaterThan(0);
   for(const x of [[1,1],[1,-1],[1,-2],[.3,.7]]){
    const direction=parts.map((p,i)=>({...p,x:x[i]})),wanted=a*x[0]**2+2*b*x[0]*x[1]+c*x[1]**2;
    expect(direct.query(direction,time).v).toBeCloseTo(wanted,10);
   }
  }
  observe(split,[part('independent-1',.3)],T+.5*DAY,0);
  observe(split,[part('independent-2',.3)],T+2*DAY,1);
  for(const direction of [parts,[parts[0]],[parts[1]],[parts[0],{...parts[1],x:-2}]]){
   const expected=direct.query(direction,T+6*DAY),actual=split.query(direction,T+6*DAY);
   expect(actual.m).toBeCloseTo(expected.m,10);expect(actual.v).toBeCloseTo(expected.v,10);
  }
  // Force lazy covariance coordinates to rebase, preserving a tiny but nonzero
  // correlation. A relative check catches premature intermediate underflow.
  const rebased=make(),long=5000;
  observe(rebased,[part('far-independent',.3)],T+long*DAY,1);
  const fit=rebased.inspect(),a=fit.ids.indexOf(parts[0].id),b=fit.ids.indexOf(parts[1].id),
   expectedCross=initial[0][1]*Math.exp(-long*(parts[0].q/parts[0].prior+parts[1].q/parts[1].prior)/2);
  expect(expectedCross).not.toBe(0);expect(fit.S[a][b]/expectedCross).toBeCloseTo(1,12);
  expect(fit.S[a][b]).toBe(fit.S[b][a]);
  // After exponential retention itself underflows, fresh evidence must still
  // produce the same finite Gaussian update from the fully aged prior.
  const far=T+1e6*DAY,aged=direct.query(parts,far),expected=oneStep(aged.m,aged.v,0);
  observe(rebased,parts,far,0);
  expect(rebased.query(parts,far).m).toBeCloseTo(expected.m,8);
  expect(rebased.query(parts,far).v).toBeCloseTo(expected.v,8);
 });
});

const history=():AtlasFacts=>({
 concepts:[{id:'s',name:'Sets',kind:'topic',level:'system'},{id:'k',name:'Compactness',kind:'topic',parent_id:'s'}],
 instructions:[{id:'initial',concept_id:'k',occurred_at:new Date(T).toISOString()}],
 attempts:Array.from({length:60},(_,i):Attempt=>({id:i+1,occurred_at:new Date(T+DAY+i*3600e3).toISOString(),session_id:'S'+i,item_kind:'practice',
  tags:[{concept_id:'k',facet:'use',role:'target',stage:'E',result:i%4?'ok':'fail',hint_level:0}]})),cards:[],reviews:[],
});
const last=T+DAY+59*3600e3;
const append=(facts:AtlasFacts,time:number,weight:number):AtlasFacts=>({...facts,attempts:[...facts.attempts,{
 ...facts.attempts[0],id:'fresh',session_id:'fresh',occurred_at:new Date(time).toISOString(),weight,
}]});

describe('N186 transitions through production replay',()=>{
 it('a negligible-weight fresh attempt cannot revive old certainty after the fitted KC has reached its prior',()=>{
  const facts=history(),p=part('kc:k',.71**2,.01),before=replay(facts,{},last),jointV=before.post![0].query([p],last).v,
   filterV=before.hypotheses[0].components[p.id].v,days=((p.prior-jointV)+(p.prior-filterV))/(2*p.q),late=Math.round(last+days*DAY),
   aged=before.post![0].query([p],late);
  // Choose a date between the joint marginal's and the ADF marginal's return to prior. This
  // remains an independent lifecycle test when the fitted covariance changes with a model fix.
  expect(jointV).toBeGreaterThan(filterV);expect(aged.v).toBeCloseTo(p.prior,10);
  expect(filterV+p.q*(late-last)/DAY).toBeLessThan(p.prior);
  for(const weight of [0,1e-10]){
   const after=replay(append(facts,late,weight),{},late).post![0].query([p],late);
   expect(after.v).toBeCloseTo(aged.v,8);
   expect(after.m).toBeCloseTo(aged.m,8);
  }
 });
 it('a negligible-weight fresh attempt preserves partial ageing in the real component lifecycle',()=>{
  const facts=history(),p=part('kc:k',.71**2,.01),before=replay(facts,{},last),initial=before.post![0].query([p],last),
   late=Math.round(last+(p.prior-initial.v)/(2*p.q)*DAY),aged=before.post![0].query([p],late);
  expect(p.prior-initial.v).toBeGreaterThan(.05);expect(aged.v).toBeLessThan(p.prior);
  expect(aged.v).toBeCloseTo(initial.v+p.q*(late-last)/DAY,10);
  const after=replay(append(facts,late,1e-10),{},late).post![0].query([p],late);
  expect(after.v).toBeCloseTo(aged.v,8);expect(after.m).toBeCloseTo(aged.m,8);
 });
 it('instruction followed by negligible evidence preserves stable-component covariance',()=>{
  const late=last+DAY,facts={...history(),instructions:[...history().instructions!,{id:'new',concept_id:'k',occurred_at:new Date(late).toISOString()}]},
   stable=[part('mu',1),part('facet:use',.25)],before=replay(facts,{},late).post![0].query(stable,late),
   after=replay(append(facts,late,1e-10),{},late).post![0].query(stable,late);
  expect(after.v).toBeCloseTo(before.v,8);expect(after.m).toBeCloseTo(before.m,8);
 });
 it('reporting transitions leave predictions and the production ADF state unchanged',()=>{
  const late=last+10*DAY,facts=append({...history(),instructions:[...history().instructions!,{id:'new',concept_id:'k',occurred_at:new Date(last+5*DAY).toISOString()}]},late,1),joint=replay(facts,{},late);
  Posterior.MAX=0;const filter=replay(facts,{},late);Posterior.MAX=256;
  // Exercise lazy report fitting as well as replay before comparing the independent prediction path.
  const jointP=estimate(joint,'k','use',late).p,filterP=estimate(filter,'k','use',late).p;
  expect(joint.trace).toEqual(filter.trace);expect(joint.hypotheses).toEqual(filter.hypotheses);
  expect(joint.pi).toEqual(filter.pi);expect(joint.mix).toEqual(filter.mix);expect(jointP).toBe(filterP);
 });
});
