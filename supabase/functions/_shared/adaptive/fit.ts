import FSRS from '../fsrs.js';
import {hash,seeded,logLoss,logit,sigmoid,mean,clamp} from './math.ts';
import {replay,type AtlasFacts,type Fit,type Prediction,type PfaFit} from './measure.ts';
export type Health={stream:string;n:number;status:'insufficient data'|'ok'|'action';loss:number;baseline:number;pfa:number;a:number;b:number;ece:number;pitP:number;residuals:Record<string,number>;tests:Record<string,boolean|null>;actions:string[]};
/** MAP logistic fit on past-only features. Random effects get the tighter N(0,.3²) prior. */
export function fitPfa(trace:Prediction[],iterations=200):PfaFit{
 const data=trace.filter(x=>x.stream==='attempt'),names=[...new Set(data.flatMap(x=>Object.keys(x.features)))].sort(),w:Record<string,number>={};
 const prior=(k:string)=>k==='b'?-1:0,precision=(k:string)=>1/(k.startsWith('kc:')||k.startsWith('system:')?.3**2:.5**2);
 for(const k of names)w[k]=prior(k);
 // Penalised log-likelihood (Gaussian priors): the objective every step must improve.
 const objective=(v:Record<string,number>)=>{let z=0;for(const row of data){const p=clamp(sigmoid(Object.entries(row.features).reduce((a,[k,x])=>a+v[k]*x,0)),1e-12,1-1e-12);z+=row.y*Math.log(p)+(1-row.y)*Math.log(1-p);}
  for(const k of names)z-=precision(k)*(v[k]-prior(k))**2/2;return z;};
 let current=objective(w);
 for(let it=0;it<iterations;it++){
  const g:Record<string,number>={},h:Record<string,number>={};
  for(const k of names){g[k]=-(w[k]-prior(k))*precision(k);h[k]=precision(k);}
  for(const row of data){const p=sigmoid(Object.entries(row.features).reduce((z,[k,v])=>z+w[k]*v,0));for(const [k,x] of Object.entries(row.features)){g[k]+=x*(row.y-p);h[k]+=x*x*p*(1-p);}}
  // Diagonal Newton direction. Correlated features (intercept, KC, system, counts) make the full step overshoot and oscillate,
  // so halve it until the objective improves (backtracking); stop when no step helps.
  const d:Record<string,number>={};for(const k of names)d[k]=clamp(g[k]/h[k],-.2,.2);
  let t=1,next=w,value=-Infinity;
  for(;t>1e-4;t/=2){next=Object.fromEntries(names.map(k=>[k,w[k]+t*d[k]]));value=objective(next);if(value>current)break;}
  if(!(value>current))break;
  const largest=Math.max(0,...names.map(k=>Math.abs(next[k]-w[k])));
  Object.assign(w,next);current=value;
  if(largest<1e-7)break;
 }
 return w;
}
export function diagnose(trace:Prediction[],stream='attempt'):Health{
 const rows=trace.filter(x=>x.stream===stream).slice(-200),n=rows.length,loss=mean(rows.map(x=>logLoss(x.p,x.y))),baseline=mean(rows.map(x=>logLoss(x.base,x.y))),pfa=mean(rows.map(x=>logLoss(x.pfa,x.y)));
 let a=0,b=1;
 // Newton fit y ~ a+b logit(p), with a tiny ridge for all-pass or all-fail streams.
 for(let j=0;j<30&&n>=50;j++){
  let ga=-a*1e-3,gb=-(b-1)*1e-3,aa=1e-3,ab=0,bb=1e-3;
  for(const r of rows){const x=logit(r.p),p=sigmoid(a+b*x),v=p*(1-p);ga+=r.y-p;gb+=x*(r.y-p);aa+=v;ab+=x*v;bb+=x*x*v;}
  const det=Math.max(1e-9,aa*bb-ab*ab),da=clamp((ga*bb-gb*ab)/det,-1,1),db=clamp((gb*aa-ga*ab)/det,-1,1);a+=da;b+=db;if(Math.abs(da)+Math.abs(db)<1e-8)break;
 }
 const bins=Array.from({length:10},()=>({n:0,p:0,y:0}));for(const r of rows){const bin=bins[Math.min(9,Math.floor(r.p*10))];bin.n++;bin.p+=r.p;bin.y+=r.y;}
 const ece=bins.reduce((z,x)=>z+Math.abs(x.y-x.p),0)/Math.max(1,n),residuals:Record<string,number>={};
 for(const feature of ['hours','hint']){const center=mean(rows.map(r=>r[feature as 'hours'|'hint'])),num=rows.reduce((z,r)=>z+(r.y-r.p)*(r[feature as 'hours'|'hint']-center),0),den=Math.sqrt(rows.reduce((z,r)=>z+r.p*(1-r.p)*(r[feature as 'hours'|'hint']-center)**2,0));residuals[feature]=den>0?num/den:0;}
 for(const kind of [...new Set(rows.map(x=>x.kind))]){const rs=rows.filter(x=>x.kind===kind),den=Math.sqrt(rs.reduce((z,x)=>z+x.p*(1-x.p),0));residuals['kind:'+kind]=den?rs.reduce((z,x)=>z+x.y-x.p,0)/den:0;}
 const pit=rows.map(r=>{const u=seeded(hash(r.id+':'+r.at))();return r.y?1-r.p+u*r.p:u*(1-r.p);}).sort((a,b)=>a-b);
 const ks=pit.reduce((z,p,i)=>Math.max(z,Math.abs(p-i/n),Math.abs((i+1)/n-p)),0),pitP=clamp(2*Math.exp(-2*n*ks*ks));
 const tests:Health['tests']={D1:n>=50?loss<baseline:null,D2:n>=50?(mean(rows.map(r=>r.p))>.85?ece<=.03:Math.abs(a)<=.2&&b>=.8&&b<=1.2):null,D3:n>=50?Object.values(residuals).every(z=>Math.abs(z)<=3):null,D4:n>=50?pitP>=.01:null,D5:null};
 const actions:string[]=[];if(tests.D1===false)actions.push('model below baseline; serve '+(pfa<baseline?'PFA':'base rate'));if(tests.D2===false)actions.push('recalibrating');for(const [k,z] of Object.entries(residuals))if(n>=50&&Math.abs(z)>3)actions.push('residual feature: '+k);if(tests.D4===false)actions.push('prediction distribution mismatch');
 return {stream,n,status:n<50?'insufficient data':actions.length?'action':'ok',loss,baseline,pfa,a,b,ece,pitP,residuals,tests,actions};
}
export function serve(p:number,pfa:number,base:number,h:Health,features:Record<string,number>={}):number{
 let q=h.tests.D1===false?(h.pfa<h.baseline?pfa:base):p;
 if(h.tests.D2===false)q=sigmoid(h.a+h.b*logit(q));
 if(h.tests.D3===false)for(const [name,z] of Object.entries(h.residuals))if(Math.abs(z)>3&&Number.isFinite(features[name]))q=sigmoid(logit(q)+clamp(z/Math.sqrt(h.n),-.5,.5)*features[name]);
 return clamp(q,1e-9,1-1e-9);
}
export function nightlyFit(facts:AtlasFacts):{fit:Fit;health:Health[];inputHash:string}{
 const state=replay(facts),pfa=fitPfa(state.trace),health=['attempt','card'].map(s=>diagnose(state.trace,s));
 return {fit:{version:3,pfa,card_w:[...FSRS.DEFAULT_W]},health,inputHash:hash(JSON.stringify(facts)).toString(16)};
}
/** Expensive card fitting is isolated from the interactive replay and stays on defaults below 1,000 reviews. */
export async function fitCardWeights(facts:AtlasFacts):Promise<number[]>{
 const reviews=(facts.reviews??[]).filter(x=>!x.voided_at);if(reviews.length<1000)return [...FSRS.DEFAULT_W];
 const groups=new Map<string,number[][]>();for(const r of reviews)(groups.get(r.card_id)??groups.set(r.card_id,[]).get(r.card_id)!).push([Date.parse(r.occurred_at),r.rating,0]);
 const ds=FSRS.buildDataset([...groups.values()].map(rs=>rs.sort((a,b)=>a[0]-b[0])) as Parameters<typeof FSRS.buildDataset>[0],FSRS.makeClock(0));
 const fitted=await FSRS.optimize(ds.seqs,{start:FSRS.DEFAULT_W,seed:172,epochs:5,gamma:1/(.3*.3)});return fitted.w;
}
