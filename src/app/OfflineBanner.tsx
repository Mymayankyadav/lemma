import {useEffect,useState} from 'react';
import {CloudOff} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
/** A connectivity state, never a claim that pending non-idempotent writes were synced. */
export default function OfflineBanner(){
 const queryClient=useQueryClient();
 const [offline,setOffline]=useState(typeof navigator!=='undefined'&&!navigator.onLine);
 useEffect(()=>{
  const update=()=>{
   setOffline(!navigator.onLine);
   if(navigator.onLine)void queryClient.invalidateQueries({refetchType:'active'});
  };
  window.addEventListener('offline',update);window.addEventListener('online',update);
  return()=>{window.removeEventListener('offline',update);window.removeEventListener('online',update)};
 },[queryClient]);
 if(!offline)return null;
 return <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 top-[calc(12px+env(safe-area-inset-top))] z-[70] mx-auto flex max-w-[480px] items-center justify-center gap-2 rounded-ctl border border-amber-line bg-obsidian px-4 py-3 text-[13px] text-amber shadow-lg">
  <CloudOff size={17} aria-hidden="true"/>You're offline. Answers and approvals are not saved until connected.
 </div>;
}
