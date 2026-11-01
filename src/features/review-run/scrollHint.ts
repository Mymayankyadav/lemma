/** Defer the optional overflow hint until after the first usable review-card paint.
 * Reading scrollHeight forces layout on the cold route; the card, grading
 * controls and immediate onScroll measurement must not wait for this hint.
 */
export function scheduleScrollHintMeasure(measure:()=>void):()=>void{
 if(typeof globalThis.requestIdleCallback==='function'){
  const id=globalThis.requestIdleCallback(()=>measure(),{timeout:300});
  return ()=>globalThis.cancelIdleCallback?.(id);
 }
 const id=globalThis.setTimeout(measure,80);
 return ()=>globalThis.clearTimeout(id);
}
