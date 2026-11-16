import type {StudyEntryRecord} from '../../../data/study/contract';

/** One stretch of a saved session: time you focused, paused (no interval at all) or took as a break. */
export interface SessionStretch {kind:'focus'|'pause'|'break';start:string;end:string;minutes:number}
/**
 * N168: one saved timer session drawn as one calendar card, from its first focus to its last.
 * Pausing records nothing between the closed focus stretch and the next one, so a pause is the gap
 * that no interval covers; a Break is a gap covered by a break interval.
 */
export interface LoggedSession {
 id:string;entry:StudyEntryRecord;
 /** First focus start and last focus end (not clipped to the day). */
 start:string;end:string;
 stretches:SessionStretch[];
 focusMinutes:number;pausedMinutes:number;breakMinutes:number;
 /** Number of pause gaps (not breaks). */
 pauses:number;
}
type Span=[number,number];
const MINUTE=60_000;
const iso=(ms:number)=>new Date(ms).toISOString();
function union(spans:Span[]):Span[]{
 const sorted=spans.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0]);
 const out:Span[]=[];
 for(const [a,b] of sorted){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}
 return out;
}
/** Splits [a,b) into the parts covered by `cover` (break) and the parts not covered (pause), in order. */
function splitGap(a:number,b:number,cover:Span[]):{kind:'pause'|'break';span:Span}[]{
 const out:{kind:'pause'|'break';span:Span}[]=[];let at=a;
 for(const [s,e] of cover){
  if(e<=at||s>=b)continue;
  const from=Math.max(s,at),to=Math.min(e,b);
  if(from>at)out.push({kind:'pause',span:[at,from]});
  out.push({kind:'break',span:[from,to]});at=to;
 }
 if(at<b)out.push({kind:'pause',span:[at,b]});
 return out;
}
const minutesOf=(spans:Span[])=>spans.reduce((sum,[a,b])=>sum+(b-a)/MINUTE,0);

/** The session one saved entry stands for, or null when it has no closed focus time. */
export function sessionOf(entry:StudyEntryRecord):LoggedSession|null{
 const closed=entry.intervals.filter(i=>i.end!==null).map(i=>({kind:i.kind,span:[Date.parse(i.start),Date.parse(i.end!)] as Span}));
 const focus=union(closed.filter(i=>i.kind==='focus').map(i=>i.span));
 if(!focus.length)return null;
 const breaks=union(closed.filter(i=>i.kind==='break').map(i=>i.span));
 const stretches:SessionStretch[]=[];
 const push=(kind:SessionStretch['kind'],[a,b]:Span)=>stretches.push({kind,start:iso(a),end:iso(b),minutes:(b-a)/MINUTE});
 focus.forEach((span,index)=>{
  if(index>0)for(const part of splitGap(focus[index-1][1],span[0],breaks))push(part.kind,part.span);
  push('focus',span);
 });
 const total=(kind:SessionStretch['kind'])=>stretches.filter(s=>s.kind===kind).reduce((sum,s)=>sum+s.minutes,0);
 return {id:'session:'+entry.id,entry,start:iso(focus[0][0]),end:iso(focus.at(-1)![1]),stretches,
  focusMinutes:minutesOf(focus),pausedMinutes:total('pause'),breakMinutes:total('break'),pauses:stretches.filter(s=>s.kind==='pause').length};
}

/** Saved, not voided sessions that touch [range.start, range.end), one per entry, in start order. */
export function loggedSessions(entries:readonly StudyEntryRecord[],range:{start:string;end:string}):LoggedSession[]{
 const from=Date.parse(range.start),to=Date.parse(range.end),seen=new Set<string>();
 return entries.flatMap(entry=>{
  if(entry.status!=='saved'||entry.voidedAt||seen.has(entry.id))return [];
  seen.add(entry.id);
  const session=sessionOf(entry);
  return session&&Date.parse(session.end)>from&&Date.parse(session.start)<to?[session]:[];
 }).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}

/** "35 min" plus ", paused 15 min" and ", break 5 min" when there were any. */
export function sessionCaption(session:LoggedSession,format:(minutes:number)=>string):string{
 return format(session.focusMinutes)+(session.pausedMinutes>=1?' · paused '+format(session.pausedMinutes):'')+(session.breakMinutes>=1?' · break '+format(session.breakMinutes):'');
}
