import {useRef,useState,type MouseEvent} from 'react';
import type {CalendarBlockRecord} from '../../../data/study/contract';
import BlockSheet from './BlockSheet';

const action = 'min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber';

/** Isolated N27 controls; N26 owns the surrounding Agenda/Day/Week/Month switcher and ranges. */
export default function BlockSheetActions({blocks,date,zone,ready,onRefresh}:{
 blocks:CalendarBlockRecord[];date:string;zone:string;ready:boolean;onRefresh:()=>void;
}) {
 const [selected,setSelected]=useState<CalendarBlockRecord|null|undefined>(undefined);
 const trigger=useRef<HTMLButtonElement|null>(null);
 const createOpener=useRef<HTMLButtonElement|null>(null);
 const open=(event:MouseEvent<HTMLButtonElement>,block:CalendarBlockRecord|null)=>{
  trigger.current=event.currentTarget;
  setSelected(block);
 };
 const close=()=>{
  setSelected(undefined);
  // A deleted block removes its Edit opener; fall back to the persistent Add opener.
  queueMicrotask(()=> (trigger.current?.isConnected ? trigger.current : createOpener.current)?.focus());
 };
 return <section aria-label="Calendar block sheet actions" className="flex flex-col gap-3">
  <div className="flex flex-wrap gap-2">
   <button ref={createOpener} type="button" className={action} disabled={!ready} onClick={event=>open(event,null)}>Plan block in sheet</button>
  </div>
  {blocks.some(block=>block.status!=='cancelled')&&<div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto"
    aria-label="Editable calendar blocks">
    {blocks.filter(block=>block.status!=='cancelled').map(block=>
     <button key={block.id} type="button" className={action+' min-w-0 max-w-full text-left'} disabled={!ready}
       aria-label={'Edit block '+block.title} onClick={event=>open(event,block)}>
       Edit {block.title}
     </button>)}
  </div>}
  {selected!==undefined&&<BlockSheet key={selected?.id??'new'} block={selected}
   date={date} zone={zone} onRefresh={onRefresh} onClose={close}/>}
 </section>;
}
