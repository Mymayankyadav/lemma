import {useEffect,useId,useRef} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {motion,AnimatePresence,useReducedMotion} from 'motion/react';
import {X} from 'lucide-react';
import {sheet,fade,variantFor} from './motion';
import {isFlagOn} from '../flags';
export interface SheetProps{open:boolean;onClose:()=>void;title?:ReactNode;children:ReactNode;footer?:ReactNode;route?:boolean}
export function Sheet({open,onClose,title,children,footer,route=false}:SheetProps){
 const labelId=useId(),reduce=!!useReducedMotion(),panel=useRef<HTMLDivElement>(null);
 // Keep the latest close handler without restarting the focus trap on every render.
 // Inline onClose callbacks are common; restarting this effect steals textarea focus.
 const onCloseRef=useRef(onClose);
 onCloseRef.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const prior=document.activeElement as HTMLElement|null;
  const old=document.body.style.overflow;
  document.body.style.overflow='hidden';
  panel.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onCloseRef.current()}if(e.key==='Tab'&&panel.current){
   const els=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'));
   if(!els.length){e.preventDefault();return}
   const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }};
  document.addEventListener('keydown',key);
  return ()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);prior?.focus()};
 },[open]);
 // N121: v6 has a fixed header, an independently scrolling body, and a reachable footer.
 // Keep the flag-off version below intact, including its swipe gesture.
 if(isFlagOn('v6Shell'))return createPortal(<AnimatePresence>
 {open&&<div data-sheet-overlay="" className="fixed inset-0 z-[100] flex items-end justify-center" role="presentation"
  style={route?{bottom:'var(--lemma-nav-height)'}:undefined}>
 <motion.div aria-hidden="true" initial="hidden" animate="visible" exit="exit"
  variants={variantFor(fade,reduce)} className="absolute inset-0 bg-obsidian/75 backdrop-blur-[3px]" onClick={onClose}/>
 <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true"
  data-sheet-route={route?'':undefined} aria-labelledby={title?labelId:undefined}
  aria-label={title?undefined:'Details'} initial="hidden" animate="visible" exit="exit"
  variants={variantFor(sheet,reduce)} className="ui-sheet relative w-full min-w-0">
  <div className="ui-sheet-header">
   {title&&<h2 id={labelId} className="ui-sheet-title">{title}</h2>}
   <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-ctl text-ink-2"><X size={22}/></button>
  </div>
  <div className="ui-sheet-body">{children}</div>
  {footer&&<div className="ui-sheet-footer">{footer}</div>}
 </motion.div></div>}
 </AnimatePresence>,document.body);
 return createPortal(<AnimatePresence>
 {open&&<div className="fixed inset-0 z-40 flex items-end justify-center" role="presentation">
 <motion.div aria-hidden="true" initial="hidden" animate="visible" exit="exit" variants={variantFor(fade,reduce)} className="absolute inset-0 bg-obsidian/75 backdrop-blur-[3px]" onClick={onClose}/>
 <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title?labelId:undefined} aria-label={title?undefined:'Details'} initial="hidden" animate="visible" exit="exit"
 variants={variantFor(sheet,reduce)} drag={reduce?false:'y'} dragConstraints={{top:0,bottom:0}} dragElastic={{top:0,bottom:0.5}} onDragEnd={(_,info)=>{if(info.offset.y>100||info.velocity.y>500)onClose()}}
 className="ui-sheet relative max-h-[90dvh] w-full max-w-[528px] overflow-y-auto rounded-t-sheet border border-edge bg-glass-strong px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 shadow-[var(--e-float)] backdrop-blur-[22px]">
 <div aria-hidden="true" className="mx-auto mb-5 h-[5px] w-10 rounded-full bg-edge-3"/>
 <div className="mb-5 flex items-center justify-between gap-4">{title&&<h2 id={labelId} className="ui-sheet-title text-title-s font-semibold">{title}</h2>}
 <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-11 items-center justify-center rounded-ctl text-ink-2 hover:bg-fill-1"><X size={22}/></button></div>{children}
 </motion.div></div>}
 </AnimatePresence>,document.body);
}
export default Sheet;
