import {useCallback,useEffect,useRef,useState} from 'react';
import {useApproveProposal,useRejectProposal} from '../../../data/hooks';
import type {NoteKind,NoteType,Proposal} from '../../../data/types';
import {useToast} from '../../../ui/Toast';
import {applySelectedDecisions} from '../v6/Selection';
import type {Decision} from './inboxModel';

const WINDOW=6000;
interface Pending{ids:string[];action:Decision;edit?:{front:string;back:string;type?:NoteType;kind?:NoteKind};dismiss:()=>void}

/** The toast owns the Undo deadline. Off-screen, any undisputed decisions settle immediately. */
export function useInboxDecisions({onUndo,onSettled}:{onUndo:(ids:string[])=>void;onSettled:()=>void}){
 const approve=useApproveProposal(),reject=useRejectProposal(),notify=useToast();
 const [held,setHeld]=useState<ReadonlySet<string>>(()=>new Set());
 const waiting=useRef(new Set<Pending>());
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
 const settle=useCallback((entry:Pending)=>{
  if(waiting.current.delete(entry))void send.current(entry);
 },[]);
 const flush=useCallback(()=>{
  for(const entry of waiting.current){entry.dismiss();settle(entry);}
 },[settle]);
 useEffect(()=>{
  const leave=()=>flush();
  window.addEventListener('pagehide',leave);
  return()=>{window.removeEventListener('pagehide',leave);leave();};
 },[flush]);
 const decide=useCallback((items:readonly Proposal[],action:Decision,edit?:{front:string;back:string;type?:NoteType;kind?:NoteKind})=>{
  const pendingIds=new Set([...waiting.current].flatMap(entry=>entry.ids));
  const ids=items.map(item=>item.id).filter(id=>!pendingIds.has(id));
  if(!ids.length)return;
  setHeld(previous=>new Set([...previous,...ids]));
  const entry:Pending={ids,action,edit,dismiss:()=>{}};
  waiting.current.add(entry);
  const message=ids.length===1?(action==='approve'?'Approved':'Rejected'):(action==='approve'?ids.length+' approved':ids.length+' rejected');
  entry.dismiss=notify(message,{duration:WINDOW,onExpire:()=>settle(entry),action:{label:'Undo',onClick:()=>{
   if(!waiting.current.delete(entry))return;
   release(ids);onUndo(ids);
  }}});
 },[settle,notify,release,onUndo]);
 return {held,decide,flush,busy:approve.isPending||reject.isPending};
}
