/**
 * N123 · settings that describe this Android phone, shown only inside the app: notification permission and on-time
 * alarms (Reminders), Study mode and the device calendar (Planning). They are device-local, never synced, and every
 * one is opt-in and off by default (Owner decision D13).
 */
import {useCallback,useEffect,useState} from 'react';
import {Sheet} from '../../../ui/v7/components';
import {useToast} from '../../../ui/Toast';
import {Group,SwitchRow,ValueRow} from './SettingsLists';
import {lemmaNative,type DeviceCalendar,type PermissionWord} from '../../../platform/bridge';
import {readDevicePref,writeDevicePref} from '../../../platform/device';
import {requestNotificationPermission} from '../../../platform/permissions';

/** Re-read a native status now and whenever the learner comes back from system settings. */
function useStatus<T>(read:()=>Promise<T>):[T|null,()=>void]{
 const [value,setValue]=useState<T|null>(null);
 const refresh=useCallback(()=>{void read().then(setValue,()=>setValue(null));},[read]);
 useEffect(()=>{refresh();const onShow=()=>{if(document.visibilityState==='visible')refresh();};
  document.addEventListener('visibilitychange',onShow);return ()=>document.removeEventListener('visibilitychange',onShow);},[refresh]);
 return [value,refresh];
}
const permissionWord=(value:PermissionWord|undefined)=>value==='granted'?'Allowed':value==='denied'?'Off':'Not asked yet';

export function PhoneReminders(){
 const read=useCallback(async()=>(await lemmaNative()).notificationStatus(),[]);
 const [status,refresh]=useStatus(read);
 return <Group title="On this phone" note="Lemma reminds you from this phone about cards due at your study time and about planned study blocks. Tutor and digest messages stay in the Inbox. Each kind has its own channel in Android settings.">
  <ValueRow label="Notifications" value={status?permissionWord(status.permission):'…'} hint={status?.channelsBlocked.length?'Some kinds are off in Android settings':undefined}
   onOpen={()=>{void (async()=>{
    if(status?.permission==='prompt'){await requestNotificationPermission();refresh();return;}
    await (await lemmaNative()).openNotificationSettings({});
   })();}}/>
  <ValueRow label="On-time alarms" value={!status?'…':status.exactAlarms?'On':'Within a minute'} hint="Ends of pomodoros, breaks and blocks"
   onOpen={()=>{void lemmaNative().then(native=>native.openExactAlarmSettings());}}/>
 </Group>;
}

export function PhonePlanning(){
 const notify=useToast();
 const readMode=useCallback(async()=>(await lemmaNative()).studyModeStatus(),[]);
 const readCalendar=useCallback(async()=>(await lemmaNative()).calendarStatus(),[]);
 const [mode,refreshMode]=useStatus(readMode),[calendar]=useStatus(readCalendar);
 const [sync,setSync]=useState(()=>readDevicePref('calendarSync',false)),[busy,setBusy]=useState<string[]>(()=>readDevicePref<string[]>('busyCalendars',[]));
 const [picking,setPicking]=useState<DeviceCalendar[]|null>(null);
 async function studyMode(on:boolean){
  const native=await lemmaNative();
  if(on&&!mode?.access){notify('Allow Lemma under “Do Not Disturb access”, then come back and turn Study mode on.');await native.openStudyModeSettings();return;}
  await native.studyModeSetEnabled({enabled:on});writeDevicePref('studyMode',on);refreshMode();
 }
 async function calendarSync(on:boolean){
  const native=await lemmaNative();
  if(on){
   const permission=calendar?.permission==='granted'?'granted':(await native.calendarRequest()).permission;
   if(permission!=='granted'){notify('Lemma needs calendar access to show your blocks there. Nothing changed.',{tone:'danger'});return;}
   writeDevicePref('calendarSync',true);setSync(true);notify('Your study blocks will appear in a “Lemma” calendar.',{tone:'success'});
  }else{
   writeDevicePref('calendarSync',false);setSync(false);
   const {deleted}=await native.calendarRemoveAll().catch(()=>({deleted:0}));
   notify(deleted?'Removed '+deleted+' blocks from this phone’s calendar.':'Calendar sync is off.');
  }
 }
 async function pick(){
  const {calendars}=await (await lemmaNative()).calendarList();
  setPicking(calendars);
 }
 function toggleBusy(id:string,on:boolean){
  const next=on?[...new Set([...busy,id])]:busy.filter(item=>item!==id);
  setBusy(next);writeDevicePref('busyCalendars',next);
 }
 return <Group title="On this phone" note="Study mode turns on Do Not Disturb while you focus and off when you pause or finish. Calendar sync writes your Lemma blocks to a “Lemma” calendar here; busy times you choose are read on this phone only and never uploaded.">
  <SwitchRow label="Study mode during focus" checked={!!mode?.enabled&&!!mode.access} onChange={on=>{void studyMode(on);}}/>
  <SwitchRow label="Show study blocks in this phone’s calendar" checked={sync} onChange={on=>{void calendarSync(on);}}/>
  {sync&&<ValueRow label="Avoid busy times from" value={busy.length?busy.length+(busy.length===1?' calendar':' calendars'):'None'} onOpen={()=>{void pick();}}/>}
  {picking&&<Sheet open onClose={()=>setPicking(null)} eyebrow="Planning" title="Avoid busy times from">
   {picking.length?<ul className="v7-settings-card v7-set-list">{picking.map(item=><SwitchRow key={item.id} label={item.name+(item.account&&item.account!==item.name?' · '+item.account:'')}
    checked={busy.includes(item.id)} onChange={on=>toggleBusy(item.id,on)}/>)}</ul>:<p className="v7-meta">No other calendars on this phone.</p>}
  </Sheet>}
 </Group>;
}
