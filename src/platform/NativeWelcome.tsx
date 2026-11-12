/**
 * N123 · N0 the one-time welcome sheet of the Android app. The app has its own storage, so people who used the earlier
 * web wrapper sign in once more; nothing on the server is lost.
 *
 * AW5 (v7 UX audit r3): three short rows with their glyphs (the list had no markers and read as one block); the note for
 * people who used Lemma before is a secondary line, not the opening; the sheet opens with focus on its text, so no
 * button shows a focus ring by itself; and it says that Lemma asks about notifications after the first focus session,
 * so the system prompt is not a surprise.
 */
import {useState} from 'react';
import {CalendarClock,Share2,Timer} from 'lucide-react';
import {Button,Sheet} from '../ui/v7/components';
import {readDevicePref,writeDevicePref} from './device';
import './native-welcome.css';

export const WELCOME_ROWS=[
 {icon:Timer,title:'Focus on the lock screen',line:'Pause, break or finish from the notification or Quick Settings.'},
 {icon:Share2,title:'Share to Lemma',line:'Share a PDF to start a path, or a link to capture it.'},
 {icon:CalendarClock,title:'Study mode and calendar',line:'In Settings › Planning, off until you turn them on.'},
] as const;

export default function NativeWelcome(){
 const [open,setOpen]=useState(()=>!readDevicePref('welcomeSeen',false));
 const close=()=>{writeDevicePref('welcomeSeen',true);setOpen(false);};
 if(!open)return null;
 return <Sheet open onClose={close} eyebrow="Lemma for Android" title="Welcome"
  footer={<Button variant="primary" onClick={close}>Continue</Button>}>
  <div className="v7-native-welcome">
   <p tabIndex={-1} data-v7-autofocus="true" className="v7-native-welcome-lead">What the app adds:</p>
   <ul className="v7-native-welcome-list">{WELCOME_ROWS.map(({icon:Icon,title,line})=><li key={title}>
    <span className="v7-native-welcome-icon" aria-hidden="true"><Icon/></span><span><strong>{title}</strong><small>{line}</small></span></li>)}</ul>
   <p className="v7-meta">Lemma asks about notifications after your first focus session.</p>
   <p className="v7-meta">If you used Lemma before, sign in once more: your paths, cards and study time are all still there.</p>
  </div>
 </Sheet>;
}
