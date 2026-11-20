import {useContext,useEffect,useState} from 'react';
import {isFlagOn} from '../flags';
import {getMode} from '../data/mode';
import {CloudOff} from 'lucide-react';
import {QueryClientContext} from '@tanstack/react-query';
import OfflinePadLink from '../features/pad/OfflinePadLink';
/** A connectivity state, never a claim that pending non-idempotent writes were synced. */
export default function OfflineBanner(){
 const queryClient=useContext(QueryClientContext);
 const [offline,setOffline]=useState(typeof navigator!=='undefined'&&!navigator.onLine);
 useEffect(()=>{
  const update=()=>{
   setOffline(!navigator.onLine);
   if(navigator.onLine)void queryClient?.invalidateQueries({refetchType:'active'});
  };
  window.addEventListener('offline',update);window.addEventListener('online',update);
  return()=>{window.removeEventListener('offline',update);window.removeEventListener('online',update)};
 },[queryClient]);
 if(!offline)return null;
 return <div role="status" aria-live="polite" className="v7-offline-notice mx-auto flex max-w-[656px] items-center justify-center gap-2 px-4 py-2">
  <CloudOff size={17} aria-hidden="true"/>Offline · Changes sync when connected.
  {isFlagOn('v7Shell')&&isFlagOn('padLocal')&&getMode()==='live'&&!window.location.hash.startsWith('#/pad')&&
   <OfflinePadLink/>}
 </div>;
}
