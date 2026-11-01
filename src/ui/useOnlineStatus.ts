import {useSyncExternalStore} from 'react';

/** A restored stale snapshot is read-only even if navigator.onLine is true:
 * DNS/server failures do not reliably change the browser's online flag.
 * This is a UX guard, not a replacement for server authorization.
 */
export function canWriteOnline(online:boolean,offlineSavedAt:string|undefined):boolean {
 const saved=Number(offlineSavedAt)
 return online&&!(offlineSavedAt!==undefined&&Number.isFinite(saved)&&saved>0)
}
function subscribe(listener:()=>void){
 window.addEventListener('online',listener);
 window.addEventListener('offline',listener);
 window.addEventListener('lemma:offline-snapshot',listener);
 return ()=>{
  window.removeEventListener('online',listener);
  window.removeEventListener('offline',listener);
  window.removeEventListener('lemma:offline-snapshot',listener);
 };
}
function snapshot(){
 return typeof navigator==='undefined'||canWriteOnline(navigator.onLine,
  typeof document==='undefined'?undefined:document.documentElement.dataset.offlineSavedAt)
}
export function useOnlineStatus(){
 return useSyncExternalStore(subscribe,snapshot,()=>true);
}
