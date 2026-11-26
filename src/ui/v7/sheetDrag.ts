import {dismissSheet, durations} from './motion';
import {requestLayerClose, topLayerElement} from './layers';
import {motionReduced} from './effects';
import {haptic} from './haptics';
import './sheet-drag.css';

/**
 * V20 · drag a bottom sheet down to dismiss it. Pressing the grabber or the sheet's header (not its buttons) and pulling
 * down moves the sheet with the finger. Letting go after 30% of its height, or with a downward flick faster than
 * 600 px/s (`dismissSheet`), closes it through the dialog's own cancel path, the same as Escape. Otherwise it settles
 * back. A sheet shown as a centred dialog (wide screens) does not drag.
 *
 * One delegated listener serves every `dialog.v7-sheet`, so the Sheet component needs no change.
 */
const HANDLE='.v7-grabber, .v7-sheet-header';
const INTERACTIVE='button, a, input, select, textarea, label, [role="button"], [contenteditable]';
const SAMPLE_MS=100;

interface Drag {dialog:HTMLDialogElement;id:number;startY:number;height:number;distance:number;samples:[number,number][];past:boolean}

/** The downward speed in px/s over the last 100 ms of samples ending at (y, time). */
export function releaseVelocity(samples:readonly [number,number][],y:number,time:number):number{
 const recent=samples.filter(([,at])=>time-at<=SAMPLE_MS),first=recent[0]??samples.at(-1);
 if(!first)return 0;
 const elapsed=time-first[1];
 return elapsed>0?(y-first[0])/elapsed*1000:0;
}

function resetDrag(dialog:HTMLDialogElement){
 delete dialog.dataset.sheetPull;
 dialog.style.removeProperty('--v7-pull-scrim');
 dialog.style.removeProperty('--v7-release-distance');
 dialog.style.removeProperty('--v7-release-duration');
 dialog.style.removeProperty('transform');
 dialog.style.removeProperty('transition');
}

export function releaseDuration(remaining:number,velocity:number,minMs:number,maxMs:number){
 return Math.min(maxMs,Math.max(minMs,remaining/Math.max(1,velocity)*1000));
}

function draw(drag:Drag,y:number){
 drag.distance=Math.max(0,y-drag.startY);
 const dialog=drag.dialog;
 dialog.style.transform=drag.distance?`translateY(${drag.distance}px)`:'';
 if(dialog.hasAttribute('data-beta-sheet')){
  dialog.dataset.sheetPull='';
  dialog.style.setProperty('--v7-pull-scrim',String(Math.max(0,1-drag.distance/drag.height)));
 }
}

export function installSheetDrag(doc:Document=document):()=>void{
 let drag:Drag|null=null;
 const settling=new Map<HTMLDialogElement,number>();
 const pending=new Set<number>();
 function clear(dialog:HTMLDialogElement){
  window.clearTimeout(settling.get(dialog));settling.delete(dialog);
  resetDrag(dialog);
 }
 function settle(dialog:HTMLDialogElement){
  if(motionReduced()||!dialog.isConnected||!dialog.open){clear(dialog);return;}
  dialog.style.transition='transform var(--motion-base) var(--ease-standard)';
  dialog.style.transform='';
  dialog.removeAttribute('data-sheet-pull');
  window.clearTimeout(settling.get(dialog));
  settling.set(dialog,window.setTimeout(()=>clear(dialog),durations.base*1000));
 }
 const down=(event:PointerEvent)=>{
  if(drag||event.button!==0||event.isPrimary===false)return;
  const target=event.target instanceof Element?event.target:null;
  const handle=target?.closest(HANDLE),dialog=handle?.closest<HTMLDialogElement>('dialog.v7-sheet');
  if(!handle||!dialog?.open||target!.closest(INTERACTIVE))return;
  const top=topLayerElement(doc);
  if(top && top!==dialog)return;
  const box=dialog.getBoundingClientRect(),bottom=doc.defaultView?.innerHeight??0;
  if(box.height<=0||box.bottom<bottom-1)return;
  clear(dialog);
  drag={dialog,id:event.pointerId,startY:event.clientY,height:box.height,distance:0,samples:[[event.clientY,event.timeStamp]],past:false};
  dialog.style.transition='none';
 };
 const move=(event:PointerEvent)=>{
  if(!drag||event.pointerId!==drag.id)return;
  draw(drag,event.clientY);
  // AW6: a light tick when the pull passes the point where letting go closes the sheet (and again if it comes back).
  const past=dismissSheet(drag.distance,drag.height,0);
  if(past!==drag.past){drag.past=past;if(past)haptic('sheetThreshold');}
  drag.samples.push([event.clientY,event.timeStamp]);
  if(drag.samples.length>8)drag.samples.shift();
 };
 const up=(event:PointerEvent)=>{
  if(!drag||event.pointerId!==drag.id)return;
  const current=drag;drag=null;
  draw(current,event.clientY);
  const distance=current.distance,velocity=releaseVelocity(current.samples,event.clientY,event.timeStamp);
  if(distance>0&&dismissSheet(distance,current.height,velocity)){
   const dialog=current.dialog;
   if(dialog.hasAttribute('data-beta-sheet')){
    const remaining=Math.max(0,(doc.defaultView?.innerHeight??0)-dialog.getBoundingClientRect().top);
    dialog.style.setProperty('--v7-release-distance',remaining+'px');
    dialog.style.setProperty('--v7-release-duration',releaseDuration(remaining,velocity,durations.quickExit*1000,durations.dismissMax*1000)+'ms');
   }
   if(topLayerElement(doc) === dialog) requestLayerClose(dialog,'drag');
   else dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
   // A dirty guard keeps this dialog open. Restore it below the guard; a dismissed one has already yielded its pixels.
   const frame=requestAnimationFrame(()=>{pending.delete(frame);if(dialog.open)settle(dialog);else clear(dialog);});
   pending.add(frame);
  }else if(distance>0)settle(current.dialog);
  else clear(current.dialog);
 };
 const cancel=(event:PointerEvent)=>{
  if(!drag||event.pointerId!==drag.id)return;
  const current=drag;drag=null;settle(current.dialog);
 };
 const closed=(event:Event)=>{if(event.target instanceof HTMLDialogElement)clear(event.target);};
 doc.addEventListener('close',closed,true);
 doc.addEventListener('pointerdown',down);doc.addEventListener('pointermove',move);
 doc.addEventListener('pointerup',up);doc.addEventListener('pointercancel',cancel);
 return()=>{
  doc.removeEventListener('close',closed,true);
  doc.removeEventListener('pointerdown',down);doc.removeEventListener('pointermove',move);
  doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',cancel);
  if(drag)clear(drag.dialog);
  settling.forEach((_,dialog)=>clear(dialog));
  pending.forEach(frame=>cancelAnimationFrame(frame));
 };
}
