import {useEffect} from 'react';
import {useToast} from '../ui/Toast';
import {getMode} from '../data/mode';
import {offlineReadyNotice} from './pwa-notice';
/** Prompt to activate updates; never silently reload in the middle of a proof or review. */
export default function PwaStatus(){
 const notify=useToast();
 useEffect(()=>{
  // The Android app (N123) is served from the APK and updated through Play, so it has no service worker.
  if(!import.meta.env.PROD || import.meta.env.MODE==='android' || !('serviceWorker' in navigator))return;
  // FIX #657: PWA registration is not required to paint the first goal.
  // Keep its virtual module out of the cold Today/Atlas entry chunk, then
  // register immediately after mount. Cancellation avoids a stale registration
  // when StrictMode tears down an effect before the import resolves.
  let active=true;
  void import('virtual:pwa-register').then(({registerSW})=>{
   if(!active)return;
   const updateSW=registerSW({
    immediate:true,
    onNeedRefresh(){notify('A new version of Lemma is ready.',{action:{label:'Update',onClick:()=>{void updateSW(true)}}})},
    onOfflineReady(){
     const message=offlineReadyNotice(getMode());
     if(message)notify(message,{tone:'success'});
    },
    onRegisterError(){notify('Offline app setup failed. You can still use Lemma while online.',{tone:'danger'})},
   });
  }).catch(()=>{if(active)notify('Offline app setup failed. You can still use Lemma while online.',{tone:'danger'})});
  return ()=>{active=false};
 },[notify]);
 return null;
}
