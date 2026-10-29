import {useEffect,useId,useRef} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {motion,AnimatePresence,useDragControls,useReducedMotion} from 'motion/react';
import {X} from 'lucide-react';
import {sheet,fade,variantFor} from './motion';
export interface SheetProps{open:boolean;onClose:()=>void;title?:string;children:ReactNode;dismissOnBackdrop?:boolean;draggable?:boolean}
export function Sheet({open,onClose,title,children,dismissOnBackdrop=true,draggable=true}:SheetProps){
 const labelId=useId(),reduce=!!useReducedMotion(),panel=useRef<HTMLDivElement>(null);
 const dragControls=useDragControls();
 const entered=useRef(false);
 useEffect(()=>{if(open)entered.current=false},[open]);
 useEffect(()=>{
  if(!open)return;
  const prior=document.activeElement as HTMLElement|null;
  const old=document.body.style.overflow;
  document.body.style.overflow='hidden';
  panel.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose()}if(e.key==='Tab'&&panel.current){
   const els=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'));
   if(!els.length){e.preventDefault();return}
   const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }};
  document.addEventListener('keydown',key);
  return ()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);prior?.focus()};
 },[open,onClose]);
 return createPortal(<AnimatePresence>
 {open&&<div className="fixed inset-0 z-40 flex items-end justify-center" role="presentation">
 <motion.div aria-hidden="true" initial="hidden" animate="visible" exit="exit" variants={variantFor(fade,reduce)} className="absolute inset-0 bg-obsidian/75 backdrop-blur-[3px]" onClick={()=>{if(dismissOnBackdrop&&entered.current)onClose()}}/>
 <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title?labelId:undefined} aria-label={title?undefined:'Details'} initial="hidden" animate="visible" exit="exit"
 variants={variantFor(sheet,reduce)} onAnimationComplete={()=>{if(open)entered.current=true}} drag={reduce||!draggable?false:'y'} dragControls={dragControls} dragListener={false} dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:0.5}} onDragEnd={(_,info)=>{if(info.offset.y>100||info.velocity.y>500)onClose()}}
 className="relative max-h-[90dvh] w-full max-w-[528px] overflow-y-auto rounded-t-sheet border border-edge bg-glass-strong px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 shadow-[var(--e-float)] backdrop-blur-[22px]">
 <div aria-hidden="true" onPointerDown={event=>{if(!reduce&&draggable)dragControls.start(event)}} className="mx-auto mb-5 h-3 w-16 cursor-grab touch-none rounded-full py-1 active:cursor-grabbing"><div className="mx-auto h-[5px] w-10 rounded-full bg-edge-3"/></div>
 <div className="mb-5 flex items-center justify-between gap-4">{title&&<h2 id={labelId} className="text-[24px] font-semibold">{title}</h2>}
 <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-11 items-center justify-center rounded-ctl text-ink-2 hover:bg-fill-1"><X size={22}/></button></div>{children}
 </motion.div></div>}
 </AnimatePresence>,document.body);
}
export default Sheet;
