import {useEffect,useRef,useState,type MouseEvent} from 'react';
import {useSearchParams} from 'react-router';
import type {CalendarBlockRecord} from '../../../data/study/contract';
import BlockSheet from './BlockSheet';

const action = 'min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber';

/** Isolated N27 controls; N26 owns the surrounding Agenda/Day/Week/Month switcher and ranges. */
export default function BlockSheetActions({blocks,date,zone,ready,onRefresh,showLaunchers=true,onClosed}:{
 blocks:CalendarBlockRecord[];date:string;zone:string;ready:boolean;onRefresh:()=>void;
 showLaunchers?:boolean;
 /** N121: the Calendar page restores focus to whatever opened the dialog (grid, events list, menu). */
 onClosed?:()=>void;
}) {
 const [selected,setSelected]=useState<CalendarBlockRecord|null|undefined>(undefined);
 const [params,setParams]=useSearchParams();
 useEffect(()=>{
  if(!ready)return;
  if(params.get('new')==='block'){setSelected(null);return;}
  const id=params.get('edit');
  if(id){const found=blocks.find(block=>block.id===id);
   if(found&&found.status!=='cancelled')setSelected(found);}
 },[ready,params,blocks]);
 const trigger=useRef<HTMLButtonElement|null>(null);
 const createOpener=useRef<HTMLButtonElement|null>(null);
 const open=(event:MouseEvent<HTMLButtonElement>,block:CalendarBlockRecord|null)=>{
  trigger.current=event.currentTarget;
  setSelected(block);
 };
 const close=()=>{
  if(params.has('new')||params.has('edit')||params.has('start')){
   const next=new URLSearchParams(params);
   next.delete('new');next.delete('edit');next.delete('start');setParams(next,{replace:true});
  }
  setSelected(undefined);
  // A deleted block removes its Edit opener; fall back to the persistent Add opener.
  queueMicrotask(()=>{
   if(onClosed){onClosed();return;}
   (trigger.current?.isConnected ? trigger.current : createOpener.current)?.focus();
  });
 };
 return <>
  {selected!==undefined&&<BlockSheet key={(selected?.id??'new')+':'+(params.get('start')??'')} block={selected}
   initialStart={params.get('start')??undefined} date={date} zone={zone} onRefresh={onRefresh} onClose={close}/>}
 </>;
}
