// Tiny seeded PRNG for property tests (no new dependency).
export function rng(seed:number){
  let a=seed>>>0;
  const next=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
  return {
    next,int:(lo:number,hi:number)=>lo+Math.floor(next()*(hi-lo+1)),
    pick:<T,>(xs:T[]):T=>xs[Math.floor(next()*xs.length)],
    bool:(p=0.5)=>next()<p,
    shuffle:<T,>(xs:T[]):T[]=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  };
}
export const SEEDS=Array.from({length:60},(_,i)=>1000+i*7919);
