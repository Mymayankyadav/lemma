// Shared numerical primitives. No clock, random source, database or browser dependency.
export const clamp=(x:number,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));
export const sigmoid=(x:number)=>1/(1+Math.exp(-clamp(x,-40,40)));
export const logit=(p:number)=>Math.log(clamp(p,1e-9,1-1e-9)/(1-clamp(p,1e-9,1-1e-9)));
export const probit=(m:number,v:number)=>sigmoid(m/Math.sqrt(1+Math.PI*Math.max(0,v)/8));
export const logLoss=(p:number,y:number)=>-y*Math.log(clamp(p,1e-9,1-1e-9))-(1-y)*Math.log(clamp(1-p,1e-9,1-1e-9));
export const normalPdf=(x:number)=>Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
export function normalCdf(x:number):number{
 const z=Math.abs(x),t=1/(1+0.2316419*z);
 const tail=normalPdf(z)*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
 return x>=0?1-tail:tail;
}
export function hash(text:string):number{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
export function seeded(seed:number):()=>number{return ()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
export const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
export const DAY=86400000;
