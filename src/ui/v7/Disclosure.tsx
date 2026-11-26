import {useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {motionReduced} from './effects';
import {durations} from './motion';
import './disclosure.css';

export function Disclosure({label,children,defaultOpen=false,open:controlled,onOpen,mountWhenOpen=false}:{
 label:ReactNode;children:ReactNode;defaultOpen?:boolean;open?:boolean;onOpen?:(open:boolean)=>void;mountWhenOpen?:boolean;
}){
 const [uncontrolled,setOpen]=useState(defaultOpen),open=controlled??uncontrolled;
 const [retained,setRetained]=useState(open);
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  if(!open&&panel.current?.contains(document.activeElement))trigger.current?.focus();
  if(!mountWhenOpen)return;
  if(open){setRetained(true);return;}
  if(!retained)return;
  if(motionReduced()){setRetained(false);return;}
  const timer=window.setTimeout(()=>setRetained(false),durations.layout*1000);
  return()=>window.clearTimeout(timer);
 },[open,mountWhenOpen,retained]);
 return <div className="v7-disclosure">
  <button ref={trigger} type="button" className="v7-disclosure-trigger" aria-expanded={open} aria-controls={id}
   onClick={()=>{setOpen(!open);onOpen?.(!open);}}>
   <span>{label}</span><ChevronDown size={16} aria-hidden="true"/>
  </button>
  <div ref={panel} id={id} className="v7-expand-panel" data-open={open} inert={!open} aria-hidden={!open||undefined}>
   <div>{(open||retained||!mountWhenOpen)&&children}</div>
  </div>
 </div>;
}
