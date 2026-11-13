import type {Context} from '../db.ts';

/** N160.2: which blocks and saved study intervals overlap inside a range, so a
 * client can check before it creates, moves or resizes a block. Owner-scoped,
 * bounded and read-only. Cancelled blocks never overlap anything. */
export type CalendarOverlapArgs={start?:string;end?:string;limit?:number;
 id?:string;project?:string;cursor?:string;status?:string};
type Span={kind:'block'|'interval';id:string;title:string;starts_at:string;ends_at:string;version?:number;entry_id?:string};
const instant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_RANGE_MS=366*24*60*60*1000;
const MAX_ROWS=300;

export function parseOverlapRange(a:CalendarOverlapArgs):{start:string;end:string}{
 const raw=a as unknown as Record<string,unknown>;
 if(['owner','ownerId','user_id','userId'].some(k=>k in raw))
  throw new Error('Calendar overlap reads use the authenticated owner; omit owner arguments');
 if(typeof a.start!=='string'||typeof a.end!=='string'||!instant.test(a.start)||!instant.test(a.end))
  throw new Error('Overlap range needs start and end ISO instants with timezone');
 const from=Date.parse(a.start),until=Date.parse(a.end);
 if(!Number.isFinite(from)||!Number.isFinite(until)||until<=from||until-from>MAX_RANGE_MS)
  throw new Error('Overlap range must be positive and at most 366 days');
 return {start:new Date(from).toISOString(),end:new Date(until).toISOString()};
}

/** Pure: every pair of spans that share time, in start order. Two saved
 * intervals of the same entry never overlap each other by design. */
export function findOverlaps(spans:Span[]){
 const sorted=[...spans].sort((x,y)=>Date.parse(x.starts_at)-Date.parse(y.starts_at)||(x.id<y.id?-1:1));
 const out:{a:Span;b:Span;starts_at:string;ends_at:string;minutes:number}[]=[];
 for(let i=0;i<sorted.length;i++){
  const a=sorted[i];const aEnd=Date.parse(a.ends_at);
  for(let j=i+1;j<sorted.length;j++){
   const b=sorted[j];
   if(Date.parse(b.starts_at)>=aEnd)break;
   if(a.kind==='interval'&&b.kind==='interval'&&a.entry_id===b.entry_id)continue;
   const s=Math.max(Date.parse(a.starts_at),Date.parse(b.starts_at));
   const e=Math.min(aEnd,Date.parse(b.ends_at));
   if(e>s)out.push({a,b,starts_at:new Date(s).toISOString(),ends_at:new Date(e).toISOString(),
    minutes:Math.round((e-s)/60000)});
  }
 }
 return out;
}

export async function readCalendarOverlaps(c:Context,a:CalendarOverlapArgs):Promise<string>{
 if(!c.userId)throw new Error('Authenticated owner required');
 const range=parseOverlapRange(a);
 const blocks=await c.db.from('calendar_blocks')
  .select('id,title,kind,status,starts_at,ends_at,version')
  .eq('user_id',c.userId).neq('status','cancelled')
  .lt('starts_at',range.end).gt('ends_at',range.start)
  .order('starts_at',{ascending:true}).limit(MAX_ROWS+1);
 if(blocks.error)throw new Error(blocks.error.message);
 const intervals=await c.db.from('study_intervals')
  .select('id,entry_id,kind,started_at,ended_at')
  .eq('user_id',c.userId).eq('kind','focus')
  .lt('started_at',range.end).gt('ended_at',range.start)
  .order('started_at',{ascending:true}).limit(MAX_ROWS+1);
 if(intervals.error)throw new Error(intervals.error.message);
 const acks=await c.db.from('overlap_acknowledgements')
  .select('id,participants,starts_at,ends_at,disposition,version')
  .eq('user_id',c.userId).lt('starts_at',range.end).gt('ends_at',range.start).limit(MAX_ROWS+1);
 if(acks.error)throw new Error(acks.error.message);
 const b=(blocks.data??[]),i=(intervals.data??[]),k=(acks.data??[]);
 if(b.length>MAX_ROWS||i.length>MAX_ROWS||k.length>MAX_ROWS)
  throw new Error('Too many records in this range; narrow start and end');
 const spans:Span[]=[
  ...b.map((x:any)=>({kind:'block' as const,id:x.id,title:x.title,starts_at:x.starts_at,ends_at:x.ends_at,version:x.version})),
  ...i.map((x:any)=>({kind:'interval' as const,id:x.id,title:'Saved focus',starts_at:x.started_at,ends_at:x.ended_at,entry_id:x.entry_id}))];
 const ackedPair=(x:Span,y:Span,s:string,e:string)=>k.some((ack:any)=>
  Date.parse(ack.starts_at)<=Date.parse(s)&&Date.parse(ack.ends_at)>=Date.parse(e)&&Array.isArray(ack.participants)&&
  [x,y].every(p=>ack.participants.some((q:any)=>q.id===p.id||(p.kind==='interval'&&q.kind==='entry'&&q.id===p.entry_id))));
 const overlaps=findOverlaps(spans).map(o=>({
  between:[{kind:o.a.kind,id:o.a.id,title:o.a.title},{kind:o.b.kind,id:o.b.id,title:o.b.title}],
  starts_at:o.starts_at,ends_at:o.ends_at,minutes:o.minutes,
  acknowledged:ackedPair(o.a,o.b,o.starts_at,o.ends_at)}));
 return JSON.stringify({resource:'calendar_overlaps',range,
  blocks:b.map(({id,title,kind,status,starts_at,ends_at,version}:any)=>({id,title,kind,status,starts_at,ends_at,version})),
  intervals:i.map(({id,entry_id,started_at,ended_at}:any)=>({id,entry_id,started_at,ended_at})),
  overlaps,unacknowledged:overlaps.filter(o=>!o.acknowledged).length});
}
