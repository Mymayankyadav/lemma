// 01 §9: the other two diagnostic streams (durations and attendance). The attempt and card streams are `diagnose` in fit.ts.
// Same Health shape, so MCP and the app render all four streams alike. Fewer than 50 events show `insufficient data`, never a pass.
import {clamp,mean,normalCdf} from './math.ts';
import {diagnose,type Health} from './fit.ts';
import type {Prediction} from './measure.ts';
import type {Moments} from './timemodel.ts';
const Z90=1.2815515655,MIN=50;
const empty=(stream:string,n:number):Health=>({stream,n,status:'insufficient data',loss:0,baseline:0,pfa:0,a:0,b:1,ece:0,pitP:1,residuals:{},tests:{D1:null,D2:null,D3:null,D4:null,D5:null},actions:[]});
const ks=(pit:number[])=>{const n=pit.length,sorted=pit.slice().sort((a,b)=>a-b),d=sorted.reduce((z,p,i)=>Math.max(z,Math.abs(p-i/n),Math.abs((i+1)/n-p)),0);return clamp(2*Math.exp(-2*n*d*d));};

/** Durations: the model's log-normal (from p10/p90) against a running log-mean baseline; PIT uniformity (D4); 80% interval coverage (D5). */
export function durationDiagnostics(rows:{actual:number;estimate:Moments}[]):Health{
 const n=rows.length,h=empty('duration',n);if(n<MIN)return h;
 const logs=rows.map(r=>Math.log(Math.max(1e-6,r.actual))),sd=(m:Moments)=>Math.max(1e-6,(Math.log(Math.max(1e-6,m.p90))-Math.log(Math.max(1e-6,m.p10)))/(2*Z90)),mu=(m:Moments)=>(Math.log(Math.max(1e-6,m.p10))+Math.log(Math.max(1e-6,m.p90)))/2;
 const nll=(x:number,m:number,s:number)=>.5*Math.log(2*Math.PI*s*s)+(x-m)**2/(2*s*s);
 let sum=0,sum2=0,base=0,model=0;const pit:number[]=[];
 rows.forEach((r,i)=>{const s=sd(r.estimate),m=mu(r.estimate);model+=nll(logs[i],m,s);pit.push(normalCdf((logs[i]-m)/s));
  const bm=i?sum/i:0,bv=i>1?Math.max(.05,sum2/i-bm*bm):1;base+=nll(logs[i],bm,Math.sqrt(bv));sum+=logs[i];sum2+=logs[i]*logs[i];});
 const loss=model/n,baseline=base/n,coverage=mean(rows.map(r=>r.actual>=r.estimate.p10&&r.actual<=r.estimate.p90?1:0)),pitP=ks(pit);
 const tests:Health['tests']={D1:loss<baseline,D2:null,D3:null,D4:pitP>=.01,D5:coverage>=.75&&coverage<=.85};
 const actions:string[]=[];if(tests.D1===false)actions.push('model below baseline; serve the running mean');if(tests.D4===false)actions.push('prediction distribution mismatch');
 if(tests.D5===false)actions.push('widen intervals by '+(.8/Math.max(.01,coverage)).toFixed(2));
 return {...h,status:actions.length?'action':'ok',loss,baseline,pfa:baseline,pitP,tests,actions,residuals:{coverage}};
}

/** Attendance: kept/missed blocks as a binary stream: a Bernoulli predictor against the running base rate; calibration (D2) and randomized PIT (D4). */
export function attendanceDiagnostics(rows:{p:number;y:number;at?:number}[]):Health{
 const n=rows.length;if(n<MIN)return empty('attendance',n);
 let kept=0;const trace:Prediction[]=rows.map((r,i)=>{const base=(1+kept)/(2+i);kept+=r.y;return {id:'att:'+i,at:r.at??i,stream:'attempt',p:r.p,kf:r.p,pfa:base,base,y:r.y,hours:0,hint:0,kind:'attendance',features:{},hypotheses:[]};});
 const d=diagnose(trace,'attempt');
 return {...d,stream:'attendance',n,residuals:{},tests:{...d.tests,D3:null,D5:null},actions:d.actions.filter(a=>!a.startsWith('residual'))};
}
export const allStreams=(attempt:Health,card:Health,duration:Health,attendance:Health)=>[attempt,card,duration,attendance];

/** 05 calibration chart: ten equal-width bins of predicted p against the observed rate, from the last 200 attempt predictions (D2 reads the same rows). Empty below 50. */
export type ReliabilityBin={lo:number;hi:number;n:number;predicted:number;observed:number};
export function reliabilityBins(rows:{p:number;y:number}[],bins=10):ReliabilityBin[]{
 const data=rows.slice(-200);if(data.length<MIN)return [];
 const out:ReliabilityBin[]=Array.from({length:bins},(_,i)=>({lo:i/bins,hi:(i+1)/bins,n:0,predicted:0,observed:0}));
 for(const r of data){const b=out[Math.min(bins-1,Math.floor(clamp(r.p)*bins))];b.n++;b.predicted+=r.p;b.observed+=r.y;}
 return out.filter(b=>b.n>0).map(b=>({...b,predicted:b.predicted/b.n,observed:b.observed/b.n}));
}
