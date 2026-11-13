/** Browser motion reads the same tokens as CSS; fallbacks cover SSR and tests. */
function numberToken(name:string,fallback:number):number {
 if(typeof document==='undefined')return fallback;
 const raw=getComputedStyle(document.documentElement).getPropertyValue(name).trim();
 const value=parseFloat(raw);
 return Number.isFinite(value)?value:fallback;
}
function seconds(name:string,fallback:number):number {return numberToken(name,fallback*1000)/1000;}
function bezier(name:string,fallback:readonly [number,number,number,number]):[number,number,number,number] {
 if(typeof document==='undefined')return [...fallback];
 const raw=getComputedStyle(document.documentElement).getPropertyValue(name);
 const match=raw.match(/cubic-bezier\(([^)]+)\)/);
 const values=match?.[1].split(',').map(Number);
 return values?.length===4&&values.every(Number.isFinite)?values as [number,number,number,number]:[...fallback];
}
export const durations={
 get instant(){return seconds('--v7-instant',.09)},get fast(){return seconds('--v7-fast',.16)},
 get base(){return seconds('--v7-base',.24)},get slow(){return seconds('--v7-slow',.4)},get scenic(){return seconds('--v7-scenic',.7)},
};
export const easings={
 get standard(){return bezier('--v7-ease-standard',[.2,0,0,1])},
 get out(){return bezier('--v7-ease-out',[.16,1,.3,1])},get in(){return bezier('--v7-ease-in',[.4,0,1,1])},
};
export const springs={
 get snappy(){return {type:'spring' as const,stiffness:numberToken('--v7-snappy-stiffness',520),damping:numberToken('--v7-snappy-damping',38)}},
 get gentle(){return {type:'spring' as const,stiffness:numberToken('--v7-gentle-stiffness',260),damping:numberToken('--v7-gentle-damping',28)}},
 get lively(){return {type:'spring' as const,stiffness:numberToken('--v7-lively-stiffness',400),damping:numberToken('--v7-lively-damping',22)}},
};
/** Reduced motion uses opacity alone and never exceeds 160 ms. */
export function routeMotion(reduced: boolean) {
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: durations.fast } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: durations.fast, ease: easings.standard } };
}

/** Meter/figure interpolation skips counting for reduced-motion users (used by useAnimatedNumber). */
export function interpolateNumber(from:number,to:number,progress:number,reduced=false):number {
 if(reduced)return to;
 const amount=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0));
 return from+(to-from)*amount;
}
/** A downward swipe closes after 30% travel or a decisive downward flick (used by sheetDrag). */
export function dismissSheet(distance:number,height:number,velocity:number):boolean {
 return height>0&&(distance/height>=.3||velocity>600);
}

/**
 * A1 · Motion v1 tokens ("drawn with a compass"): lines stroke in, surfaces fade and rise a few points, nothing
 * bounces, one thing moves at a time. Durations in seconds for `motion`; motion.css has the same values for CSS.
 */
export const motionV1={
 instant:.09, quick:.16, base:.24, draw:.7,
 drawEase:[.65,0,.35,1] as [number,number,number,number],
 sheet:{type:'spring' as const,stiffness:380,damping:36},
 /** Stagger between list items, capped at six items. */
 stagger:.03, staggerCap:6,
 /** Largest translate, in CSS pixels. */
 rise:12,
};
/** Delay for the i-th entering item: 30 ms apart, never more than six steps. */
export function staggerDelay(index:number):number{
 return Math.max(0,Math.min(motionV1.staggerCap-1,Math.floor(Number.isFinite(index)?index:0)))*motionV1.stagger;
}
/**
 * A damped spring (mass 1) sampled as a CSS `linear()` easing, so CSS transitions move like `motion`'s springs.
 * Returns the time to settle within 0.1 % and the easing. Pure; motion.css carries the 380/36 result.
 */
export function springEasing(stiffness:number,damping:number,points=24):{ms:number;easing:string}{
 const w0=Math.sqrt(stiffness),zeta=damping/(2*w0);
 const at=(t:number)=>{
  if(zeta<1){const wd=w0*Math.sqrt(1-zeta*zeta);return 1-Math.exp(-zeta*w0*t)*(Math.cos(wd*t)+(zeta*w0/wd)*Math.sin(wd*t));}
  return 1-Math.exp(-w0*t)*(1+w0*t);
 };
 let end=0.01;
 while(end<3&&(Math.abs(1-at(end))>1e-3||Math.abs(1-at(end+0.05))>1e-3))end+=0.01;
 const stops=Array.from({length:points+1},(_,i)=>Number(at(end*i/points).toFixed(3)));
 stops[0]=0;stops[points]=1;
 return {ms:Math.round(end*1000),easing:'linear('+stops.join(', ')+')'};
}
