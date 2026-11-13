import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {Check,ChevronDown} from 'lucide-react';

/**
 * N161: on a phone the Calendar's Day / Week / Month / Agenda choice lives in the header as one button that opens a short
 * menu, so the day itself gets the row the segmented control used to take. Wide screens keep the segmented control.
 */
export function ViewMenu({value,options,onChange}:{value:string;options:readonly string[];onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',outside);
  return ()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 const keys=(event:KeyboardEvent<HTMLDivElement>)=>{
  const items=[...(root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]')??[])];
  const at=items.indexOf(document.activeElement as HTMLElement);
  if(event.key==='Escape'){event.preventDefault();setOpen(false);button.current?.focus();}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }
  else if(event.key==='Home'){event.preventDefault();items[0]?.focus();}
  else if(event.key==='End'){event.preventDefault();items[items.length-1]?.focus();}
  else if(event.key==='Tab')setOpen(false);
 };
 return <div ref={root} className="v7-cal-viewmenu" onKeyDown={keys}>
  <button ref={button} type="button" className="v7-cal-viewmenu-button" aria-haspopup="menu" aria-expanded={open}
   aria-label={'Calendar view: '+value} onClick={()=>setOpen(state=>!state)}><span>{value}</span><ChevronDown aria-hidden="true"/></button>
  {open&&<div role="menu" aria-label="Calendar view" className="v7-cal-viewmenu-list">
   {options.map(option=><button key={option} type="button" role="menuitemradio" aria-checked={option===value}
    onClick={()=>{setOpen(false);button.current?.focus();if(option!==value)onChange(option);}}>
    <span>{option}</span>{option===value&&<Check aria-hidden="true"/>}</button>)}
  </div>}
 </div>;
}
