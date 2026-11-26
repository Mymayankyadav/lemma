/** Motion duration values are seconds in JavaScript. Fallbacks mirror motion.css for SSR and tests. */
function readToken(name: string): string {
  return typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function numberToken(name: string, fallback: number): number {
  const value = parseFloat(readToken(name));
  return Number.isFinite(value) ? value : fallback;
}
function duration(name: string, fallbackMs: number): number {
  const raw = readToken('--motion-' + name);
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value / (raw.endsWith('ms') ? 1000 : 1) : fallbackMs / 1000;
}
function bezier(name: string, fallback: [number, number, number, number]): [number, number, number, number] {
  const values = readToken('--ease-' + name).match(/cubic-bezier\(([^)]+)\)/)?.[1].split(',').map(Number);
  return values?.length === 4 && values.every(Number.isFinite) ? values as typeof fallback : fallback;
}

export const durations = {
  get instant() {return duration('instant', 90);},
  get quick() {return duration('quick', 160);},
  get quickExit() {return duration('quick-exit', 120);},
  get fast() {return this.quickExit;},
  get base() {return duration('base', 240);},
  get baseExit() {return duration('base-exit', 160);},
  get layout() {return duration('layout', 200);},
  get slow() {return duration('slow', 320);},
  get sheet() {return duration('sheet', 350);},
  get draw() {return duration('draw', 700);},
  get scenic() {return duration('scenic', 900);},
  get cameraMin() {return duration('camera-min', 240);},
  get cameraMax() {return duration('camera-max', 600);},
  get stagger() {return duration('stagger', 30);},
  get skeletonDelay() {return duration('skeleton-delay', 300);},
  get reduced() {return duration('reduced', 120);},
  get progressDelay() {return duration('progress-delay', 120);},
  get dismissMax() {return duration('dismiss-max', 220);},
};
export const easings = {
  get standard() {return bezier('standard', [.2, 0, 0, 1]);},
  get enter() {return bezier('enter', [0, 0, 0, 1]);},
  get exit() {return bezier('exit', [.3, 0, 1, 1]);},
  get draw() {return bezier('draw', [.65, 0, .35, 1]);},
  get out() {return this.enter;},
  get in() {return this.exit;},
};
export const distances = {
  get rise() {return numberToken('--rise', 12);},
  get riseSmall() {return numberToken('--rise-small', 6);},
  get nudge() {return numberToken('--nudge', 4);},
  get swapShift() {return numberToken('--swap-shift', 16);},
};

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
export const motionV1 = {
  get instant() {return durations.instant;},
  get quick() {return durations.quick;},
  get base() {return durations.base;},
  get draw() {return durations.draw;},
  get drawEase() {return easings.draw;},
  sheet: {type:'spring' as const, stiffness:380, damping:36},
  get stagger() {return durations.stagger;},
  staggerCap: 6,
  get rise() {return distances.rise;},
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
