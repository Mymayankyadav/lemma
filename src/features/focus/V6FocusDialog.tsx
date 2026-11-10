import {useEffect,useRef,type ReactNode} from 'react';
import type {StudyEntryRecord} from '../../data/study/contract';
import {cycleCaption,emptyFocusContext,type FocusContext} from './focusContext';
import {inProgressFocusMinutes,remainingFocusMinutes,type FocusState} from '../../lib/focus/machine';
import {focusStatus} from '../../lib/focus/status';
import {formatTime} from '../../lib/format';

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
 /** #1314: heading (path or activity) and linked checkpoint, resolved by the caller. */
 context?:FocusContext;
 /** #1315: "Noticed a distraction" and "Park a thought" (FocusNotices), shown on this page. */
 notices?:ReactNode;
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
 const context=props.context??emptyFocusContext;
 const mode=props.entry.mode??'open';
 const remaining=deadline?Math.max(0,Math.ceil((Date.parse(deadline)-Date.parse(now))/1000)):null;
 const elapsed=Math.max(0,Math.floor(inProgressFocusMinutes(state,now)*60));
 const seconds=remaining??elapsed;
 const clock=(seconds>=3600?Math.floor(seconds/3600)+':':'')+String(Math.floor(seconds%3600/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 const span=Math.max(1,session.focusMinutes>=1440?25:session.focusMinutes)*60;
 const progress=remaining!==null?Math.min(100,Math.max(0,100-remaining/span*100)):(elapsed%span)/span*100;
 const eyebrow=focusStatus(state.phase,phase);
 // N111 + #1314/#1315 (mockup `cr-focus-overlay`): heading = path or activity, subtitle = checkpoint,
 // the Pomodoro plan under the bar, the intention as a serif line, two quiet text actions.
 // Nested dialogs (drift, parked thought) live inside this one; React hands their close/cancel
 // events to this handler too, so only this dialog's own events dismiss the Focus page.
 return <dialog ref={dialog} id="cr-focus-overlay" aria-label="Focus" aria-modal="true"
  onCancel={event=>{if(event.target!==event.currentTarget)return;event.preventDefault();close();}}
  onClose={event=>{if(event.target===event.currentTarget)onDismiss();}}
  className="cr cr-focus-overlay text-ink">
  <div className="cr-focus-wrap">
   <div className="cr-focus-header">
    <span className="cr-focus-wordmark" id="focus-heading">LEMMA <span>/ FOCUS</span></span>
    <button type="button" ref={firstControl} onClick={close} aria-label="Close" className="cr-icon">×</button>
   </div>
   <div className="cr-focus-center">
    <p className="cr-focus-eyebrow" aria-live="polite"><i className="cr-focus-indicator" aria-hidden="true"/>{eyebrow}</p>
    <h2 className="cr-focus-subject break-words [overflow-wrap:anywhere]">{context.heading??'Your focus session'}</h2>
    {context.checkpoint&&<p className="cr-focus-checkpoint">{context.checkpoint}</p>}
    {state.phase!=='finishing'&&<>
     <time className="cr-focus-clock" aria-label={(remaining!==null?'Remaining ':'Elapsed ')+clock}>{clock}</time>
     <div className="cr-progress" role="progressbar" aria-label="Phase progress" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(progress)}><i style={{width:progress+'%'}}/></div>
     <p className="cr-focus-cycle">{cycleCaption(props.entry)}</p>
    </>}
    <p className="cr-focus-intent break-words [overflow-wrap:anywhere]">{session.intent}</p>
    {stillStudying&&<p role="alert" className="lemma-log-warning mb-4 text-left">
     This focus session is over three hours old. Check whether you are still studying; no time is saved automatically.
    </p>}
    {state.phase!=='finishing'&&<div className="cr-focus-buttons">
     {/* N121 C6: Finish & log is the one primary action; Pause and Resume are outlined. */}
     {state.phase==='running'&&<>
      <button type="button" disabled={busy} onClick={props.onPause} className="cr-button lemma-focus-secondary">Pause</button>
      <button type="button" disabled={busy} onClick={props.onBreak} className="cr-button lemma-focus-secondary">Take a break</button>
     </>}
     {(state.phase==='paused'||state.phase==='break')&&
      <button type="button" disabled={busy} onClick={props.onResume} className="cr-button lemma-focus-secondary">Resume</button>}
    </div>}
    {(state.phase==='paused'||state.phase==='running')&&<div className="cr-focus-bottom">
     <button type="button" disabled={busy} onClick={props.onFinish} className="notebook-primary lemma-focus-finish">Finish &amp; log</button>
    </div>}
    {state.phase!=='finishing'&&<div className="cr-focus-bottom">{props.notices}</div>}
    {state.phase==='finishing'&&<div className="lemma-quick-task mt-6 w-full max-w-[480px] text-left">
     <label>Minutes to save
      <input aria-label="Minutes to save" type="number" min="0" step="1" inputMode="numeric" required
       value={editedMinutes} onChange={event=>props.onMinutes(event.target.value)}/>
     </label>
     <label>What did you learn? · optional
      <textarea aria-label="What did you learn?" rows={3} maxLength={4000} value={note}
       onChange={event=>props.onNote(event.target.value)}
       className="min-h-20 w-full rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] p-3 text-body text-ink"/>
     </label>
     <div className="lemma-finish-actions flex flex-col gap-2">
      <button type="button" disabled={busy} onClick={props.onSave} className="notebook-primary">Save</button>
      <button type="button" disabled={busy} onClick={props.onDiscard} className="lemma-destructive-text">Discard</button>
     </div>
    </div>}
    {/* The timer lease (N72) and the server's phase deadline stay available, one tap away. */}
    {/* The timer lease (N72) and the phase deadline stay available, one tap away. */}
    <details className="lemma-focus-details lemma-disclosure mt-4 w-full max-w-[480px] text-left text-label text-ink-2">
     <summary className="flex min-h-11 items-center justify-center">Timer details</summary>
     <section aria-label="Timer phase and controls" className="flex flex-col gap-2 pt-2">
      <p>Mode: {mode} · {phaseLabel} · Cycle {props.entry.cycle??1}</p>
      <p>{deadline?'Phase ends at '+formatTime(deadline,{clock24h:true})+' · '+Math.ceil(remainingFocusMinutes(state,now))+' min left':
       'No set end for this phase · '+Math.ceil(remainingFocusMinutes(state,now))+' min left'}</p>
      <div className="flex flex-wrap justify-center gap-2">
       <button type="button" disabled={busy} onClick={props.onTakeLease} className="cr-button lemma-focus-secondary">
        Take control of timer
       </button>
       <button type="button" disabled={busy||!props.leaseOwned||state.phase==='finishing'} onClick={props.onNextPhase}
        className="cr-button lemma-focus-secondary">Skip to next phase</button>
      </div>
      {!props.leaseOwned&&<p>This timer is controlled in another tab or device. Take control here to change phases.</p>}
     </section>
    </details>
    {error&&<p role="alert" className="lemma-field-error mt-3">{error}</p>}
   </div>
   <p className="cr-focus-footnote">One step at a time · study time stays linked to your project</p>
  </div>
 </dialog>;
}
