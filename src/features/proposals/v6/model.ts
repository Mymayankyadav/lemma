import type {Proposal} from '../../../data/types';
export type InboxGroup={day:string;label:string;proposals:Proposal[]};
export function inboxDay(at:string,timeZone:string):string {
 const date=new Date(at);
 if(!Number.isFinite(date.getTime()))throw new Error('Invalid proposal timestamp');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const number=(name:string)=>parts.find(p=>p.type===name)?.value??'';
 return number('year')+'-'+number('month')+'-'+number('day');
}
/** Group only real pending proposals; a missing rationale is never invented. */
export function groupInbox(proposals:Proposal[],now:string,zone:string):InboxGroup[]{
 const today=inboxDay(now,zone),groups=new Map<string,Proposal[]>();
 for(const proposal of proposals){
  const day=inboxDay(proposal.createdAt,zone),list=groups.get(day)??[];
  list.push(proposal);groups.set(day,list);
 }
 return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([day,list])=>({
  day,label:day===today?'Today':day,
  proposals:list.slice().sort((a,b)=>
   Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id))
 }));
}
export function proposalRationale(proposal:Proposal):string{
 return proposal.reason?.trim()||'Rationale unavailable';
}
