// N75: exact, half-open conflicts between owner-visible blocks and saved focus.
// UI never adds or deletes study time; acknowledging a conflict does not hide it.
import type {CalendarBlockRecord,StudyEntryRecord,StudyRange} from '../../../data/study/contract';
import type {OverlapAcknowledgement,OverlapParticipant,OverlapChoice} from '../../../data/overlap-acknowledgements/contract';

type Span={kind:'block'|'entry';id:string;version:number;name:string;start:number;end:number;blockKind?:'study'|'busy';linkedBlockId?:string|null};
export interface CalendarOverlap {
 key:string;startsAt:string;endsAt:string;
 participants:OverlapParticipant[];names:[string,string];
}
export const overlapParticipantsKey=(v:readonly Pick<OverlapParticipant,'kind'|'id'>[]):string=>
 v.map(p=>p.kind+':'+p.id.toLowerCase()).sort().join('|');
export function overlapWindows(entries:readonly StudyEntryRecord[],
 blocks:readonly CalendarBlockRecord[],range:StudyRange):CalendarOverlap[]{
 const start=Date.parse(range.start),end=Date.parse(range.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return [];
 const spans:Span[]=[];
 for(const block of blocks){
  if(block.status==='cancelled')continue;
  spans.push({kind:'block',id:block.id,version:block.version,
   name:block.title||'Calendar block',start:Date.parse(block.startsAt),
   end:Date.parse(block.endsAt),blockKind:block.kind});
 }
 for(const entry of entries){
  if(entry.status!=='saved')continue;
  for(const interval of entry.intervals){
   if(interval.kind!=='focus'||interval.end===null)continue;
   spans.push({kind:'entry',id:entry.id,version:entry.version,
    name:entry.intent||'Saved study',start:Date.parse(interval.start),
    end:Date.parse(interval.end),linkedBlockId:entry.calendarBlockId??null});
  }
 }
 const rows=new Map<string,CalendarOverlap>();
 for(let i=0;i<spans.length;i++)for(let j=i+1;j<spans.length;j++){
  const a=spans[i],b=spans[j];
  if(a.kind===b.kind&&a.id.toLowerCase()===b.id.toLowerCase())continue;
  if(a.kind!==b.kind){
   const planned=a.kind==='block'?a:b,logged=a.kind==='entry'?a:b;
   // Studying a planned block fulfils it. Never ask the owner to attribute
   // already-linked focus time, even if an old adapter labels it differently.
   if(planned.blockKind==='study'||logged.linkedBlockId?.toLowerCase()===planned.id.toLowerCase())continue;
  }
  // Keep the true intersection across week/month boundaries. A narrow
  // viewport must not change an acknowledgement's exact time identity.
  const from=Math.max(a.start,b.start),to=Math.min(a.end,b.end);
  if(from>=end||to<=start)continue;
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)continue;
  const pair=[a,b].sort((x,y)=>(
   x.kind+':'+x.id.toLowerCase()).localeCompare(y.kind+':'+y.id.toLowerCase()));
  const participants=pair.map(p=>({kind:p.kind,id:p.id.toLowerCase(),version:p.version}));
  const startsAt=new Date(from).toISOString(),endsAt=new Date(to).toISOString();
  const key=overlapParticipantsKey(participants)+'@'+startsAt+'-'+endsAt;
  rows.set(key,{key,startsAt,endsAt,participants,
   names:[pair[0].name,pair[1].name]});
 }
 return [...rows.values()].sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||
  a.key.localeCompare(b.key));
}
export function matchingAcknowledgement(row:CalendarOverlap,
 acknowledgements:readonly OverlapAcknowledgement[]):OverlapAcknowledgement|null {
 return acknowledgements.find(ack=>!ack.stale&&ack.startsAt===row.startsAt&&
  ack.endsAt===row.endsAt&&
  overlapParticipantsKey(ack.participants)===overlapParticipantsKey(row.participants)&&
  ack.participants.length===row.participants.length&&
  row.participants.every(p=>ack.participants.some(a=>a.kind===p.kind&&
   a.id.toLowerCase()===p.id&&a.version===p.version)))??null;
}
export function overlapChoice(row:CalendarOverlap,index:number):OverlapChoice {
 return {kind:row.participants[index].kind,id:row.participants[index].id};
}
