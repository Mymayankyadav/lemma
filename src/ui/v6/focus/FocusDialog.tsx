import {useEffect,useRef} from 'react';
import {remainingFocusMinutes,type FocusState} from '../../../lib/focus/machine';

export interface FocusDialogProps {
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
}
/** Native modal semantics, Escape cancellation, and focus restoration to the opener. */
export default function FocusDialog(props:FocusDialogProps){
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
