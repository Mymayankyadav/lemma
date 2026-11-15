import type {ClosedStudyIntervalInput} from '../../data/study/contract';

const validDay=/^\d{4}-\d{2}-\d{2}$/;
const validClock=/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;
/** Resolve owner-local wall time without dropping seconds or milliseconds. Gaps are rejected; folds choose the first match. */
export function localClockInstant(day:string,clock:string,zone:string):string|null{
 if(!validDay.test(day)||!validClock.test(clock))return null;
 const [year,month,date]=day.split('-').map(Number),[hour,minute,raw='0']=clock.split(':');
 const [second,fraction='']=raw.split('.');
 const naive=Date.UTC(year,month-1,date,Number(hour),Number(minute),Number(second),Number(fraction.padEnd(3,'0')));
 if(!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,10)!==day)return null;
 let fmt:Intl.DateTimeFormat;
 try{fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{return null;}
 const wall=(at:number)=>{
  const parts=Object.fromEntries(fmt.formatToParts(new Date(at)).map(p=>[p.type,p.value]));
  return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second),new Date(at).getUTCMilliseconds());
 };
 const offsets=new Set([-36,-12,0,12,36].map(h=>{const at=naive+h*3600000;return wall(at)-at;}));
 const matches=[...offsets].map(offset=>naive-offset).filter(at=>wall(at)===naive).sort((a,b)=>a-b);
 return matches.length?new Date(matches[0]).toISOString():null;
}
export function localWallParts(instant:string,zone:string):{day:string;clock:string}{
 const at=new Date(instant);if(!Number.isFinite(at.getTime()))throw Error('Invalid saved time');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
 const precise=at.getUTCSeconds()!==0||at.getUTCMilliseconds()!==0;
 return {day:parts.year+'-'+parts.month+'-'+parts.day,clock:parts.hour+':'+parts.minute+(precise?':'+parts.second+(at.getUTCMilliseconds()?'.'+String(at.getUTCMilliseconds()).padStart(3,'0'):''):'')};
}
export function manualFocusInterval(day:string,start:string,end:string,zone:string):ClosedStudyIntervalInput{
 const from=localClockInstant(day,start,zone),until=localClockInstant(day,end,zone);
 if(!from||!until)throw Error('Choose a valid date and local start/end times.');
 if(Date.parse(until)<=Date.parse(from))throw Error('End must follow start. For overnight study, add each day separately.');
 return {kind:'focus',start:from,end:until};
}
