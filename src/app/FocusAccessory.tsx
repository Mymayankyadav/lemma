import {useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {getStudyApi} from '../data/study';
import type {StudyEntryRecord} from '../data/study/contract';

/** The shell owns the small, cross-route view of the server's active entry.
 * No second timer or browser-only focus record is created here. */
export default function FocusAccessory(){
 const pathname=useLocation().pathname,navigate=useNavigate(),api=getStudyApi();
 const [entry,setEntry]=useState<StudyEntryRecord|null>(null);
 const [now,setNow]=useState(()=>Date.now());
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  const refresh=()=>{void api.activeStudyEntry().then(row=>{if(alive)setEntry(row);})
   .catch(()=>{if(alive)setError('Focus status unavailable. Reopen Today to retry.');});};
  const visibleRefresh=()=>{if(document.visibilityState!=='hidden')refresh();};
  refresh();
  window.addEventListener('lemma:focus-changed',refresh);
  window.addEventListener('focus',visibleRefresh);
  window.addEventListener('online',visibleRefresh);
  document.addEventListener('visibilitychange',visibleRefresh);
  const clock=window.setInterval(()=>{
   setNow(Date.now());
   if(document.visibilityState!=='hidden')refresh();
  },30_000);
  return()=>{
   alive=false;window.clearInterval(clock);
   window.removeEventListener('lemma:focus-changed',refresh);
   window.removeEventListener('focus',visibleRefresh);
   window.removeEventListener('online',visibleRefresh);
   document.removeEventListener('visibilitychange',visibleRefresh);
  };
 },[api,pathname]);
 if(!entry||!['running','paused'].includes(entry.status))return null;
 const paused=entry.status==='paused';
 const minutes=entry.phaseEndsAt?Math.max(0,Math.ceil((Date.parse(entry.phaseEndsAt)-now)/60_000)):null;
 async function toggle(){
  if(!entry||busy)return;
  setBusy(true);setError('');
  try{
   const result=paused?await api.resumeStudyEntry(entry.id,entry.version):
    await api.pauseStudyEntry(entry.id,entry.version);
   setEntry(result.record);
   window.dispatchEvent(new Event('lemma:focus-changed'));
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Unable to change focus; reopen Today.');
   try{setEntry(await api.activeStudyEntry());}catch{/* keep visible error */}
  }finally{setBusy(false);}
 }
 function open(){
  window.dispatchEvent(new Event('lemma:open-focus'));
  navigate('/?focus=open');
 }
 return <aside aria-label="Focus accessory" data-v6-focus-accessory=""
  className="fixed inset-x-3 z-30 mx-auto flex max-w-[504px] flex-col rounded-ctl border border-edge bg-[var(--paper)] px-3 py-2 shadow-lg"
  style={{bottom:pathname==='/proposals'?
   'calc(var(--tab) + env(safe-area-inset-bottom) + 128px)':
   'calc(var(--tab) + env(safe-area-inset-bottom) + 8px)'}}>
  <div className="flex min-w-0 items-center gap-2">
   <div className="min-w-0 flex-1">
    <p className="truncate text-label font-semibold text-ink">{entry.intent}</p>
    <p className="text-caption text-ink-2">{entry.phase==='long_break'?'Long break':
      entry.phase==='break'?'Break':paused?'Paused':'Focus'} · {minutes===null?'No deadline':minutes+' min to phase deadline'}</p>
   </div>
   <button type="button" disabled={busy} onClick={()=>{void toggle();}}
    className="min-h-11 shrink-0 rounded-ctl border border-edge px-3 text-label font-semibold text-ink">
    {paused?'Resume':'Pause'}
   </button>
   <button type="button" onClick={open}
    className="min-h-11 shrink-0 rounded-ctl bg-amber px-3 text-label font-semibold text-amber-ink">Open focus</button>
  </div>
  {error&&<p role="alert" className="mt-1 text-caption text-ink">{error}</p>}
 </aside>;
}
