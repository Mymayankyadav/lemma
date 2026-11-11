import {useState,type ReactNode} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {IconButton,Sheet} from './components';

export interface RowMenuItem{label:string;icon:ReactNode;onClick:()=>void}
/** The per-row ⋯: a 44 px icon button that opens the row's actions in a sheet (Tasks, Paths, Cards). */
export function RowMenu({label,title,items}:{label:string;title:string;items:RowMenuItem[]}){
 const [open,setOpen]=useState(false);
 return <>
  <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(true)}><MoreHorizontal aria-hidden="true"/></IconButton>
  {open&&<Sheet open onClose={()=>setOpen(false)} title={title}>
   <div className="v7-menu-content" role="menu" aria-label={label}>
    {items.map(item=><button key={item.label} type="button" role="menuitem" className={/delete|remove/i.test(item.label)?'v7-menu-danger':undefined}
     onClick={()=>{setOpen(false);item.onClick();}}>{item.icon}{item.label}</button>)}
   </div>
  </Sheet>}
 </>;
}
