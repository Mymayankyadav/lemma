/** Defer the optional overflow hint until after the first usable review-card paint.
 * Reading scrollHeight forces layout on the cold route; the card, grading
 * controls and immediate onScroll measurement must not wait for this hint.
 */
export function scheduleScrollHintMeasure(measure:()=>void):()=>void{
 let active=true;
 const run=()=>{if(active)measure()};
 if(typeof globalThis.requestIdleCallback==='function'){
  const id=globalThis.requestIdleCallback(run,{timeout:300});
  return ()=>{active=false;globalThis.cancelIdleCallback?.(id)};
 }
 const id=globalThis.setTimeout(run,80);
 return ()=>{active=false;globalThis.clearTimeout(id)};
}
