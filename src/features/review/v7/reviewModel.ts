import type {DeckNode,InsightData,Rating} from '../../../data/types';
import {median} from '../../../lib/insights';
import type {Subject} from '../../../ui/v7/Subject';

/** PLAN §6.4 A/C. Pure helpers for the Review hub and Round complete, kept apart from React so they can be unit-tested. */
export type SubjectOf=(slug:string)=>Subject;
export const slugOf=(key:string)=>key.startsWith('project:')?key.slice('project:'.length):key;
const keysFor=(node:DeckNode)=>[node.key,...node.children.filter(child=>child.due>0).map(child=>child.key)];
const dueOf=(node:DeckNode)=>Math.max(node.due,node.children.reduce((sum,child)=>sum+Math.max(0,child.due),0));

export interface SubjectSegment{subject:Subject;due:number}
/** Decks with anything due, grouped by subject, largest first. */
export function subjectSegments(nodes:readonly DeckNode[],subjectOf:SubjectOf):SubjectSegment[]{
 const totals=new Map<Subject,number>();
 for(const node of nodes){
  const due=dueOf(node);
  if(due<=0)continue;
  const subject=subjectOf(slugOf(node.key));
  totals.set(subject,(totals.get(subject)??0)+due);
 }
 return [...totals].map(([subject,due])=>({subject,due})).sort((a,b)=>b.due-a.due||a.subject.localeCompare(b.subject));
}
/** Every deck, or only the decks of one subject. */
export function selectionFor(nodes:readonly DeckNode[],subjectOf:SubjectOf,subject:Subject|null):Set<string>{
 const chosen=new Set<string>();
 for(const node of nodes){
  if(dueOf(node)<=0)continue;
  if(subject!==null&&subjectOf(slugOf(node.key))!==subject)continue;
  for(const key of keysFor(node))chosen.add(key);
 }
 return chosen;
}
/** Only one path's decks (the Path screen's "Review N"); empty when that path has nothing due. */
export function selectionForSlug(nodes:readonly DeckNode[],slug:string):Set<string>{
 const chosen=new Set<string>();
 for(const node of nodes)if(slugOf(node.key)===slug&&dueOf(node)>0)for(const key of keysFor(node))chosen.add(key);
 return chosen;
}
const same=(a:ReadonlySet<string>,b:ReadonlySet<string>)=>a.size===b.size&&[...a].every(key=>b.has(key));
/** Which subject the current switches amount to: null = all, 'custom' = a hand-made mix. */
export function activeSubject(nodes:readonly DeckNode[],subjectOf:SubjectOf,enabled:ReadonlySet<string>):Subject|null|'custom'{
 if(same(enabled,selectionFor(nodes,subjectOf,null)))return null;
 for(const segment of subjectSegments(nodes,subjectOf))
  if(same(enabled,selectionFor(nodes,subjectOf,segment.subject)))return segment.subject;
 return 'custom';
}

export interface ForecastBar{label:string;due:number}
/** 7 days from the existing RPC; PLAN asks for 14, a known gap until the RPC is widened. */
export function forecastBars(days:readonly {day:string;due:number}[],zone='UTC'):ForecastBar[]{
 return days.map((entry,index)=>{
  if(index===0)return {label:'Today',due:Math.max(0,entry.due)};
  const date=new Date(entry.day+'T12:00:00Z');
  const label=Number.isNaN(date.getTime())?entry.day:new Intl.DateTimeFormat('en',{weekday:'short',timeZone:'UTC'}).format(date);
  return {label,due:Math.max(0,entry.due)};
 });
}

export interface MemoryStats{recallPct:number|null;reviews:number;typicalSeconds:number|null}
/** Recall and review count over the insight window, and the typical answer time (median, not mean). */
export function memoryStats(reviews:InsightData['reviews']):MemoryStats{
 const rated=reviews.filter(review=>review.rating>=1);
 const times=rated.map(review=>review.durationMs).filter(ms=>ms>0&&ms<=600_000);
 const middle=median(times);
 return {
  recallPct:rated.length?Math.round(100*rated.filter(review=>review.rating>1).length/rated.length):null,
  reviews:rated.length,
  typicalSeconds:middle===null?null:Math.max(1,Math.round(middle/1000)),
 };
}

export interface GradeSplit{again:number;hard:number;good:number;easy:number}
export interface RoundSummary{cards:number;seconds:number;recalledPct:number|null;grades:GradeSplit;counted:number}
const names:Record<Rating,keyof GradeSplit>={1:'again',2:'hard',3:'good',4:'easy'};
/** The reviews recorded between a run's start and end; the durable run itself stores no grades. */
export function roundSummary(reviews:InsightData['reviews'],run:{startedAt:string;endedAt:string|null;graded:number}):RoundSummary{
 const from=Date.parse(run.startedAt)-1000,to=run.endedAt?Date.parse(run.endedAt)+60_000:Infinity;
 const inside=reviews.filter(review=>{const at=Date.parse(review.reviewedAt);return at>=from&&at<=to;});
 const grades:GradeSplit={again:0,hard:0,good:0,easy:0};
 for(const review of inside)grades[names[review.rating]]+=1;
 const timed=inside.reduce((sum,review)=>sum+Math.max(0,review.durationMs),0);
 const window=run.endedAt?Math.max(0,Date.parse(run.endedAt)-Date.parse(run.startedAt)):0;
 const counted=inside.length;
 return {
  cards:run.graded,
  seconds:Math.round((timed>0?timed:window)/1000),
  recalledPct:counted?Math.round(100*(counted-grades.again)/counted):null,
  grades,counted,
 };
}
export function clock(seconds:number):string{
 const safe=Math.max(0,Math.floor(seconds));
 return Math.floor(safe/60)+':'+String(safe%60).padStart(2,'0');
}
