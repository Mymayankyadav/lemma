import {useEffect,useState} from 'react';
import {CloudOff} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
/** Read-only offline mode: no writes are queued or silently claimed as saved. */
export default function OfflineBanner(){
 const queryClient=useQueryClient();
 const [offline,setOffline]=useState(typeof navigator!=='undefined'&&!navigator.onLine);
 const [savedAt,setSavedAt]=useState<number|null>(()=>{
  if(typeof document==='undefined')return null;
  const value=Number(document.documentElement.dataset.offlineSavedAt);
  return Number.isFinite(value)&&value>0?value:null;
 });
 useEffect(()=>{
  const update=()=>{
   setOffline(!navigator.onLine);
   if(navigator.onLine){setSavedAt(null);void queryClient.invalidateQueries({refetchType:'active'})}
  };
  const snapshot=(event:Event)=>{
   const detail=(event as CustomEvent<{savedAt:number|null}>).detail;
   setSavedAt(typeof detail?.savedAt==='number'&&Number.isFinite(detail.savedAt)?detail.savedAt:null);
  };
  window.addEventListener('offline',update);window.addEventListener('online',update);
  window.addEventListener('lemma:offline-snapshot',snapshot);
  return()=>{
   window.removeEventListener('offline',update);window.removeEventListener('online',update);
   window.removeEventListener('lemma:offline-snapshot',snapshot);
  };
 },[queryClient]);
 // navigator.onLine can stay true during a failed first fetch; a restored
 // snapshot still needs a visible stale-data warning.
 if(!offline&&savedAt===null)return null;
 const time=savedAt===null?null:new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(savedAt);
 return <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 top-[calc(12px+env(safe-area-inset-top))] z-[70] mx-auto flex max-w-[480px] items-center justify-center gap-2 rounded-ctl border border-amber-line bg-obsidian px-4 py-3 text-[13px] text-amber shadow-lg">
  <CloudOff size={17} aria-hidden="true"/>
  {time?`You're offline · showing Lemma as of ${time}. Answers and approvals need a connection.`:
   "You're offline. Answers and approvals need a connection."}
 </div>;
}
