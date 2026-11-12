import type {EventKind,Outcome,SessionEvent} from '../../../data/types';
import {MathText} from '../../../ui/MathText';
import {StatusBadge} from '../../../ui/v7/Status';
import {formatClock,formatShortDate} from '../../../lib/format';

/** PLAN §6.9: one evidence entry design for Checkpoint (grouped by session) and Session (with times on the right). */
export const kindWord:Readonly<Record<EventKind,string>>={pretest:'Pretest',attempt:'Attempt',hint:'Hint',explanation:'Explanation',misconception:'Misconception',evidence:'Evidence',recheck:'Recheck',note:'Note'};
export const eventEyebrow=(event:Pick<SessionEvent,'kind'|'hintLevel'>)=>event.kind==='hint'&&event.hintLevel!==null?'Hint '+event.hintLevel:kindWord[event.kind];
export function outcomeBadge(outcome:Outcome):{tone:'success'|'warning'|'danger'|'info';text:string}|null{
 if(!outcome)return null;
 if(outcome==='demonstrated')return {tone:'success',text:'Demonstrated'};
 if(outcome==='failed')return {tone:'danger',text:'Not yet'};
 return {tone:'warning',text:outcome.charAt(0).toUpperCase()+outcome.slice(1).replaceAll('_',' ')};
}
export function EvidenceEntry({event,time=false,zone}:{event:SessionEvent;time?:boolean;zone?:string}){
 const badge=outcomeBadge(event.outcome);
 return <li className="v7-evidence-entry" data-kind={event.kind}>
  <div className="v7-evidence-head"><p className="v7-eyebrow">{eventEyebrow(event)}</p>
   {badge&&<StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
   {time&&<time dateTime={event.createdAt} className="v7-evidence-time">{formatClock(event.createdAt,{zone})}</time>}</div>
  <div className="v7-evidence-body"><MathText source={event.body}/></div>
 </li>;
}
export interface EvidenceGroup{key:string;label:string;events:SessionEvent[]}
/** Group events under "Session 7 · Sun 8 Nov" by the session whose time window contains them, newest first. */
export function groupEvidence(events:readonly SessionEvent[],sessions:readonly {number:number;startedAt:string;lastActivityAt:string}[],zone?:string):EvidenceGroup[]{
 const sorted=[...sessions].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
 const groups=new Map<string,EvidenceGroup>();
 for(const event of [...events].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))){
  const at=Date.parse(event.createdAt);
  const session=sorted.find(item=>Date.parse(item.startedAt)<=at+60_000);
  const key=session?'s'+session.number:'d'+event.createdAt.slice(0,10);
  const label=session?'Session '+session.number+' · '+formatShortDate(session.startedAt,{zone}):formatShortDate(event.createdAt,{zone});
  const group=groups.get(key)??{key,label,events:[]};
  group.events.push(event);groups.set(key,group);
 }
 return [...groups.values()];
}
