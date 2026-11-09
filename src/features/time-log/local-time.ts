import type {ClosedStudyIntervalInput} from '../../data/study/contract';

const validDay=/^\d{4}-\d{2}-\d{2}$/;
const validClock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** Owner-local wall time with no browser-time-zone dependency. Invalid DST gap
 * times are rejected rather than silently moved an hour; folds choose the
 * first occurrence, matching the Calendar block editor. */
export function localClockInstant(day:string,clock:string,zone:string):string|null{
 if(!validDay.test(day)||!validClock.test(clock))return null;
 const wall=day+'T'+clock;
 const [year,month,date,hour,minute]=wall.split(/[-T:]/).map(Number);
 const naive=Date.UTC(year,month-1,date,hour,minute);
 if(!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,16)!==wall)return null;
 let fmt:Intl.DateTimeFormat;
 try{fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{return null}
 const render=(ms:number):string=>{
  const parts=fmt.formatToParts(new Date(ms));
  const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return get('year')+'-'+get('month')+'-'+get('day')+'T'+get('hour')+':'+get('minute');
 };
 const offsets=new Set<number>();
 for(const hours of [-36,-12,0,12,36]){
  const when=naive+hours*3_600_000;
  const seen=render(when),guess=Date.parse(seen+':00Z');
  offsets.add(guess-when);
 }
 const matches=[...offsets].map(offset=>naive-offset)
  .filter(ms=>render(ms)===wall).sort((a,b)=>a-b);
 return matches.length?new Date(matches[0]).toISOString():null;
}
export function localWallParts(instant:string,zone:string):{day:string;clock:string}{
 const ms=Date.parse(instant);
 if(!Number.isFinite(ms))throw Error('Invalid saved time');
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=fmt.formatToParts(new Date(ms)),get=(kind:string)=>parts.find(p=>p.type===kind)?.value??'';
 return {day:get('year')+'-'+get('month')+'-'+get('day'),clock:get('hour')+':'+get('minute')};
}
export function manualFocusInterval(day:string,start:string,end:string,zone:string):ClosedStudyIntervalInput{
 const from=localClockInstant(day,start,zone),until=localClockInstant(day,end,zone);
 if(!from||!until)throw Error('Choose a valid date and local start/end times.');
 if(Date.parse(until)<=Date.parse(from))throw Error('End must follow start. For overnight study, add each day separately.');
 return {kind:'focus',start:from,end:until};
}
