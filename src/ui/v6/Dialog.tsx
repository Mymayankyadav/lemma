import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

type Props={
 title:string;eyebrow?:string;children:ReactNode;footer?:ReactNode;
 onClose:()=>void;busy?:boolean;
};
let openDialogs=0;
/** Native browser top-layer modal, consistent below/above 700px.
 * The opener is restored by this primitive; forms can put their buttons
 * in the fixed footer with standard HTML `form` associations. */
export default function Dialog({title,eyebrow,children,footer,onClose,busy=false}:Props){
 const id=useId(),dialog=useRef<HTMLDialogElement>(null);
 const previous=useRef<HTMLElement|null>(null),dismiss=useRef(onClose);
 dismiss.current=onClose;
 useEffect(()=>{
  const node=dialog.current;
  if(!node)return;
  previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(typeof node.showModal==='function')node.showModal();
  else node.setAttribute('open','');
  openDialogs++;
  document.documentElement.classList.add('lemma-native-sheet-open');
  // The page behind a modal never scrolls (audit Cards 5).
  const bodyOverflow=document.body.style.overflow,rootOverflow=document.documentElement.style.overflow;
  document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
  return()=>{
   document.body.style.overflow=bodyOverflow;document.documentElement.style.overflow=rootOverflow;
   if(node.open){if(typeof node.close==='function')node.close();else node.removeAttribute('open')}
   openDialogs=Math.max(0,openDialogs-1);
   if(!openDialogs)document.documentElement.classList.remove('lemma-native-sheet-open');
   if(previous.current?.isConnected)previous.current.focus();
  };
 },[]);
 return <dialog ref={dialog} className="lemma-native-sheet" aria-labelledby={id}
  onCancel={event=>{event.preventDefault();if(!busy)dismiss.current();}}>
  <header className="ui-sheet-header">
   <div className="min-w-0 flex-1">{eyebrow&&<span className="text-caption uppercase tracking-wide text-ink-2">{eyebrow}</span>}
    <h2 id={id} className="ui-sheet-title">{title}</h2></div>
   <button type="button" aria-label="Close" disabled={busy} onClick={()=>dismiss.current()}
    className="flex size-11 shrink-0 items-center justify-center rounded-ctl text-ink-2"><X size={20}/></button>
  </header>
  <div className="ui-sheet-body">{children}</div>
  {footer&&<footer className="ui-sheet-footer">{footer}</footer>}
 </dialog>;
}
