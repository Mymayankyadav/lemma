import {useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {getStudyApi} from '../data/study';
import type {StudyEntryRecord} from '../data/study/contract';
import {useFocusContext} from '../features/focus/focusContext';
import {focusStatus} from '../lib/focus/status';

/** The shell owns the small, cross-route view of the server's active entry.
 * No second timer or browser-only focus record is created here. */
export default function FocusAccessory(){
 const pathname=useLocation().pathname,navigate=useNavigate(),api=getStudyApi();
 const [entry,setEntry]=useState<StudyEntryRecord|null>(null);
 const [now,setNow]=useState(()=>Date.now());
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true,request=0;
  // The last owner read wins. A slow visibility refresh must not overwrite a
  // newer pause/lease change received after another route or tab became active.
  const refresh=()=>{const current=++request;
   void api.activeStudyEntry().then(row=>{if(alive&&request===current){setEntry(row);setError('');}})
    .catch(()=>{if(alive&&request===current)setError('Focus status unavailable. Reopen Today to retry.');});};
  const visibleRefresh=()=>{if(document.visibilityState!=='hidden')refresh();};
  refresh();
  window.addEventListener('lemma:focus-changed',refresh);
  window.addEventListener('focus',visibleRefresh);
  window.addEventListener('online',visibleRefresh);
  document.addEventListener('visibilitychange',visibleRefresh);
  // The clock ticks each second; the owner read stays on its 30-second cadence.
  let ticks=0;
  const clock=window.setInterval(()=>{
   setNow(Date.now());
   if(++ticks%30===0&&document.visibilityState!=='hidden')refresh();
  },1_000);
  return()=>{
   alive=false;request++;window.clearInterval(clock);
   window.removeEventListener('lemma:focus-changed',refresh);
   window.removeEventListener('focus',visibleRefresh);
   window.removeEventListener('online',visibleRefresh);
   document.removeEventListener('visibilitychange',visibleRefresh);
  };
 },[api,pathname]);
 // Mockup dock: the linked path when there is one ("Topology"), otherwise the intention.
 const context=useFocusContext(entry);
 if(!entry||!['running','paused'].includes(entry.status))return null;
 const paused=entry.status==='paused';
 const remaining=entry.phaseEndsAt?Math.max(0,Date.parse(entry.phaseEndsAt)-now):null;
 const minutes=remaining===null?null:Math.ceil(remaining/60_000);
 const clock=remaining===null?null:formatClock(remaining);
 const state=focusStatus(entry.status,entry.phase);
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
 // N110 (mockup `cr-mobile-dock`): a flat strip directly above the bottom navigation.
 return <aside aria-label="Focus accessory" data-v6-focus-accessory="" id="cr-mobile-dock"
  className="cr cr-mobile-dock lemma-time-dock flex-wrap items-center">
  <button type="button" onClick={open} aria-label="Open focus" title={entry.intent+', '+state+', open timer details'}
   className="lemma-dock-context lemma-time-tap">
   <strong className="cr-label">{context.path??entry.intent}</strong>
   <small className="cr-meta">{state}{minutes===null?' · No deadline':''}</small>
   {clock&&<time aria-label={minutes+' min to phase deadline'}>{clock}</time>}
  </button>
  <button type="button" disabled={busy} onClick={()=>{void toggle();}} className="cr-button"
   data-timer-action={paused?'Resume':'Pause'}>
   {paused?'Resume':'Pause'}
  </button>
  {error&&<p role="alert" className="basis-full pb-1 text-caption text-ink">{error}</p>}
 </aside>;
}

function formatClock(ms:number){
 const total=Math.ceil(ms/1000),h=Math.floor(total/3600),m=Math.floor(total%3600/60),sec=total%60;
 const mm=String(m).padStart(2,'0'),ss=String(sec).padStart(2,'0');
 return h?h+':'+mm+':'+ss:mm+':'+ss;
}
