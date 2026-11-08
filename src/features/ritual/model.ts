import type {StudyEntryRecord} from '../../data/study';
// N69 owner-date ritual eligibility, independent of the browser's timezone.
// A future civil date must never be marked closed even if device clock changes.
export function ownerCivilDate(at:Date,zone:string):string{
 if(!Number.isFinite(at.getTime()))throw new Error('Invalid current instant');
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(at);
 const read=(key:string)=>parts.find(x=>x.type===key)?.value??'';
 return read('year')+'-'+read('month')+'-'+read('day');
}
export function canCloseOwnerDay(planDate:string,at:Date,zone:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(planDate)||
  Number.isNaN(Date.parse(planDate+'T00:00:00Z'))||
  new Date(planDate+'T00:00:00Z').toISOString().slice(0,10)!==planDate)
  throw new Error('Invalid owner plan date');
 return planDate<=ownerCivilDate(at,zone);
}

/** Save explicit carry-over choices without inventing or reviving task IDs. */
export function normalizeCarryOverChoices(available:readonly string[],
 carry:ReadonlySet<string>,first:string):{
 carryOverTaskIds:string[];tomorrowFirstTaskId:string|null
}{
 const known=new Set(available);
 if(known.size!==available.length||available.some(id=>typeof id!=='string'||!id.trim()))
  throw new Error('Invalid unfinished task list');
 if([...carry].some(id=>!known.has(id)))throw new Error('Stale carry-over task');
 if(first&&!known.has(first))throw new Error('Tomorrow first task is no longer unfinished');
 return {carryOverTaskIds:[...carry],tomorrowFirstTaskId:first||null};
}

/** A focus interval contributes to every owner civil day it intersects.
 * Its end is exclusive, so midnight at end does not count as another day.
 * Completed work spanning midnight must not disappear from the earlier day. */
export function savedFocusTouchesOwnerDay(
 entry:Pick<StudyEntryRecord,'status'|'intervals'>,date:string,zone:string
):boolean{
 if(entry.status!=='saved')return false;
 return entry.intervals.some(interval=>{
  if(interval.kind!=='focus'||!interval.end)return false;
  const start=Date.parse(interval.start),end=Date.parse(interval.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
  return ownerCivilDate(new Date(start),zone)<=date&&
   ownerCivilDate(new Date(end-1),zone)>=date;
 });
}
