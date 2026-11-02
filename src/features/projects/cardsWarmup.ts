/** Speculative Cards module warmup is not on the critical Paths → Atlas route.
 * Delay it until the owner has settled on Paths. If they navigate away first,
 * cancel the unused import rather than competing for CPU/network with Atlas.
 * Direct Cards navigation still uses its normal lazy route immediately.
 */
export function scheduleCardsWarmup(warm:()=>void,delayMs=1200):()=>void{
 const handle=setTimeout(warm,delayMs);
 return ()=>clearTimeout(handle);
}
