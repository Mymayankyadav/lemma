/** Effective focus spans. Exclusions belong to their entry, and overlapping exclusions count once. */
export function effectiveFocusSpans(entry:{intervals:readonly {kind?:string;start:string;end:string|null}[];excludedIntervals?:readonly {from:string;to:string}[]},now=Date.now()):[number,number][]{
 const cuts=(entry.excludedIntervals??[]).map(x=>[Date.parse(x.from),Date.parse(x.to)] as const)
  .filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0]);
 return entry.intervals.filter(i=>i.kind!=='break').flatMap(i=>{
  let spans:[number,number][]=[[Date.parse(i.start),i.end?Date.parse(i.end):now]];
  for(const [a,b] of cuts)spans=spans.flatMap(([s,e])=>b<=s||a>=e?[[s,e]]:[[s,Math.min(e,a)],[Math.max(s,b),e]].filter(([x,y])=>y>x) as [number,number][]);
  return spans.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a);
 });
}
export function focusedMilliseconds(entry:Parameters<typeof effectiveFocusSpans>[0],now=Date.now()):number{
 const spans=effectiveFocusSpans(entry,now).sort((a,b)=>a[0]-b[0]);
 let total=0,end=-Infinity;
 for(const [a,b] of spans){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
 return total;
}

/** Where to trim raw history to reach a requested effective focus duration, preserving exclusions. */
export function focusDurationAdjustment(entry:Parameters<typeof effectiveFocusSpans>[0],minutes:number,now=Date.now()):{cutoff:number|null;prependMs:number}{
 if(!Number.isFinite(minutes)||minutes<0)throw Error('Saved minutes must be non-negative');
 const wanted=Math.round(minutes*60000),spans=effectiveFocusSpans(entry,now).sort((a,b)=>a[0]-b[0]);
 const total=focusedMilliseconds(entry,now);
 if(wanted>=total)return {cutoff:null,prependMs:wanted-total};
 let left=wanted;
 for(const [start,end] of spans){if(left<=end-start)return {cutoff:start+left,prependMs:0};left-=end-start;}
 return {cutoff:null,prependMs:0};
}
