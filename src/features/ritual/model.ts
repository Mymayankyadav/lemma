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
