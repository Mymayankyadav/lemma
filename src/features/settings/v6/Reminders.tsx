import {useEffect,useRef,useState} from 'react';
import {useUpdateSettings} from '../../../data/hooks';
import {mergeNotifyPrefs} from '../../../data/notify';
import type {NotifyPrefs} from '../../../data/types';
import {useToast} from '../../../ui/Toast';

const button='min-h-11 min-w-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold focus-visible:outline-2 focus-visible:outline-amber disabled:opacity-50';
const field='min-h-11 w-full rounded-ctl border border-edge bg-well px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-amber disabled:opacity-50';
const hour=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const kinds=[
 ['due','Cards due'],['deadline','Checkpoint deadlines'],['behind','Behind schedule'],
 ['resume','Resume a study session'],['tutor','Tutor proposals'],['digest','Weekly digest'],
 ['plan','Plans'],['rhythm','Study rhythm'],
] as const;
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] as const;

/** N28.2.2: keep all existing and future preference keys on every partial save. */
export default function Reminders({prefs,timeZone}:{prefs:NotifyPrefs|null|undefined;timeZone:string}) {
 const update=useUpdateSettings();
 const toast=useToast();
 const [value,setValue]=useState<NotifyPrefs>(()=>prefs??{});
 const [inFlight,setInFlight]=useState(false);
 const current=useRef<NotifyPrefs>(prefs??{});
 const saving=useRef(false);
 const [validation,setValidation]=useState('');
 useEffect(()=>{if(!saving.current){current.current=prefs??{};setValue(prefs??{})}},[prefs]);
 const busy=update.isPending||inFlight;
 async function save(patch:NotifyPrefs){
  if(saving.current)return false;
  const previous=current.current;
  const next=mergeNotifyPrefs(previous,patch);
  saving.current=true;setInFlight(true);setValidation('');
  current.current=next;setValue(next);
  try{
   await update.mutateAsync({notify:next});
   toast('Saved',{tone:'success'});
   return true;
  }catch{
   current.current=previous;setValue(previous);
   toast("Couldn't save settings.",{tone:'danger'});
   return false;
  }finally{saving.current=false;setInFlight(false)}
 }
 const mode=value.mode??'off';
 const hasPrefs=prefs!=null;
 function timeInput(label:string,id:string,valueAt:string,patch:(v:string)=>NotifyPrefs){
  return <label htmlFor={id} className="flex min-w-0 flex-col gap-2 text-label font-medium text-ink">
   {label}
   <input id={id} type="time" className={field} disabled={busy}
    defaultValue={valueAt} key={id+':'+valueAt}
    onBlur={event=>{
     const next=event.currentTarget.value;
     if(!hour.test(next)){setValidation('Choose a valid 24-hour time for '+label+'.');return}
     if(next!==valueAt)void save(patch(next));
    }}/>
  </label>;
 }
 return <section aria-labelledby="v6-reminders-title" className="flex flex-col gap-4 pb-8">
  <h2 id="v6-reminders-title" className="text-title-s font-semibold text-ink">Reminders</h2>
  <p className="text-label text-ink-2">Preferences for your study record ({timeZone||'your device time zone'}). Delivery also depends on an enabled device and the server schedule.</p>
  {!hasPrefs&&<p role="status" className="rounded-ctl bg-fill-1 p-3 text-label text-ink-2">
   No reminder preferences saved yet. Configure them below to start.
  </p>}
  {validation&&<p role="alert" className="text-label text-[var(--danger)]">{validation}</p>}
  <div className="rounded-slab border border-edge bg-[var(--paper)] p-4">
   <label className="flex min-h-11 items-center gap-3 text-body font-semibold text-ink">
    <input type="checkbox" aria-label="Enable reminders" className="size-5 accent-amber" disabled={busy}
     checked={value.enabled===true} onChange={event=>{void save({enabled:event.currentTarget.checked})}}/>
    Enable reminders
   </label>
   <label htmlFor="reminder-mode" className="mt-3 flex flex-col gap-2 text-label font-medium text-ink">
    Schedule
    <select id="reminder-mode" className={field} disabled={busy} value={mode}
     onChange={event=>{void save({mode:event.currentTarget.value as NotifyPrefs['mode']})}}>
     <option value="off">Off</option><option value="live">As events happen</option>
     <option value="daily">Daily summary</option><option value="weekly">Weekly digest</option>
    </select>
   </label>
   <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
    {timeInput('Preferred study time','reminder-study-time',value.studyTime??'09:00',studyTime=>({studyTime}))}
    <label htmlFor="reminder-max" className="flex flex-col gap-2 text-label font-medium text-ink">
     Maximum per day
     <input id="reminder-max" type="number" min={1} max={50} step={1} className={field}
      disabled={busy} defaultValue={value.maxPerDay??5} key={'max:'+(value.maxPerDay??5)}
      onBlur={event=>{
       const raw=event.currentTarget.value.trim(),count=Number(raw);
       if(!raw||!Number.isInteger(count)||count<1||count>50){setValidation('Maximum reminders per day must be 1–50.');return}
       if(count!==value.maxPerDay)void save({maxPerDay:count});
      }}/>
    </label>
   </div>
  </div>
  <section className="rounded-slab border border-edge bg-[var(--paper)] p-4" aria-label="Reminder categories">
   <h3 className="mb-2 text-body font-semibold text-ink">What to remind me about</h3>
   <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
    {kinds.map(([key,label])=><label key={key} className="flex min-h-11 items-center gap-3 text-label text-ink">
     <input type="checkbox" className="size-5 accent-amber" disabled={busy}
      checked={value.kinds?.[key]??false}
      onChange={event=>{void save({kinds:{[key]:event.currentTarget.checked}})}}/>
     {label}
    </label>)}
   </div>
   <label htmlFor="reminder-due" className="mt-3 flex flex-col gap-2 text-label text-ink">
    Cards-due threshold
    <select id="reminder-due" className={field} disabled={busy} value={value.dueThreshold??10}
     onChange={event=>{void save({dueThreshold:Number(event.currentTarget.value) as 1|10|25|50})}}>
     {[1,10,25,50].map(n=><option key={n} value={n}>{n} cards</option>)}
    </select>
   </label>
   <label className="mt-3 flex min-h-11 items-center gap-3 text-label text-ink">
    <input type="checkbox" className="size-5 accent-amber" disabled={busy}
     checked={value.approveCards===true}
     onChange={event=>{void save({approveCards:event.currentTarget.checked})}}/>
    Notify when tutor card proposals are ready
   </label>
  </section>
  <section className="rounded-slab border border-edge bg-[var(--paper)] p-4" aria-label="Quiet hours">
   <h3 className="mb-3 text-body font-semibold text-ink">Quiet hours</h3>
   <p className="mb-3 text-caption text-ink-2">No reminders during the quiet interval. Times are local to {timeZone||'your device'}.</p>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {timeInput('Quiet starts','reminder-quiet-start',value.quiet?.start??'22:00',start=>({quiet:{start,end:value.quiet?.end??'07:00'}}))}
    {timeInput('Quiet ends','reminder-quiet-end',value.quiet?.end??'07:00',end=>({quiet:{start:value.quiet?.start??'22:00',end}}))}
   </div>
  </section>
  <section className="rounded-slab border border-edge bg-[var(--paper)] p-4" aria-label="Weekly digest">
   <h3 className="mb-3 text-body font-semibold text-ink">Weekly digest</h3>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label htmlFor="reminder-weekday" className="flex flex-col gap-2 text-label text-ink">
     Weekday
     <select id="reminder-weekday" className={field} disabled={busy} value={value.digest?.weekday??0}
      onChange={event=>{void save({digest:{weekday:Number(event.currentTarget.value) as 0|1|2|3|4|5|6,time:value.digest?.time??'09:00'}})}}>
      {weekdays.map((day,n)=><option key={day} value={n}>{day}</option>)}
     </select>
    </label>
    {timeInput('Digest time','reminder-digest-time',value.digest?.time??'09:00',time=>({digest:{weekday:value.digest?.weekday??0,time}}))}
   </div>
  </section>
  <p className="text-caption text-ink-2">Changes save to your existing owner preferences. Reminders are not sent from this screen.</p>
 </section>;
}
