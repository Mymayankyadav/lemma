import {useId,useLayoutEffect,useRef,useState,type ComponentPropsWithRef,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {useSurfaceBeta} from '../../app/surfaceBeta';
import {useMotionReduced} from './effects';
import {durations} from './motion';
import './disclosure.css';

/** Keep the exiting pixels until the grid collapses. The controls stop accepting input immediately. */
export function ExpandPanel({open,children,mountWhenOpen=false,...props}:ComponentPropsWithRef<'div'>&{
 open:boolean;mountWhenOpen?:boolean;
}){
 const [retained,setRetained]=useState(open);
 const beta=useSurfaceBeta(),reduced=useMotionReduced();
 const animate=beta&&!reduced;
 useLayoutEffect(()=>{
  if(!mountWhenOpen)return;
  if(open){setRetained(true);return;}
  if(!retained)return;
  if(!animate){setRetained(false);return;}
  const timer=window.setTimeout(()=>setRetained(false),durations.layout*1000);
  return()=>window.clearTimeout(timer);
 },[open,mountWhenOpen,retained,animate]);
 return <div {...props} className="v7-expand-panel" data-open={open} inert={!open} aria-hidden={!open||undefined}>
  <div>{(open||retained||!mountWhenOpen)&&children}</div>
 </div>;
}

export function Disclosure({label,children,defaultOpen=false,open:controlled,onOpen,mountWhenOpen=false}:{
 label:ReactNode;children:ReactNode;defaultOpen?:boolean;open?:boolean;onOpen?:(open:boolean)=>void;mountWhenOpen?:boolean;
}){
 const [uncontrolled,setOpen]=useState(defaultOpen),open=controlled??uncontrolled;
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const keyboardOpening=useRef(false);
 const contentHadFocus=useRef(false);
 function toggle(fromKeyboard:boolean){
  keyboardOpening.current=!open&&fromKeyboard;
  contentHadFocus.current=open&&!!panel.current?.contains(document.activeElement);
  setOpen(!open);
  onOpen?.(!open);
 }
 useLayoutEffect(()=>{
  if(open&&keyboardOpening.current){
   keyboardOpening.current=false;
   const controls=panel.current?.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]');
   Array.from(controls??[]).find(el=>el.tabIndex>=0&&!el.matches(':disabled')&&!el.closest('[hidden],[inert]')&&el.getClientRects().length)?.focus({preventScroll:true});
  }
  if(!open&&(contentHadFocus.current||panel.current?.contains(document.activeElement))){
   contentHadFocus.current=false;
   trigger.current?.focus({preventScroll:true});
  }
 },[open]);
 return <div className="v7-disclosure">
  <button ref={trigger} type="button" className="v7-disclosure-trigger" aria-expanded={open} aria-controls={id}
   onClick={event=>toggle(event.detail===0)}>
   <span>{label}</span><ChevronDown size={16} aria-hidden="true"/>
  </button>
  <ExpandPanel ref={panel} id={id} open={open} mountWhenOpen={mountWhenOpen}
   onKeyDown={event=>{
    if(event.key!=='Escape'||event.defaultPrevented||!open)return;
    event.preventDefault();event.stopPropagation();toggle(false);
   }}>{children}</ExpandPanel>
 </div>;
}
