// Calibration (spec Phase 6): is the predicted success p what actually happens? Pure.
export type Pair={p:number;y:0|1|0.5;n?:number};
/** Brier score: mean squared error of p against the outcome (0 best, .25 = always guessing .5). */
export function brier(pairs:Pair[]):number|null{
  if(!pairs.length)return null;
  return pairs.reduce((a,x)=>a+(x.p-x.y)**2,0)/pairs.length;
}
export type Bucket={lo:number;hi:number;n:number;meanP:number;observed:number};
export function buckets(pairs:Pair[],edges=[0,0.5,0.7,0.8,0.9,1.0001]):Bucket[]{
  const out:Bucket[]=[];
  for(let i=0;i<edges.length-1;i++){
    const g=pairs.filter(x=>x.p>=edges[i]&&x.p<edges[i+1]);
    if(g.length)out.push({lo:edges[i],hi:Math.min(1,edges[i+1]),n:g.length,meanP:g.reduce((a,x)=>a+x.p,0)/g.length,observed:g.reduce((a,x)=>a+x.y,0)/g.length});
  }
  return out;
}
/** Items with b_n < 3 are uncalibrated and count for less in the statistics (weight b_n/3). */
export const itemWeight=(bN:number)=>Math.min(1,bN/3);
export function weightedBrier(pairs:(Pair&{bN:number})[]):number|null{
  const w=pairs.map(x=>itemWeight(x.bN));const tot=w.reduce((a,b)=>a+b,0);
  return tot>0?pairs.reduce((a,x,i)=>a+w[i]*(x.p-x.y)**2,0)/tot:null;
}
/** Weekly audit of scribe output by the large model: > 15% disagreement lowers the weight of scribe confidence (§12). */
export function scribeAudit(sample:{agree:boolean}[],min=10):{n:number;disagreement:number;raise:boolean;confidenceScale:number}{
  const n=sample.length;const d=n?sample.filter(x=>!x.agree).length/n:0;
  const raise=n>=min&&d>0.15;
  return {n,disagreement:d,raise,confidenceScale:raise?Math.max(0.3,1-d):1};
}
export const auditSampleSize=(total:number)=>total<=0?0:Math.min(total,Math.max(10,Math.ceil(total*0.05)));
export function weeklyReport(i:{pairs:Pair[];audit?:ReturnType<typeof scribeAudit>;uncalibratedItems:number}):string{
  const b=brier(i.pairs);
  return ['CALIBRATION (estimate from your own results)','predictions '+i.pairs.length+(b===null?'':', Brier '+b.toFixed(3)),
    ...buckets(i.pairs).map(x=>'p '+x.lo.toFixed(1)+'–'+x.hi.toFixed(1)+': predicted '+x.meanP.toFixed(2)+', happened '+x.observed.toFixed(2)+' (n '+x.n+')'),
    'items still uncalibrated: '+i.uncalibratedItems,
    ...(i.audit?['scribe audit: '+i.audit.n+' checked, '+(i.audit.disagreement*100).toFixed(0)+'% disagree'+(i.audit.raise?'; confidence weight lowered to '+i.audit.confidenceScale.toFixed(2):'')]:[])].join('\n');
}
