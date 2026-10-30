import {useEffect} from 'react';
import {registerSW} from 'virtual:pwa-register';
import {useToast} from '../ui/Toast';
import {getMode} from '../data/mode';
/** Prompt to activate updates; never silently reload in the middle of a proof or review. */
export default function PwaStatus(){
 const notify=useToast();
 useEffect(()=>{
  if(!import.meta.env.PROD || !('serviceWorker' in navigator))return;
  const updateSW=registerSW({
   immediate:true,
   onNeedRefresh(){notify('A new version of Lemma is ready.',{action:{label:'Update',onClick:()=>{void updateSW(true)}}})},
   onOfflineReady(){
    // Demo is an in-memory sandbox: this persistence warning is irrelevant and can cover sheet actions.
    if(getMode()==='live')notify('Lemma is ready to open offline. Changes still require a connection to save.',{tone:'success'});
   },
   onRegisterError(){notify('Offline app setup failed. You can still use Lemma while online.',{tone:'danger'})},
  });
 },[notify]);
 return null;
}
