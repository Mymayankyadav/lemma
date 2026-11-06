import {useEffect, useRef, useState} from 'react';
import {getStudyApi} from '../../data/study';
import type {StudyEntryRecord, StudyRange} from '../../data/study/contract';
import {dayBounds, loggedMinutes} from '../../lib/effort';

/** Civil days use the device's IANA zone, not a UTC date substring. */
function today(now: Date): {range: StudyRange; zone: string} {
 const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
 const date = [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 return {range: dayBounds(date,zone),zone};
}

/** First v6 Today slice. N14.3.2 expands the native dialog into the full Focus workflow. */
export default function V6StudyHero(){
 const [active,setActive]=useState<StudyEntryRecord|null>(null);
 const [minutes,setMinutes]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  let mounted=true;
  const api=getStudyApi(), {range,zone}=today(new Date());
  void Promise.all([api.listStudyEntries(range),api.activeStudyEntry()]).then(([entries,ongoing])=>{
   if(!mounted)return;
   setActive(ongoing);
   // Only closed intervals contribute to saved effort; open timer intervals have null ends.
   const closed=entries.map(item=>({...item,intervals:item.intervals.filter(i=>i.end!==null).map(i=>({...i,end:i.end!}))}));
   setMinutes(loggedMinutes(closed,range,zone,new Date().toISOString()).minutes);
  }).catch(()=>{
   if(mounted)setError('Study time is unavailable. Try again.');
  });
  return ()=>{mounted=false};
 },[]);
 function showFocus(){
  const element=dialog.current;
  if(!element)return;
  if(typeof element.showModal==='function')element.showModal();
  else element.setAttribute('open',''); // jsdom and older dialog-less browsers
 }
 function closeFocus(){
  const element=dialog.current;
  if(!element)return;
  if(typeof element.close==='function')element.close();
  else {element.removeAttribute('open');trigger.current?.focus();}
 }
 async function openOrStart(){
  if(active){showFocus();return}
  setBusy(true);setError(null);
  try{
   const result=await getStudyApi().startStudyEntry({intent:'Focused study',source:'timer'});
   setActive(result.record);
   showFocus();
  }catch{
   setError('Focus could not start. Please try again.');
  }finally{setBusy(false)}
 }
 return <section aria-label="Focus today" className="flex flex-col gap-3 rounded-2xl border border-edge bg-fill-1 p-4">
  <div className="flex items-center justify-between gap-4">
   <div className="min-w-0">
    <p className="text-caption text-ink-2">Your next action</p>
    <h2 className="text-title-s font-semibold">{active?'Focus in progress':'Make time for a proof'}</h2>
    <p aria-live="polite" className="text-label text-ink-2">{minutes===null?'Loading logged time…':`Logged today: ${Math.round(minutes)} min`}</p>
   </div>
   <button ref={trigger} type="button" onClick={()=>{void openOrStart()}} disabled={busy}
    className="min-h-11 shrink-0 rounded-ctl bg-amber px-4 text-label font-semibold text-white disabled:opacity-50">
    {busy?'Starting…':active?'Return to focus':'Start focus'}
   </button>
  </div>
  {error&&<p role="alert" className="text-label text-ink-2">{error}</p>}
  <dialog ref={dialog} aria-label="Focus session" onClose={()=>trigger.current?.focus()}
   className="max-w-sm rounded-2xl border border-edge bg-fill-1 p-5 text-ink">
   <h2 className="text-title-s font-semibold">Focus session</h2>
   <p className="mt-2 text-body">{active?.intent || 'Ready to focus'}</p>
   <p className="mt-2 text-caption text-ink-2">Your study is active. Full focus controls follow in N14.3.2.</p>
   <button type="button" className="mt-4 min-h-11 rounded-ctl px-4 text-label" onClick={closeFocus}>Close</button>
  </dialog>
 </section>;
}
