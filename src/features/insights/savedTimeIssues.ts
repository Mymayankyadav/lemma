import type {StudyEntryRecord} from '../../data/study/contract';

/** #1319 (mockup `22__Page`): saved focus that overlaps other saved focus, or lies in the future,
 * needs the owner's attention. Totals already count each minute once; this only reports it. */
export interface SavedTimeIssues {overlapMinutes:number;futureRecords:number}

type Span=[number,number];
function union(spans:Span[]):number{
 let total=0,end=-Infinity;
 for(const [a,b] of [...spans].sort((x,y)=>x[0]-y[0])){
  if(b<=end)continue;
  total+=b-Math.max(a,end);end=b;
 }
 return total;
}

export function savedTimeIssues(entries:StudyEntryRecord[],now:string):SavedTimeIssues{
 const spans:Span[]=[];let futureRecords=0;const nowMs=Date.parse(now);
 for(const entry of entries){
  if(entry.status!=='saved'||entry.voidedAt)continue;
  let future=false;
  for(const interval of entry.intervals){
   if(interval.kind==='break'||interval.end===null)continue;
   const a=Date.parse(interval.start),b=Date.parse(interval.end);
   if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
   spans.push([a,b]);
   if(b>nowMs)future=true;
  }
  if(future)futureRecords++;
 }
 const sum=spans.reduce((n,[a,b])=>n+b-a,0);
 return {overlapMinutes:Math.round((sum-union(spans))/60_000),futureRecords};
}

export function needsAttention(issues:SavedTimeIssues|null):boolean{
 return !!issues&&(issues.overlapMinutes>0||issues.futureRecords>0);
}
