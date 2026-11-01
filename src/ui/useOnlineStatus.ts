import {useSyncExternalStore} from 'react';

/** Browser connectivity signal for read-only offline controls.
 * This is a UX guard, not a replacement for server authorization.
 */
function subscribe(listener:()=>void){
 window.addEventListener('online',listener);
 window.addEventListener('offline',listener);
 return ()=>{
  window.removeEventListener('online',listener);
  window.removeEventListener('offline',listener);
 };
}
function snapshot(){return typeof navigator==='undefined'||navigator.onLine}
export function useOnlineStatus(){
 return useSyncExternalStore(subscribe,snapshot,()=>true);
}
