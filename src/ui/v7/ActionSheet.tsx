import {useId,useRef,useState,type ReactNode} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {IconButton} from './components';
import {ChoiceSurface} from './ChoiceSurface';
import {handoffLayer} from './layers';
import './action-sheet.css';

/** One action in an ActionSheet. `destructive` rows are drawn red with their icon, after a hairline, always last. */
export interface ActionItem{label:string;icon:ReactNode;onClick:()=>void;hint?:string;destructive?:boolean;disabled?:boolean}

/**
 * Row actions share a desktop popover or phone sheet. 56 pt rows, a 24 px icon in a 40 px tile, the label and an optional hint;
 * destructive rows come last after a hairline, in red with their icon. Every ⋯ (Tasks, Paths, Path, Card, Checkpoint,
 * Time log, Focus) opens this sheet; arrow keys move between rows.
 */
export function ActionSheet({open,onClose,title,label,items,note,anchor}:{open:boolean;onClose:()=>void;title:string;label?:string;items:ActionItem[];note?:ReactNode;anchor?:()=>HTMLElement|null}){
 const ordered=[...items.filter(item=>!item.destructive),...items.filter(item=>item.destructive)];
 const firstDanger=ordered.findIndex(item=>item.destructive),firstEnabled=ordered.findIndex(item=>!item.disabled),id=useId();
 return <ChoiceSurface open={open} onClose={onClose} title={title} anchor={anchor}>
  {note&&<p className="v7-action-note v7-meta">{note}</p>}
  <div className="v7-action-list" role="menu" aria-label={label??title}>
   {ordered.map((item,i)=><button key={item.label} type="button" role="menuitem" data-v7-autofocus={i===firstEnabled?'true':undefined} disabled={item.disabled} aria-label={item.label} aria-describedby={item.hint?id+'-'+i:undefined}
    className={'v7-action-row'+(item.destructive?' v7-action-danger':'')+(i===firstDanger&&i>0?' v7-action-rule':'')}
    onClick={()=>handoffLayer(()=>{onClose();item.onClick();})}>
    <span className="v7-action-icon" aria-hidden="true">{item.icon}</span>
    <span className="v7-action-text"><span className="v7-action-label">{item.label}</span>{item.hint&&<span className="v7-action-hint" id={id+'-'+i}>{item.hint}</span>}</span>
   </button>)}
  </div>
 </ChoiceSurface>;
}

/** The ⋯ icon button and its ActionSheet. */
export function MoreActions({label,title,items,note}:{label:string;title:string;items:ActionItem[];note?:ReactNode}){
 const [open,setOpen]=useState(false), trigger=useRef<HTMLElement|null>(null);
 return <>
  <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={event=>{trigger.current=event.currentTarget;setOpen(true);}}><MoreHorizontal aria-hidden="true"/></IconButton>
  {open&&<ActionSheet open onClose={()=>setOpen(false)} title={title} label={label} items={items} note={note} anchor={()=>trigger.current}/>}
 </>;
}
