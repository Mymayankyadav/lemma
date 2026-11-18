// Atlas v3: prequential KC FSRS × hierarchical execution ADF, hypothesis and PFA mixtures.
import FSRS from '../fsrs.js';
import {DAY,clamp,sigmoid,probit,logit} from './math.ts';
import {ancestors,countsUncued,type Concept,type Facet,type Stage} from './kc.ts';
export type Component={m:number;v:number;prior:number;q:number;at:number};
export type Memory={s:number;d:number;last:number};
export type AttemptTag={id?:string|number;attempt_id?:string|number;concept_id:string;facet:Facet;role:'target'|'required'|'incidental';stage?:Stage|null;result?:'ok'|'fail'|'not_reached'|null;hint_level?:number;demand?:number;error_tag?:string|null;confidence?:number};
export type Attempt={id:string|number;occurred_at:string;session_id?:string|null;project_id?:string|null;checkpoint_id?:string|null;item_id?:string|null;item_kind?:string;cued?:string[];confidence_before?:number|null;minutes?:number|null;plan_score?:number|null;furthest_stage?:Stage|'done'|null;legacy_outcome?:'pass'|'partial'|'fail'|null;weight?:number;novelty?:string;context?:Record<string,unknown>;voided_at?:string|null;superseded_by?:string|number|null;tags?:AttemptTag[]};
export type Instruction={id:string|number;occurred_at:string;concept_id:string;voided_at?:string|null};
export type CardFact={id:string;concept_id:string;system_id?:string;stability?:number;difficulty?:number;last_review?:string|null;facet?:Facet};
export type ReviewFact={id:string|number;occurred_at:string;card_id:string;rating:number;hours?:number;voided_at?:string|null};
export type ModelLink={id:string;from_id:string;to_id:string;kind:string;status?:string};
export type AtlasFacts={concepts:Concept[];attempts:Attempt[];tags?:AttemptTag[];instructions?:Instruction[];cards?:CardFact[];reviews?:ReviewFact[];links?:ModelLink[];assumptions?:{concept_id:string;level:string;revoked_at?:string|null}[];sessions?:{id:string;started_at:string}[];items?:{id:string;b:number;b_sd?:number}[]};
export type PfaFit=Record<string,number>;
export type Fit={pfa?:PfaFit;card_w?:number[];version?:number};
export type Hypothesis={components:Record<string,Component>;memory:Record<string,Memory>;cards:Record<string,Memory>;counts:Record<string,number>;successes:Record<string,number>};
export type Prediction={id:string;at:number;stream:'attempt'|'card';p:number;kf:number;pfa:number;base:number;y:number;concept_id?:string;facet?:Facet;confidence?:number|null;hours:number;hint:number;kind:string;features:Record<string,number>;hypotheses:number[]};
export type DirectEvidence={at:number;session:string;clean:boolean;novel:boolean;uncued:boolean};
export type MeasurementState={hypotheses:Hypothesis[];pi:number[];mix:number[];gaps:Record<string,number>;tracked:string[];direct:Record<string,DirectEvidence[]>;lastInstruction:Record<string,number>;trace:Prediction[];fit:Fit;facts:AtlasFacts;now:number;index:Record<string,Concept>;ix:Lookup;research:boolean;running:{attempt:{n:number;y:number};card:{n:number;y:number}}};
/** One-pass lookup tables for replay: every per-event find/filter over the facts was linear, so a replay was quadratic in the number of attempts. */
export type Lookup={tags:Map<string,AttemptTag[]>;sessions:Map<unknown,{id:string;started_at:string}>;items:Map<unknown,NonNullable<AtlasFacts['items']>[number]>;cardsByConcept:Map<string,CardFact[]>;cards:Map<string,CardFact>;concepts:Map<string,Concept>;kc:Map<string,string>;anc:Map<string,string[]>;cross:Map<string,Map<string,string>>;pfaKc:Map<string,string>;pfaSys:Map<string,string>};
/** Interned component ids: building 'kc:'+id on every observation made each lookup in `components` hash a fresh string. */
const memo=(m:Map<string,string>,prefix:string,id:string)=>{let v=m.get(id);if(v===undefined){v=prefix+id;m.set(id,v);}return v;};
function lookup(f:AtlasFacts):Lookup{
 const ix:Lookup={tags:new Map(),sessions:new Map(),items:new Map(),cardsByConcept:new Map(),cards:new Map(),concepts:new Map(f.concepts.map(c=>[c.id,c])),kc:new Map(),anc:new Map(),cross:new Map(),pfaKc:new Map(),pfaSys:new Map()};
 for(const t of f.tags??[]){const k=String(t.attempt_id),l=ix.tags.get(k);if(l)l.push(t);else ix.tags.set(k,[t]);}
 for(const x of f.sessions??[])if(!ix.sessions.has(x.id))ix.sessions.set(x.id,x as any);
 for(const x of f.items??[])if(!ix.items.has(x.id))ix.items.set(x.id,x);
 for(const c of f.cards??[]){if(!ix.cards.has(c.id))ix.cards.set(c.id,c);const l=ix.cardsByConcept.get(c.concept_id);if(l)l.push(c);else ix.cardsByConcept.set(c.concept_id,[c]);}
 return ix;
}
export type Estimate={facet:Facet;p:number;lo:number;hi:number;m:number;variance:number;sd:number;sessions:number;state:'shown'|'inferred'|'none';retention:number;gap:number;inferredFrom?:string;certified?:boolean};
const key=(k:string,f:Facet)=>k+':'+f;
const at=(s:string)=>{const n=Date.parse(s);if(!Number.isFinite(n))throw Error('Invalid fact timestamp');return n;};
export function memoryAt(m:Memory|undefined,t:number,w:number[]=FSRS.DEFAULT_W):number{return m?FSRS.retrievability(w,Math.max(0,(t-m.last)/DAY),m.s):0;}
/** Fractional observations interpolate a full FSRS step; only an explicit direct observation resets L. */
/** The harness (research/sim/fsrs.py) updates with fractional days and treats an interval under half a day as same-day; the app counts whole days. */
const researchDays=(days:number)=>days<.5?0:days;
export function memoryStep(m:Memory|undefined,t:number,grade:number,weight=1,reset=false,w:number[]=FSRS.DEFAULT_W,exact=false):Memory{
 if(!m)return {...FSRS.step(w,null,0,grade),last:t};
 const full=FSRS.step(w,m,exact?researchDays((t-m.last)/DAY):Math.max(0,Math.floor((t-m.last)/DAY)),grade),z=clamp(weight);
 return {s:clamp(m.s+z*(full.s-m.s),.001,36500),d:clamp(m.d+z*(full.d-m.d),1,10),last:reset?t:m.last};
}
export function age(c:Component,t:number):void{c.v=Math.min(c.prior,c.v+c.q*Math.max(0,(t-c.at)/DAY));c.at=Math.max(c.at,t);}
function component(h:Hypothesis,id:string,t:number,sd:number,q=0,m=0,write=true):Component{
 const found=h.components[id];const c=found?(write?found:{...found}):{m,v:sd*sd,prior:sd*sd,q,at:t};if(write&&!found)h.components[id]=c;age(c,t);return c;
}
export type Feature={c:Component;x:number};
/** Research-compatible component set (`replay(..., {research:true})`): exactly the harness KF of research/sim/models.py: global, system, KC (with the KC's own ageing), learning slope, fatigue; no facet, cross, link or theme terms. */
export const RESEARCH_KC_SD=Math.SQRT1_2;
function researchFeatures(h:Hypothesis,s:MeasurementState,k:string,t:number,hours:number,item:string|undefined,b:number,bSd:number,readOnly:boolean):Feature[]{
 const get=(id:string,sd:number,q=0,m=0)=>component(h,id,t,sd,q,m,!readOnly),out:Feature[]=[{c:get('mu',1),x:1}];
 for(const a of s.ix.anc.get(k)??(s.ix.anc.set(k,ancestors(k,s.ix.concepts).map(x=>'ancestor:'+x)),s.ix.anc.get(k)!))out.push({c:get(a,.5),x:1});
 out.push({c:get(memo(s.ix.kc,'kc:',k),RESEARCH_KC_SD,.01),x:1},{c:get('learning',Math.sqrt(.1),0,.3),x:Math.log1p(h.counts[k]??0)},{c:get('fatigue',.2,0,.2),x:-hours});
 if(item)out.push({c:get('item:'+item,bSd,0,b),x:-1});
 return out;
}
function features(h:Hypothesis,s:MeasurementState,k:string,f:Facet,t:number,hours:number,b:number,bSd:number,item?:string,readOnly=false):Feature[]{
 if(s.research)return researchFeatures(h,s,k,t,hours,item,b,bSd,readOnly);
 const get=(id:string,t:number,sd:number,q=0,m=0)=>component(h,id,t,sd,q,m,!readOnly);
 const map=s.ix.concepts,out:Feature[]=[{c:get('mu',t,1),x:1},{c:get('facet:'+f,t,.5),x:1}];
 let anc=s.ix.anc.get(k);if(!anc){anc=ancestors(k,map).map(a=>'ancestor:'+a);s.ix.anc.set(k,anc);}
 for(const a of anc)out.push({c:get(a,t,.5,.005),x:1});
 let cross=s.ix.cross.get(k);if(!cross){cross=new Map();s.ix.cross.set(k,cross);}let crossKey=cross.get(f);if(!crossKey){crossKey='cross:'+key(k,f);cross.set(f,crossKey);}
 out.push({c:get(memo(s.ix.kc,'kc:',k),t,.71,.01),x:1},{c:get(crossKey,t,.5,.01),x:1},
  {c:get('learning',t,.32,0,.3),x:Math.log1p(h.counts[k]??0)},{c:get('fatigue',t,.2,0,.2),x:-hours});
 for(const l of s.facts.links??[])if(l.status==='approved'&&['equivalent','generalises','instance_of'].includes(l.kind)&&(l.from_id===k||l.to_id===k)){
  const id=l.kind==='instance_of'?'theme:'+l.to_id:'link:'+l.id;out.push({c:get(id,t,l.kind==='equivalent'?.4:.3,.005),x:1});
 }
 if(item)out.push({c:get('item:'+item,t,bSd,0,b),x:-1});
 return out;
}
/** `research`: the harness KF takes d = A·e(1−e) without the probit attenuation factor (research/sim/models.py KF.upd); the production derivative is exact (finite-difference tested). */
export function likelihood(m:number,v:number,retrieval:number,guess=.05,hint=0,research=false):{p:number;G:(y:number)=>number;H:number;execution:number;amplitude:number}{
 const attenuation=1/Math.sqrt(1+Math.PI*Math.max(0,v)/8),e=sigmoid((m+hint)*attenuation),A=(1-guess-.03)*clamp(retrieval),p=clamp(guess+A*e,1e-9,1-1e-9),d=A*e*(1-e)*(research?1:attenuation);
 return {p,G:y=>(y-p)*d/(p*(1-p)),H:d*d/(p*(1-p)),execution:e,amplitude:A};
}
export function adf(fs:Feature[],G:number,H:number,weight=1,floor=1e-8):void{
 const V=fs.reduce((a,{c,x})=>a+c.v*x*x,0),den=1+V*Math.max(0,H)*weight;
 for(const {c,x} of fs){const v=c.v;c.m+=v*x*G*weight/den;c.v=clamp(v-v*v*x*x*Math.max(0,H)*weight/den,floor,c.prior);}
}
export function bayesWeights(weights:number[],ps:number[],y:number,share=0):number[]{
 const w=weights.map((v,i)=>v*clamp(y?ps[i]:1-ps[i],1e-12,1)),sum=w.reduce((a,b)=>a+b,0);
 return w.map(v=>(1-share)*v/sum+share/w.length);
}
export function pfaFeatures(s:MeasurementState,k:string,hours:number,b:number):Record<string,number>{
 const h=s.hypotheses[0],c=s.index[k],sys=c?.parent_id??'root';
 return {intercept:1,[memo(s.ix.pfaKc,'kc:',k)]:1,[memo(s.ix.pfaSys,'system:',sys)]:1,success:Math.log1p(h.successes[k]??0),attempts:Math.log1p(h.counts[k]??0),b,hours};
}
function pfa(s:MeasurementState,x:Record<string,number>):number{let z=0;const w=s.fit.pfa;for(const k in x)z+=x[k]*(w?.[k]??(k==='b'?-1:0));return sigmoid(z);}
function observation(s:MeasurementState,h:Hypothesis,tags:AttemptTag[],t:number,hours:number,b:number,bSd:number,hint:number,item?:string,kappa=0,options?:number,readOnly=false){
 const target=tags.find(x=>x.role==='target')??tags[0],fs=features(h,s,target.concept_id,target.facet,t,hours,b,bSd,item,readOnly);
 const m=fs.reduce((z,{c,x})=>z+c.m*x,0)-(item?0:b)+kappa,V=fs.reduce((z,{c,x})=>z+c.v*x*x,0)+(item?0:bSd*bSd);
 let retrieval=memoryAt(h.memory[target.concept_id],t);
 for(const q of tags)if(q!==target)retrieval*=memoryAt(h.memory[q.concept_id],t)**(q.role==='required'?.5:1);
 const l=likelihood(m,V,retrieval,options?1/options:.05,hint,s.research);
 return {...l,fs,m,V,target,R:memoryAt(h.memory[target.concept_id],t)};
}
export function predict(s:MeasurementState,k:string,f:Facet,t=s.now,b=0,hours=0):number{
 const tag:AttemptTag={concept_id:k,facet:f,role:'target'},ps=s.hypotheses.map(h=>observation(s,h,[tag],t,hours,b,.7,0,undefined,0,undefined,true).p),kf=ps.reduce((a,p,i)=>a+p*s.pi[i],0);
 return s.mix[0]*kf+s.mix[1]*pfa(s,pfaFeatures(s,k,hours,b));
}
function updateTrial(s:MeasurementState,tags:AttemptTag[],a:Attempt,t:number,hours:number,y:number,hint:number,kappa=0):void{
 if(!tags.length)return;
 const it=s.ix.items.get(a.item_id),b=it?.b??0,bSd=it?.b_sd??.7,options=Number(a.context?.options)||undefined;
 const observations=s.hypotheses.map(h=>observation(s,h,tags,t,hours,b,bSd,hint,a.item_id??undefined,kappa,options));
 const ps=observations.map(o=>o.p),kf=ps.reduce((z,p,i)=>z+s.pi[i]*p,0),x=pfaFeatures(s,observations[0].target.concept_id,hours,b),pf=pfa(s,x);
 const prior=s.running.attempt,base=(1+prior.y)/(2+prior.n),weight=clamp(a.weight??1)*clamp(observations[0].target.confidence??1);
 s.trace.push({id:String(a.id)+':'+s.trace.length,at:t,stream:'attempt',p:s.mix[0]*kf+s.mix[1]*pf,kf,pfa:pf,base,y,concept_id:tags[0].concept_id,facet:tags[0].facet,confidence:a.confidence_before,hours,hint,kind:a.item_kind??'legacy',features:x,hypotheses:ps});
 for(let i=0;i<s.hypotheses.length;i++){
  const h=s.hypotheses[i],o=observations[i];adf(o.fs,o.G(y),o.H,weight,s.research?1e-4:1e-8);
  const k=o.target.concept_id;
  if(y){h.memory[k]=memoryStep(h.memory[k],t,3,weight,true,undefined,s.research);for(const q of tags)if(q!==o.target)h.memory[q.concept_id]=memoryStep(h.memory[q.concept_id],t,3,.4*weight,false,undefined,s.research);}
  else{const r=clamp((1-o.R)*(1-(options?1/options:.05))/(1-o.p));h.memory[k]=memoryStep(h.memory[k],t,1,r*weight,false,undefined,s.research);h.memory[k]=memoryStep(h.memory[k],t,3,(1-r)*weight,true,undefined,s.research);}
  if(y)for(const card of s.ix.cardsByConcept.get(k)??[])if(h.cards[card.id])h.cards[card.id]=memoryStep(h.cards[card.id],t,3,.2*weight,false,s.fit.card_w,s.research);
 }
 s.pi=bayesWeights(s.pi,ps,y);s.mix=bayesWeights(s.mix,[kf,pf],y,.001);s.running.attempt.n++;s.running.attempt.y+=y;
}
function consumeAttempt(s:MeasurementState,a:Attempt):void{
 const t=at(a.occurred_at),sess=s.ix.sessions.get(a.session_id),hours=sess?clamp((t-at(sess.started_at))/3600000,0,24):0;
 const tags=(a.tags??s.ix.tags.get(String(a.id))??[]).filter(x=>x.result!=='not_reached'&&countsUncued(x.facet,x.concept_id,a.cued??[]));
 const seen=new Set<string>();
 for(const tag of tags){
  const k=key(tag.concept_id,tag.facet);if(seen.has(k))continue;seen.add(k);
  for(const h of s.hypotheses)if(!h.memory[tag.concept_id])h.memory[tag.concept_id]=memoryStep(undefined,t,3);
  if(tag.role==='target'&&!s.tracked.includes(k))s.tracked.push(k);
  else if(!s.tracked.includes(k)){
   const gap=s.gaps[k]??.05,ok=tag.result==='ok'||a.legacy_outcome==='pass',g=tag.role==='incidental'?.8:a.item_kind==='micro'?.3:.5;
   const Lg=ok?g:1-g,Lm=ok?.97:.03;s.gaps[k]=gap*Lg/(gap*Lg+(1-gap)*Lm);if(s.gaps[k]>.8)s.tracked.push(k);
  }
  if(tag.role==='target')(s.direct[k]??=[]).push({at:t,session:a.session_id??String(a.id),clean:(tag.result==='ok'||a.legacy_outcome==='pass')&&!(tag.hint_level??0),novel:!['familiar','seen_solution','self_reported'].includes(a.novelty??'novel'),uncued:!(a.cued??[]).includes(tag.concept_id)});
 }
 if(a.legacy_outcome){
  for(const tag of tags){const partial=a.legacy_outcome==='partial'||(a.legacy_outcome==='pass'&&(tag.hint_level??0)>=2);
   if(partial){updateTrial(s,[tag],a,t,hours,1,0,3.5);updateTrial(s,[tag],a,t,hours,0,0);}else updateTrial(s,[tag],a,t,hours,a.legacy_outcome==='pass'?1:0,0);}
 }else for(const stage of ['U','S','E','C'] as Stage[]){
  const group=tags.filter(x=>x.stage===stage),reached=group.filter(x=>x.result==='ok'||x.result==='fail');if(!reached.length)continue;
  const culprit=reached.find(x=>x.error_tag&&x.result==='fail');
  if(culprit){for(const tag of reached)if(tag.result==='ok')updateTrial(s,[tag],a,t,hours,1,0);updateTrial(s,[culprit],a,t,hours,0,0);continue;}
  const hint=Math.max(...reached.map(x=>x.hint_level??0));if(hint>=4)continue;
  for(let h=0;h<hint;h++)updateTrial(s,reached,a,t,hours,0,h);
  updateTrial(s,reached,a,t,hours,reached.every(x=>x.result==='ok')?1:0,hint);
 }
 for(const k of new Set(tags.filter(x=>x.role==='target').map(x=>x.concept_id)))for(const h of s.hypotheses){h.counts[k]=(h.counts[k]??0)+1;if(a.legacy_outcome==='pass'||tags.some(x=>x.concept_id===k&&x.result==='ok'))h.successes[k]=(h.successes[k]??0)+1;}
}
function consumeReview(s:MeasurementState,r:ReviewFact):void{
 const c=s.ix.cards.get(r.card_id);if(!c)return;const t=at(r.occurred_at),y=r.rating>1?1:0;
 const ps:number[]=[];
 for(let i=0;i<s.hypotheses.length;i++){
  const h=s.hypotheses[i],R=memoryAt(h.cards[c.id],t,s.fit.card_w),fs=[{c:component(h,'card:global',t,.32),x:1},{c:component(h,'card:system:'+(c.system_id??''),t,.22),x:1},{c:component(h,'card:kc:'+c.concept_id,t,.32),x:1},{c:component(h,'card:fatigue',t,.1),x:-(r.hours??0)}];
  const m=logit(R)+fs.reduce((z,{c,x})=>z+c.m*x,0),v=fs.reduce((z,{c,x})=>z+c.v*x*x,0),p=probit(m,v);ps.push(p);adf(fs,y-p,p*(1-p));
  h.cards[c.id]=memoryStep(h.cards[c.id],t,r.rating,1,true,s.fit.card_w);
  if(i===s.hypotheses.length-1&&h.memory[c.concept_id])h.memory[c.concept_id]=memoryStep(h.memory[c.concept_id],t,r.rating,.3,false,undefined,s.research);
 }
 const prev=s.running.card,base=(1+prev.y)/(2+prev.n),p=ps.reduce((a,p,i)=>a+p*s.pi[i],0);
 s.trace.push({id:String(r.id),at:t,stream:'card',p,kf:p,pfa:base,base,y,concept_id:c.concept_id,hours:r.hours??0,hint:0,kind:'card',features:{},hypotheses:ps});s.pi=bayesWeights(s.pi,ps,y);s.running.card.n++;s.running.card.y+=y;
}
export function replay(facts:AtlasFacts,fit:Fit={},now?:number,options:{research?:boolean}={}):MeasurementState{
 const fresh=():Hypothesis=>({components:{},memory:{},cards:{},counts:{},successes:{}});
 const research=!!options.research,s:MeasurementState={hypotheses:research?[fresh()]:[fresh(),fresh()],pi:research?[1]:[.5,.5],mix:research?[1,0]:[.8,.2],research,gaps:{},tracked:[],direct:{},lastInstruction:{},trace:[],fit,facts,now:now??0,index:Object.fromEntries(facts.concepts.map(c=>[c.id,c])),ix:lookup(facts),running:{attempt:{n:0,y:0},card:{n:0,y:0}}};
 for(const a of facts.assumptions??[])if(!a.revoked_at)s.gaps[key(a.concept_id,a.level as Facet)]=.05;
 const events=[...facts.attempts.filter(a=>!a.voided_at&&!a.superseded_by).map(a=>({t:at(a.occurred_at),id:String(a.id),kind:1 as const,value:a})),...(facts.instructions??[]).filter(a=>!a.voided_at).map(a=>({t:at(a.occurred_at),id:String(a.id),kind:0 as const,value:a})),...(facts.reviews??[]).filter(a=>!a.voided_at).map(a=>({t:at(a.occurred_at),id:String(a.id),kind:2 as const,value:a}))].sort((a,b)=>a.t-b.t||a.kind-b.kind||(a.id.length-b.id.length)||a.id.localeCompare(b.id));
 const duplicates=new Set<string>();
 for(const e of events){s.now=Math.max(s.now,e.t);
  if(e.kind===0){const ins=e.value as Instruction;s.lastInstruction[ins.concept_id]=e.t;for(const h of s.hypotheses){h.memory[ins.concept_id]=memoryStep(h.memory[ins.concept_id],e.t,3,1,true,undefined,s.research);const c=component(h,'kc:'+ins.concept_id,e.t,s.research?RESEARCH_KC_SD:.71,.01);if(!s.research)c.v=Math.min(c.prior,c.v+.5);for(const card of s.facts.cards??[])if(card.concept_id===ins.concept_id&&!h.cards[card.id])h.cards[card.id]=memoryStep(undefined,e.t,3);}}
  else if(e.kind===1){const a=e.value as Attempt,ts=a.tags??s.ix.tags.get(String(a.id))??[],dedup=JSON.stringify([Math.floor(e.t/1000),a.session_id,ts.map(t=>[t.concept_id,t.facet,t.role,t.stage,t.result,t.hint_level]).sort(),a.legacy_outcome]);if(!duplicates.has(dedup)){duplicates.add(dedup);consumeAttempt(s,a);}}
  else consumeReview(s,e.value as ReviewFact);
 }
 return s;
}
export function estimate(s:MeasurementState,k:string,f:Facet,t=s.now):Estimate{
 const copy=s,tag:AttemptTag={concept_id:k,facet:f,role:'target'},obs=copy.hypotheses.map(h=>observation(copy,h,[tag],t,0,0,0,0,undefined,0,undefined,true)),m=obs.reduce((a,o,i)=>a+copy.pi[i]*o.m,0),variance=obs.reduce((a,o,i)=>a+copy.pi[i]*(o.V+(o.m-m)**2),0),sd=Math.sqrt(variance),direct=s.direct[key(k,f)]??[],sessions=new Set(direct.map(x=>x.session)).size;
 const retention=copy.hypotheses.reduce((a,h,i)=>a+copy.pi[i]*memoryAt(h.memory[k],t),0),p=predict(copy,k,f,t),z=1.2815515655*sd;
 return {facet:f,p,lo:Math.min(p,.05+.92*retention*sigmoid(m-z)),hi:Math.max(p,.05+.92*retention*sigmoid(m+z)),m,variance,sd,sessions,state:!s.trace.length||sd>.8?'none':sessions>=2&&sd<=.6?'shown':'inferred',retention,gap:s.gaps[key(k,f)]??.05,inferredFrom:s.facts.concepts.find(c=>c.id===s.facts.concepts.find(c=>c.id===k)?.parent_id)?.name};
}
