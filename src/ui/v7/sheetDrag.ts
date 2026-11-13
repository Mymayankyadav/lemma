import {dismissSheet} from './motion';
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

function settle(dialog:HTMLDialogElement){
 dialog.style.transition=motionReduced()?'':'transform var(--v7-m-quick, .16s) var(--v7-ease-standard, ease)';
 dialog.style.transform='';
 window.setTimeout(()=>{dialog.style.transition='';},200);
}

export function installSheetDrag(doc:Document=document):()=>void{
 let drag:Drag|null=null;
 const down=(event:PointerEvent)=>{
  if(drag||event.button!==0||event.isPrimary===false)return;
  const target=event.target instanceof Element?event.target:null;
  const handle=target?.closest(HANDLE),dialog=handle?.closest<HTMLDialogElement>('dialog.v7-sheet');
  if(!handle||!dialog?.open||target!.closest(INTERACTIVE))return;
  const box=dialog.getBoundingClientRect(),bottom=doc.defaultView?.innerHeight??0;
  if(box.height<=0||box.bottom<bottom-1)return;
  drag={dialog,id:event.pointerId,startY:event.clientY,height:box.height,distance:0,samples:[[event.clientY,event.timeStamp]],past:false};
  dialog.style.transition='none';
 };
 const move=(event:PointerEvent)=>{
  if(!drag||event.pointerId!==drag.id)return;
  drag.distance=Math.max(0,event.clientY-drag.startY);
  drag.dialog.style.transform=drag.distance?`translateY(${drag.distance}px)`:'';
  // AW6: a light tick when the pull passes the point where letting go closes the sheet (and again if it comes back).
  const past=dismissSheet(drag.distance,drag.height,0);
  if(past!==drag.past){drag.past=past;if(past)haptic('sheetThreshold');}
  drag.samples.push([event.clientY,event.timeStamp]);
  if(drag.samples.length>8)drag.samples.shift();
 };
 const up=(event:PointerEvent)=>{
  if(!drag||event.pointerId!==drag.id)return;
  const current=drag;drag=null;
  const distance=Math.max(0,event.clientY-current.startY),velocity=releaseVelocity(current.samples,event.clientY,event.timeStamp);
  if(distance>0&&dismissSheet(distance,current.height,velocity)){
   const dialog=current.dialog;
   // The sheet leaves from where it was let go; its styles are cleared once it has closed.
   dialog.addEventListener('close',()=>{dialog.style.transform='';dialog.style.transition='';},{once:true});
   dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
   window.setTimeout(()=>{if(dialog.open)settle(dialog);},300);
  }else if(distance>0)settle(current.dialog);
  else current.dialog.style.transition='';
 };
 const cancel=(event:PointerEvent)=>{
  if(!drag||event.pointerId!==drag.id)return;
  const current=drag;drag=null;settle(current.dialog);
 };
 doc.addEventListener('pointerdown',down);doc.addEventListener('pointermove',move);
 doc.addEventListener('pointerup',up);doc.addEventListener('pointercancel',cancel);
 return()=>{
  doc.removeEventListener('pointerdown',down);doc.removeEventListener('pointermove',move);
  doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',cancel);
 };
}
