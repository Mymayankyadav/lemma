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

/** Reusable transition definitions for the eight v7 interaction moments. */
export function transitionPresets(reduced: boolean) {
 const fade={initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:durations.fast}};
 if(reduced) return {tab:fade,detail:fade,sheet:fade,focus:fade,grade:fade,completion:fade,drag:fade,numbers:fade};
 return {
  tab:routeMotion(false),
  detail:{initial:{opacity:0,scale:.98},animate:{opacity:1,scale:1},exit:{opacity:0,scale:.98},transition:{duration:durations.base,ease:easings.out}},
  sheet:{initial:{opacity:0,y:'100%'},animate:{opacity:1,y:0},exit:{opacity:0,y:'100%'},transition:springs.gentle},
  focus:{initial:{opacity:0,scale:.96},animate:{opacity:1,scale:1},transition:{duration:durations.slow,ease:easings.out}},
  grade:{initial:{opacity:0,y:8},animate:{opacity:1,y:0},exit:{opacity:0,x:100},transition:{duration:durations.base,ease:easings.standard}},
  completion:{initial:{opacity:0,scale:.8},animate:{opacity:1,scale:1},transition:springs.lively},
  drag:{whileDrag:{scale:1.02},transition:springs.snappy},
  numbers:{initial:{opacity:0},animate:{opacity:1},transition:{duration:durations.slow}},
 };
}

/** Meter/figure interpolation skips counting for reduced-motion users. */
export function interpolateNumber(from:number,to:number,progress:number,reduced=false):number {
 if(reduced)return to;
 const amount=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0));
 return from+(to-from)*amount;
}
/** A downward swipe closes after 30% travel or a decisive downward flick. */
export function dismissSheet(distance:number,height:number,velocity:number):boolean {
 return height>0&&(distance/height>=.3||velocity>600);
}
