import {useEffect,useRef,useState} from 'react';
import {getThoughtApi} from '../../data/parked-thoughts';
import {getStudyEventApi} from '../../data/study-events';

/** Every action is a separate owner-scoped write; neither action changes the timer. */
export default function FocusNotices({entryId,onExclude}:{entryId:string;onExclude?:(minutes:number,reason:string)=>Promise<void>}){
 const thoughts=getThoughtApi(),events=getStudyEventApi();
 const [count,setCount]=useState<number|null>(null);
 const [loadError,setLoadError]=useState('');
 const [dialogKind,setDialogKind]=useState<'park'|'drift'|null>(null);
 const [thought,setThought]=useState('');
 const [minutes,setMinutes]=useState('1');
 const [deduct,setDeduct]=useState(false),[deducted,setDeducted]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const opener=useRef<HTMLButtonElement|null>(null);
 const firstField=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{
  let alive=true;
  setCount(null);setLoadError('');
  void events.listEvents({entryId,kind:['notice'],limit:1}).then(page=>{
   if(alive)setCount(page.total);
  }).catch(cause=>{if(alive)setLoadError(cause instanceof Error?cause.message:'Unable to load notices');});
  return ()=>{alive=false};
 },[entryId,events]);
 useEffect(()=>{
  const node=dialog.current;
  if(!node)return;
  if(dialogKind&&!node.open){
   if(typeof node.showModal==='function')node.showModal();
   else node.setAttribute('open','');
   if(dialogKind==='park')firstField.current?.focus();
  }else if(!dialogKind&&node.open){
   if(typeof node.close==='function')node.close();
   else node.removeAttribute('open');
  }
 },[dialogKind]);
 function dismiss(){
  if(busy)return;
  setDialogKind(null);setError('');
  opener.current?.focus();
 }
 function open(kind:'park'|'drift',trigger:HTMLButtonElement){
  if(busy)return;
  opener.current=trigger;setError('');setDeduct(false);setDeducted(false);setDialogKind(kind);
 }
 async function save(){
  if(busy||!dialogKind)return;
  if(dialogKind==='park'&&!thought.trim()){
   setError('Write a thought before parking it.');return;
  }
  const duration=Number(minutes);
  if(dialogKind==='drift'&&(!/^\d+$/.test(minutes)||!Number.isSafeInteger(duration)||
      duration<1||duration>100000)){
   setError('Enter 1–100000 whole minutes.');return;
  }
  setBusy(true);setError('');
  try{
   if(dialogKind==='park'){
    await thoughts.createThought({text:thought.trim(),studyEntryId:entryId});
    setThought('');
   }else{
    // The server's exclusion receipt must never be applied twice on retry.
    if(deduct&&onExclude&&!deducted){
     await onExclude(duration,'Self-reported drift');setDeducted(true);
    }
    await events.recordEvent({entryId,kind:'drift',durationMinutes:duration});
    setMinutes('1');setDeduct(false);setDeducted(false);
   }
   setDialogKind(null);
   opener.current?.focus();
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save; try again.');}
  finally{setBusy(false);}
 }
 // N111 (mockup focus page "Noticed a distraction · Park a thought"): two quiet text actions.
 return <section aria-label="Focus thoughts and notices" className="mt-3 flex flex-col items-center gap-1">
  <div className="flex flex-wrap justify-center gap-x-6">
   <button type="button" onClick={e=>open('drift',e.currentTarget)}
    className="min-h-11 px-1 text-label text-ink-2 underline-offset-4 hover:underline">I drifted</button>
   <button type="button" onClick={e=>open('park',e.currentTarget)}
    className="min-h-11 px-1 text-label text-ink-2 underline-offset-4 hover:underline">Park a thought</button>
  </div>
  {loadError&&<p role="alert" className="text-label text-ink">{loadError}</p>}
  <p className="text-center text-caption text-ink-3">Notices: <output aria-label="Focus notice count" className="tabular-nums">{count===null?'…':count}</output> · {onExclude?'Drift is recorded. Exclusion is optional and explicit.':'Drift is recorded, not deducted from saved time.'}</p>
  <dialog ref={dialog} aria-label={dialogKind==='drift'?'Record a drift':'Park a thought'}
   aria-modal="true" onCancel={e=>{e.preventDefault();dismiss();}}
   onClose={()=>{setDialogKind(null);opener.current?.focus();}}
   className="fixed inset-0 z-50 m-auto w-[min(420px,calc(100vw-24px))] rounded-ctl border border-edge bg-[var(--paper)] p-5 text-ink shadow-xl backdrop:bg-black/65">
   <form noValidate onSubmit={e=>{e.preventDefault();void save();}}>
    <h2 className="text-title font-semibold">{dialogKind==='park'?'Park a thought':'I drifted'}</h2>
    {dialogKind==='park'?<label className="mt-3 block text-label">
     Thought
     <textarea ref={firstField} aria-label="Thought to park" required maxLength={4000} rows={3}
      value={thought} onChange={e=>setThought(e.target.value)}
      className="mt-1 block min-h-20 w-full rounded-ctl border border-edge bg-fill-1 p-3 text-body"/>
    </label>:<label className="mt-3 block text-label">
     Minutes of drift
     <input aria-label="Minutes of drift" type="number" min="1" max="100000" step="1" required
      value={minutes} disabled={busy||deducted} onChange={e=>setMinutes(e.target.value)}
      className="mt-1 block min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 text-body"/>
    </label>}
    {dialogKind==='drift'&&onExclude&&<label className="mt-3 flex min-h-11 items-center gap-2 text-label">
     <input type="checkbox" aria-label="Exclude drift minutes" checked={deduct}
      disabled={busy||deducted} onChange={e=>setDeduct(e.target.checked)}/>
     Exclude these minutes from logged focus (requires timer control)
    </label>}
    {deducted&&<p role="status" className="mt-2 text-label">Exclusion saved. Retry records the notice only.</p>}
    {error&&<p role="alert" className="mt-2 text-label">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
     <button type="submit" disabled={busy}
      className="min-h-11 rounded-ctl bg-amber px-4 text-label font-semibold text-amber-ink disabled:opacity-60">{busy?'Saving…':dialogKind==='park'?'Save thought':'Record drift'}</button>
     <button type="button" disabled={busy} onClick={dismiss}
      className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold">Cancel</button>
    </div>
   </form>
  </dialog>
 </section>;
}
