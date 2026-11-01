import {useSyncExternalStore} from 'react';

/** A restored stale snapshot is read-only even if navigator.onLine is true:
 * DNS/server failures do not reliably change the browser's online flag.
 * This is a UX guard, not a replacement for server authorization.
 */
export function canWriteOnline(online:boolean,offlineSavedAt:string|undefined):boolean {
 const saved=Number(offlineSavedAt)
 return online&&!(offlineSavedAt!==undefined&&Number.isFinite(saved)&&saved>0)
}
// All network-aware controls share one set of DOM listeners. This matters on
// stress fixtures with hundreds of buttons and the strict cold-render budget.
const subscribers=new Set<()=>void>();
const broadcast=()=>{for(const listener of subscribers)listener()};
function subscribe(listener:()=>void){
 if(subscribers.size===0){
  window.addEventListener('online',broadcast);
  window.addEventListener('offline',broadcast);
  window.addEventListener('lemma:offline-snapshot',broadcast);
 }
 subscribers.add(listener);
 return ()=>{
  subscribers.delete(listener);
  if(subscribers.size===0){
   window.removeEventListener('online',broadcast);
   window.removeEventListener('offline',broadcast);
   window.removeEventListener('lemma:offline-snapshot',broadcast);
  }
 };
}
function snapshot(){
 return typeof navigator==='undefined'||canWriteOnline(navigator.onLine,
  typeof document==='undefined'?undefined:document.documentElement.dataset.offlineSavedAt)
}
export function useOnlineStatus(){
 return useSyncExternalStore(subscribe,snapshot,()=>true);
}
