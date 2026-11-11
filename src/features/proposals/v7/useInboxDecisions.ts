import {useCallback,useEffect,useRef,useState} from 'react';
import {useApproveProposal,useRejectProposal} from '../../../data/hooks';
import type {Proposal} from '../../../data/types';
import {useToast} from '../../../ui/Toast';
import {applySelectedDecisions} from '../v6/Selection';
import type {Decision} from './inboxModel';

const WINDOW=6000;
interface Pending{ids:string[];action:Decision;edit?:{front:string;back:string};timer:number;dismiss:()=>void}

/** PLAN §6.10: every decision waits 6 s with Undo before it is sent; the next card shows at once. A new decision, leaving the
 *  page or closing the tab sends the waiting one immediately (the same contract as the v6 Inbox, N121 A7). */
export function useInboxDecisions({onUndo,onSettled}:{onUndo:(ids:string[])=>void;onSettled:()=>void}){
 const approve=useApproveProposal(),reject=useRejectProposal(),notify=useToast();
 const [held,setHeld]=useState<ReadonlySet<string>>(()=>new Set());
 const waiting=useRef<Pending|null>(null);
 const release=useCallback((ids:readonly string[])=>setHeld(previous=>{const next=new Set(previous);for(const id of ids)next.delete(id);return next;}),[]);
 const send=useRef<(entry:Pending)=>Promise<void>>(async()=>{});
 send.current=async entry=>{
  try{
   if(entry.ids.length===1&&entry.edit)await approve.mutateAsync({id:entry.ids[0],edit:entry.edit});
   else if(entry.ids.length===1){
    if(entry.action==='approve')await approve.mutateAsync({id:entry.ids[0]});else await reject.mutateAsync(entry.ids[0]);
   }else{
    const result=await applySelectedDecisions(entry.ids,entry.action,id=>approve.mutateAsync({id}),id=>reject.mutateAsync(id));
    if(result.failed)notify(result.succeeded.length+' saved; '+result.remaining.length+' not saved. Refresh before retrying.',{tone:'danger'});
   }
  }catch{
   notify('Could not confirm the decision. Refresh to check whether it was saved.',{tone:'danger'});
  }finally{release(entry.ids);onSettled();}
 };
 const flush=useCallback(()=>{
  const entry=waiting.current;
  if(!entry)return;
  waiting.current=null;window.clearTimeout(entry.timer);entry.dismiss();void send.current(entry);
 },[]);
 useEffect(()=>{
  const leave=()=>flush();
  window.addEventListener('pagehide',leave);
  return()=>{window.removeEventListener('pagehide',leave);leave();};
 },[flush]);
 const decide=useCallback((items:readonly Proposal[],action:Decision,edit?:{front:string;back:string})=>{
  if(!items.length)return;
  flush();
  const ids=items.map(item=>item.id);
  setHeld(previous=>{const next=new Set(previous);for(const id of ids)next.add(id);return next;});
  const entry:Pending={ids,action,edit,timer:0,dismiss:()=>{}};
  entry.timer=window.setTimeout(()=>{if(waiting.current===entry){waiting.current=null;void send.current(entry);}},WINDOW);
  const message=ids.length===1?(action==='approve'?'Approved':'Rejected'):(action==='approve'?ids.length+' approved':ids.length+' rejected');
  entry.dismiss=notify(message,{duration:WINDOW,action:{label:'Undo',onClick:()=>{
   if(waiting.current!==entry)return;
   window.clearTimeout(entry.timer);waiting.current=null;entry.dismiss();release(ids);onUndo(ids);
  }}});
  waiting.current=entry;
 },[flush,notify,release,onUndo]);
 return {held,decide,flush,busy:approve.isPending||reject.isPending};
}
