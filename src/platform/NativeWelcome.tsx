/**
 * N123 · N0 the one-time "Welcome to the new app" sheet. The Android app used to be a web wrapper whose sign-in lived
 * in Chrome; the Capacitor app has its own storage, so learners sign in once more. Nothing on the server is lost.
 */
import {useState} from 'react';
import {Button,Sheet} from '../ui/v7/components';
import {readDevicePref,writeDevicePref} from './device';

export default function NativeWelcome(){
 const [open,setOpen]=useState(()=>!readDevicePref('welcomeSeen',false));
 const close=()=>{writeDevicePref('welcomeSeen',true);setOpen(false);};
 if(!open)return null;
 return <Sheet open onClose={close} eyebrow="Lemma for Android" title="Welcome to the new app"
  footer={<Button variant="primary" onClick={close}>Continue</Button>}>
  <p>Lemma is now a full Android app. If you used it before, sign in once more: your paths, cards and study time are all still there.</p>
  <ul className="v7-welcome-list">
   <li>Your focus timer stays on the lock screen and in Quick Settings, with Pause and Finish.</li>
   <li>Share a PDF or a link to Lemma to start a path or capture it.</li>
   <li>Study mode and calendar sync are in Settings › Planning, off until you turn them on.</li>
  </ul>
 </Sheet>;
}
