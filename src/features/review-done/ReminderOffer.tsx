import {useEffect,useRef,useState} from 'react';
import {getApi} from '../../data';
import {getMode} from '../../data/mode';
import {vapidPublicKey} from '../../data/env';
import {isTwa,pushSupport} from '../../lib/platform';
import {useSettings,useUpdateSettings} from '../../data/hooks';
import type {PushDevice} from '../../data/types';
import {Button} from '../../ui/Button';
import {useToast} from '../../ui/Toast';

function canOffer(){return pushSupport()==='yes'}

/** The VAPID public key is not a secret. Return an owned ArrayBuffer-backed view. */
function applicationServerKey(value:string):Uint8Array<ArrayBuffer>{
 const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
 const decoded=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='));
 const bytes=new Uint8Array(new ArrayBuffer(decoded.length));
 for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
 return bytes;
}
function devicePlatform():PushDevice['platform']{
 if(isTwa())return 'android_app';
 const agent=navigator.userAgent;
 return /Android/i.test(agent)?'android_web':/iPhone|iPad|iPod/i.test(agent)?'ios':'desktop';
}

/** The one-time post-round offer; never a permanent Review or Today banner. */
export function ReminderOffer({completed}:{completed:boolean}){
 const settings=useSettings();
 const update=useUpdateSettings();
 const toast=useToast();
 const counted=useRef(false);
 const [visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(counted.current||!completed||!settings.data||!canOffer())return;
  const prefs=settings.data.notify??{};
  const offered=Number(prefs.offered??0);
  if((prefs.enabled&&prefs.mode!=='off')||!Number.isFinite(offered)||offered>=2)return;
  // Count the display, not a click, and persist before showing it. This
  // prevents a dismissed offer from reappearing indefinitely after reload.
  counted.current=true;
  void update.mutateAsync({notify:{...prefs,offered:Math.max(0,Math.floor(offered))+1}})
   .then(()=>setVisible(true)).catch(()=>{setVisible(false)});
 },[completed,settings.data]);
 async function enable(){
  if(busy||!settings.data)return;
  setBusy(true);
  try{
   if(getMode()==='demo'){
    // Demo never registers a real device or contacts the push service.
    setVisible(false);
    toast('Demo: reminders preview only');
    return;
   }
   if(!vapidPublicKey)throw new Error('Reminders are not set up yet');
   const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
   if(permission!=='granted'){
    setVisible(false);
    toast('Reminders were not enabled');
    return;
   }
   const registration=await navigator.serviceWorker.ready;
   const subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:applicationServerKey(vapidPublicKey),
   });
   const serialized=subscription.toJSON();
   if(!serialized.endpoint||!serialized.keys?.p256dh||!serialized.keys.auth)
    throw new Error('Push subscription is incomplete');
   const platform=devicePlatform();
   const device=await getApi().addPushDevice({
    endpoint:serialized.endpoint,p256dh:serialized.keys.p256dh,auth:serialized.keys.auth,
    label:platform==='android_app'?'This phone · Lemma app':platform==='android_web'?'This phone · Chrome':platform==='ios'?'This phone · Safari':'This browser',
    platform,
   });
   await update.mutateAsync({notify:{...(settings.data.notify??{}),enabled:true,
    ...(settings.data.notify?.mode==='off'?{mode:'live' as const}:{})}});
   setVisible(false);
   toast('Reminders are on');
   try{await getApi().sendTestNotification(device.id)}
   catch{toast('Reminders are on, but the test could not be sent',{tone:'danger'})}
  }catch{
   toast("Couldn't turn on reminders. Try Settings.",{tone:'danger'});
  }finally{setBusy(false)}
 }
 if(!visible||!canOffer()||(settings.data?.notify?.enabled&&settings.data.notify.mode!=='off'))return null;
 return <section aria-label="Reminder offer" className="w-full border-t border-edge pt-3">
  <p className="text-body text-ink-2">Want a reminder when cards are due?</p>
  <div className="mt-2 flex flex-wrap items-center gap-2">
   <Button size="m" loading={busy} onClick={()=>void enable()}>Turn on</Button>
   <Button size="m" variant="text" disabled={busy} onClick={()=>setVisible(false)}>Not now</Button>
  </div>
 </section>;
}
