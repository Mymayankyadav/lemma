import {useSyncExternalStore} from 'react';

/**
 * N151 · AN3 "Offline made visible": numbers on screen come from the saved copy, not the server, when the device is
 * offline, when a refresh is paused waiting for the network, or when the latest refresh failed and the older values
 * stay on screen. A source is a TanStack query result, or anything shaped like one (Today's day data).
 */
export interface CopySource {data:unknown;dataUpdatedAt:number;fetchStatus?:string;isError?:boolean}

/** The time of the oldest value on screen that comes from the saved copy, or null when every value is fresh. */
export function savedCopyAt(sources:readonly CopySource[],online:boolean):number|null{
 let at:number|null=null;
 for(const source of sources){
  if(source.data===undefined||source.data===null||!(source.dataUpdatedAt>0))continue;
  if(online&&source.fetchStatus!=='paused'&&!source.isError)continue;
  at=at===null?source.dataUpdatedAt:Math.min(at,source.dataUpdatedAt);
 }
 return at;
}

function subscribe(change:()=>void){
 window.addEventListener('online',change);window.addEventListener('offline',change);
 return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};
}
/** The browser's own online state, kept current by its online and offline events. */
export function useOnline():boolean{
 return useSyncExternalStore(subscribe,()=>typeof navigator==='undefined'||navigator.onLine!==false,()=>true);
}
/** savedCopyAt for the sources a screen shows, with the browser's online state. */
export function useSavedCopyAt(sources:readonly CopySource[]):number|null{
 return savedCopyAt(sources,useOnline());
}
