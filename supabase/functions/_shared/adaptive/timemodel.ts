// N177. Duration Kalman filter and dynamic attendance ADF. All dates and observations are supplied.
import {clamp,sigmoid,normalCdf,mean} from './math.ts';
export type DurationState={m:number[];cov:number[][];noise:number;n:number;innovation:number};
export type DurationInput={estimate:number;actual?:number;kind?:number;difficulty?:number};
export type Moments={mean:number;variance:number;p10:number;p90:number};
export function durationPrior():DurationState{return {m:[.7,0,.2,0],cov:[[.16,0,0,0],[0,.0625,0,0],[0,0,.04,0],[0,0,0,.04]],noise:.16,n:0,innovation:.8};}
const dx=(x:DurationInput)=>[1,x.kind??0,x.difficulty??0,Math.log(Math.max(1,x.estimate)/60)];
export function predictDuration(s:DurationState,input:DurationInput):Moments{
 const x=dx(input),mu=Math.log(Math.max(1,input.estimate))+x.reduce((a,v,i)=>a+v*s.m[i],0),v=s.noise+x.reduce((a,v,i)=>a+v*s.cov[i].reduce((b,c,j)=>b+c*x[j],0),0),m=Math.exp(clamp(mu+v/2,-20,20));
 return {mean:m,variance:(Math.exp(Math.min(v,20))-1)*m*m,p10:Math.exp(clamp(mu-1.2815515655*Math.sqrt(v),-20,20)),p90:Math.exp(clamp(mu+1.2815515655*Math.sqrt(v),-20,20))};
}
export function updateDuration(s:DurationState,input:DurationInput,drift=.03):DurationState{
 if(!(input.estimate>0&&Number.isFinite(input.estimate)&&input.actual!>0&&Number.isFinite(input.actual)))return structuredClone(s);
 const out=structuredClone(s);out.cov[0][0]+=drift*drift;
 const x=dx(input),px=out.cov.map(row=>row.reduce((a,c,i)=>a+c*x[i],0)),pv=x.reduce((a,v,i)=>a+v*px[i],0),v=pv+out.noise,y=Math.log(input.actual!/input.estimate),error=y-x.reduce((a,v,i)=>a+v*out.m[i],0);
 for(let i=0;i<4;i++){out.m[i]+=px[i]*error/v;for(let j=0;j<4;j++)out.cov[i][j]-=px[i]*px[j]/v;}
 out.innovation+=Math.max(.01,error*error-pv);out.n++;out.noise=clamp(out.innovation/(out.n+5),.01,4);return out;
}
export type AttendanceState={m:number[];v:number[];n:number;lastDay:number|null};
export type Block={weekday:number;slot:number;minutes:number;keptYesterday?:boolean;day?:number};
export function attendancePrior():AttendanceState{return {m:[1,...Array(11).fill(0),.5,-.5],v:[.49,...Array(7).fill(.16),...Array(4).fill(.36),.25,.04],n:0,lastDay:null};}
export function attendanceFeatures(b:Block):number[]{const x=Array(14).fill(0);x[0]=1;x[1+clamp(Math.floor(b.weekday),0,6)]=1;x[8+clamp(Math.floor(b.slot),0,3)]=1;x[12]=b.keptYesterday?1:0;x[13]=Math.log(Math.max(1,b.minutes)/60);return x;}
export function attendanceProbability(s:AttendanceState,b:Block):number{const x=attendanceFeatures(b),m=x.reduce((a,v,i)=>a+v*s.m[i],0),V=x.reduce((a,v,i)=>a+v*v*s.v[i],0);return sigmoid(m/Math.sqrt(1+Math.PI*V/8));}
export function updateAttendance(s:AttendanceState,b:Block,kept:boolean):AttendanceState{
 const out=structuredClone(s);if(b.day!=null&&out.lastDay!=null)out.v[0]=Math.min(.49,out.v[0]+.02*Math.max(0,b.day-out.lastDay));
 const x=attendanceFeatures(b),p=attendanceProbability(out,b),V=x.reduce((a,v,i)=>a+v*v*out.v[i],0),den=1+V*p*(1-p);
 for(let i=0;i<x.length;i++){const v=out.v[i];out.m[i]+=v*x[i]*((kept?1:0)-p)/den;out.v[i]=Math.max(1e-8,v-v*v*x[i]*x[i]*p*(1-p)/den);}
 out.n++;out.lastDay=b.day??out.lastDay;return out;
}
export function supplyMoments(s:AttendanceState,blocks:Block[]):{mean:number;variance:number}{
 let m=0,v=0;for(const b of blocks){const p=attendanceProbability(s,b),conditional=b.minutes*Math.exp(-.1+.25*.25/2),cv=(Math.exp(.25*.25)-1)*conditional*conditional;m+=p*conditional;v+=p*cv+p*(1-p)*conditional*conditional;}return {mean:m,variance:v};
}
export function testOutDuration(d:Moments,p:number):Moments{p=clamp(p);const m=p*15+(1-p)*d.mean;return {mean:m,variance:(1-p)*d.variance+p*(15-m)**2+(1-p)*(d.mean-m)**2,p10:Math.min(15,d.p10),p90:d.p90};}
export function feasibility(required:Moments[],core:Moments[],supply:{mean:number;variance:number}){
 const total=(xs:Moments[])=>({mean:xs.reduce((a,x)=>a+x.mean,0),variance:xs.reduce((a,x)=>a+x.variance,0)}),r=total(required),c=total(core),prob=(x:typeof r)=>{const v=supply.variance+x.variance;return v>0?normalCdf((supply.mean-x.mean)/Math.sqrt(v)):supply.mean>=x.mean?1:0;};
 return {pAll:prob(r),pCore:prob(c),required:r.mean,coreRequired:c.mean,supply:supply.mean,requiredVariance:r.variance,supplyVariance:supply.variance};
}
export function durationHealth(rows:{actual:number;estimate:Moments}[]){const n=rows.length,coverage=mean(rows.map(x=>x.actual>=x.estimate.p10&&x.actual<=x.estimate.p90?1:0));return {stream:'duration',n,status:n<50?'insufficient data':coverage>=.75&&coverage<=.85?'ok':'action',coverage,tests:{D5:n<50?null:coverage>=.75&&coverage<=.85},widenBy:n>=50&&coverage<.75?.8/Math.max(.01,coverage):1};}
