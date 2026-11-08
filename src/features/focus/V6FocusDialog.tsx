import {useEffect,useRef} from 'react';
import type {StudyEntryRecord} from '../../../data/study/contract';
import {remainingFocusMinutes,type FocusState} from '../../../lib/focus/machine';

export interface V6FocusDialogProps {
 open:boolean;
 state:FocusState;
 now:string;
 note:string;
 editedMinutes:string;
 busy:boolean;
 error:string;
 onDismiss:()=>void;
 onNote:(value:string)=>void;
 onMinutes:(value:string)=>void;
 onPause:()=>void;
 onResume:()=>void;
 onBreak:()=>void;
 onFinish:()=>void;
 onSave:()=>void;
 onDiscard:()=>void;
 entry:StudyEntryRecord;
 leaseOwned:boolean;
 onTakeLease:()=>void;
 onNextPhase:()=>void;
}
/** Native modal semantics, Escape cancellation, and focus restoration to the opener. */
export default function V6FocusDialog(props:V6FocusDialogProps){
 const dialog=useRef<HTMLDialogElement>(null);
 const firstControl=useRef<HTMLButtonElement>(null);
 const {open,state,now,note,editedMinutes,busy,error,onDismiss}=props;
 useEffect(()=>{
  const node=dialog.current;
  if(!node)return;
  if(open&&!node.open){
   if(typeof node.showModal==='function')node.showModal();
   else node.setAttribute('open','');
   firstControl.current?.focus();
  }else if(!open&&node.open){
   if(typeof node.close==='function')node.close();
   else node.removeAttribute('open');
  }
 },[open]);
 function close(){
  const node=dialog.current;
  if(node?.open){
   if(typeof node.close==='function')node.close();
   else node.removeAttribute('open');
  }
  onDismiss();
 }
  const deadline=props.entry.phaseEndsAt;
  const stillStudying=props.entry.intervals.some(i=>i.end===null)&&
   Date.now()-Date.parse(props.entry.createdAt)>3*60*60*1000;
  const phase=props.entry.phase??'focus';
  const phaseLabel=phase==='long_break'?'Long break':phase==='break'?'Break':'Focus';
 const session=state.session;
 if(!session)return <dialog ref={dialog} aria-label="Focus session"/>;
 return <dialog ref={dialog} aria-labelledby="focus-heading" aria-modal="true"
  onCancel={event=>{event.preventDefault();close();}} onClose={onDismiss}
  className="fixed inset-0 z-50 m-auto max-h-[calc(100dvh-24px)] w-[min(440px,calc(100vw-24px))] overflow-y-auto rounded-[24px] border border-edge bg-[var(--paper)] p-5 text-ink shadow-2xl backdrop:bg-black/65">
  <div className="flex items-center justify-between gap-4">
   <h2 id="focus-heading" className="text-title font-semibold">Focus</h2>
   <button type="button" ref={firstControl} onClick={close}
    className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold">Close</button>
  </div>
  <p className="mt-2 text-body font-semibold">{session.intent}</p>
  <p aria-live="polite" className="mt-2 text-label text-ink-2">
   {state.phase==='finishing'?'Ready to save':
    Math.ceil(remainingFocusMinutes(state,now))+' min remaining'}
  </p>
  <section aria-label="Timer phase and controls" className="mt-4 rounded-ctl border border-edge bg-fill-1 p-3 text-label">
   <p className="font-semibold">Mode: {props.entry.mode??'open'} · {phaseLabel} · Cycle {props.entry.cycle??1}</p>
   <p className="mt-1 text-ink-2">{deadline?
    'Server phase deadline: '+new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(deadline))+
    ' ('+Math.max(0,Math.ceil((Date.parse(deadline)-Date.parse(now))/60000))+' min left)':
    'No scheduled phase deadline'}</p>
   {stillStudying&&<p role="alert" className="mt-2 font-semibold">
    This focus session is over three hours old. Check whether you are still studying; no time is saved automatically.
   </p>}
   <div className="mt-3 flex flex-wrap gap-2">
    <button type="button" disabled={busy} onClick={props.onTakeLease}
     className="min-h-11 rounded-ctl border border-edge px-3 font-semibold">
     {props.leaseOwned?'Retake control':'Take control of timer'}
    </button>
    <button type="button" disabled={busy||!props.leaseOwned||state.phase==='finishing'} onClick={props.onNextPhase}
     className="min-h-11 rounded-ctl bg-amber px-3 font-semibold text-amber-ink">Next phase</button>
   </div>
   {!props.leaseOwned&&<p className="mt-2 text-ink-2">Take control explicitly in this tab before changing phases.</p>}
  </section>
  {state.phase!=='finishing'&&<div className="mt-4 flex flex-wrap gap-2">
   {state.phase==='running'&&<>
    <button type="button" disabled={busy} onClick={props.onPause}
     className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold">Pause</button>
    <button type="button" disabled={busy} onClick={props.onBreak}
     className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold">Take a break</button>
   </>}
   {(state.phase==='paused'||state.phase==='break')&&
    <button type="button" disabled={busy} onClick={props.onResume}
     className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold">Resume</button>}
   {(state.phase==='paused'||state.phase==='running')&&
    <button type="button" disabled={busy} onClick={props.onFinish}
     className="min-h-11 rounded-ctl bg-amber px-4 text-label font-semibold text-amber-ink">Finish</button>}
  </div>}
  <label className="mt-4 block text-label font-semibold">
   Park a thought
   <textarea aria-label="Park a thought" rows={3} maxLength={4000} value={note}
    onChange={event=>props.onNote(event.target.value)}
    placeholder="Add a reflection to this focus entry"
    className="mt-1 block min-h-20 w-full rounded-ctl border border-edge bg-fill-1 p-3 text-body text-ink"/>
  </label>
  {state.phase==='finishing'&&<>
   <label className="mt-4 block text-label font-semibold">
    Minutes to save
    <input aria-label="Minutes to save" type="number" min="0" step="0.1" required
     value={editedMinutes} onChange={event=>props.onMinutes(event.target.value)}
     className="mt-1 block min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 text-body text-ink"/>
   </label>
   <div className="mt-4 flex flex-wrap gap-2">
    <button type="button" disabled={busy} onClick={props.onSave}
     className="min-h-11 rounded-ctl bg-amber px-4 text-label font-semibold text-amber-ink">Save</button>
    <button type="button" disabled={busy} onClick={props.onDiscard}
     className="min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold">Discard</button>
   </div>
  </>}
  {error&&<p role="alert" className="mt-3 text-label text-ink">{error}</p>}
 </dialog>;
}
