import type {PlanChangeOp,Proposal} from '../../../data/types';
import type {ReviewNode} from '../../plan-proposal/nodes';

/** PLAN §6.10. Pure rules for the Inbox: tabs, swipe decisions, the batch offer, plan change rows and the mini map. */
export const isCardProposal=(p:Proposal)=>p.kind==='card'||p.kind==='card_edit';
export const isPlanProposal=(p:Proposal)=>p.kind==='plan'||p.kind==='plan_change';
export type Decision='approve'|'reject';
export type SwipeIntent=Decision|'skip'|null;
/** A decision needs 35% of the card's width (or 30% of its height upward to skip), or a fast flick; otherwise it springs back. */
export function swipeIntent(dx:number,dy:number,width:number,velocityX=0,velocityY=0):SwipeIntent{
 const horizontal=Math.abs(dx)>=Math.abs(dy);
 if(horizontal){
  if(dx>=width*.35||(dx>40&&velocityX>.8))return 'approve';
  if(dx<=-width*.35||(dx<-40&&velocityX<-.8))return 'reject';
  return null;
 }
 if(dy<=-width*.3||(dy<-40&&velocityY<-.8))return 'skip';
 return null;
}
/** Tilt up to 6° and a wash that grows with the distance, capped at the decision threshold. */
export function swipeStyle(dx:number,width:number):{rotate:number;wash:number;word:'Approve'|'Reject'|null}{
 const progress=Math.max(-1,Math.min(1,dx/Math.max(1,width*.35)));
 return {rotate:progress*6,wash:Math.abs(progress),word:progress>.15?'Approve':progress<-.15?'Reject':null};
}
/** Move the first card to the end (skip). */
export function skipFirst<T>(order:readonly T[]):T[]{return order.length>1?[...order.slice(1),order[0]]:[...order];}
/** Keep a stable queue order across refetches: known ids in their current order, then new ones as they arrive. */
export function mergeOrder(order:readonly string[],ids:readonly string[]):string[]{
 const live=new Set(ids),kept=order.filter(id=>live.has(id)),known=new Set(kept);
 return [...kept,...ids.filter(id=>!known.has(id))];
}
/** "Approve all 4 from Session 7": the other new-card proposals from the same path and session as the top card. */
export function sameSession(top:Proposal|undefined,queue:readonly Proposal[]):Proposal[]{
 if(!top||top.sessionNumber===null)return [];
 return queue.filter(p=>p.kind==='card'&&p.projectSlug===top.projectSlug&&p.sessionNumber===top.sessionNumber);
}
export interface SessionGroup{key:string;label:string;items:Proposal[]}
/** The list view groups by path and session, newest session first. */
export function groupBySession(rows:readonly Proposal[],title:(slug:string)=>string):SessionGroup[]{
 const groups=new Map<string,SessionGroup>();
 for(const row of rows){
  const key=row.projectSlug+'|'+(row.sessionNumber??'none');
  const group=groups.get(key)??{key,label:title(row.projectSlug)+(row.sessionNumber!==null?' · Session '+row.sessionNumber:' · Without a session'),items:[]};
  group.items.push(row);groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>Date.parse(b.items[0].createdAt)-Date.parse(a.items[0].createdAt));
}
export type ChangeIcon='add'|'link'|'unlink'|'edit'|'remove'|'move';
export interface ChangeRow{icon:ChangeIcon;text:string;code:string}
/** One readable row per change, with the icon the plan names: plus, link, pencil, minus (and an arrow for a move). */
export function changeRows(ops:readonly PlanChangeOp[],titleOf:(code:string)=>string):ChangeRow[]{
 const name=(code:string|undefined)=>code?titleOf(code):'the start';
 return ops.map(op=>{
  switch(op.op){
   case 'add':return {icon:'add',code:op.code??'',text:'Add '+(op.title||'a checkpoint')+(op.after?' after '+name(op.after):'')};
   case 'update':return {icon:'edit',code:op.code,text:'Change '+name(op.code)+(op.title&&op.title!==titleOf(op.code)?' to '+op.title:'')};
   case 'remove':return {icon:'remove',code:op.code,text:'Remove '+name(op.code)};
   case 'move':return {icon:'move',code:op.code,text:'Move '+name(op.code)+' after '+name(op.after)};
   case 'prereq_add':return {icon:'link',code:op.code,text:name(op.code)+' now needs '+name(op.prereq)};
   case 'prereq_remove':return {icon:'unlink',code:op.code,text:name(op.code)+' no longer needs '+name(op.prereq)};
  }
 });
}
/** Up to five nodes around the first changed node, so the change is shown in place. */
export function miniWindow(nodes:readonly ReviewNode[],changed:ReadonlySet<string>,size=5):ReviewNode[]{
 if(nodes.length<=size)return [...nodes];
 const first=Math.max(0,nodes.findIndex(node=>changed.has(node.code)));
 const start=Math.max(0,Math.min(nodes.length-size,first-Math.floor(size/2)));
 return nodes.slice(start,start+size);
}
