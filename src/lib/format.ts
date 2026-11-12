/** N121 — v6 human formatting, plus the v7 short/long date, clock and time-left helpers at the end. Keep legacy text formatters untouched. */
export type FormatOptions={zone?:string;now?:Date|string;clock24h?:boolean};
const aliases:Record<string,string>={
 'Asia/Calcutta':'Asia/Kolkata','Asia/Saigon':'Asia/Ho_Chi_Minh',
 'Asia/Katmandu':'Asia/Kathmandu','America/Buenos_Aires':'America/Argentina/Buenos_Aires',
 'Europe/Kiev':'Europe/Kyiv',
};
export function canonicalZone(zone:string):string{
 const name=aliases[zone]??zone;
 try{new Intl.DateTimeFormat('en-US',{timeZone:name});return name;}catch{return 'UTC';}
}
export function ownerZone(settings?:{timeZone?:string|null}|null):string{
 return canonicalZone(settings?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');
}
function civil(value:Date,zone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:canonicalZone(zone),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 const field=(kind:string)=>parts.find(p=>p.type===kind)?.value??'';
 return `${field('year')}-${field('month')}-${field('day')}`;
}
function asDay(value:string|Date,zone:string):string{
 if(typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value))return value;
 return civil(new Date(value),zone);
}
function dayDifference(one:string,two:string):number{
 return Math.round((Date.parse(one+'T12:00:00Z')-Date.parse(two+'T12:00:00Z'))/86400000);
}
export function formatDay(value:string|Date,options:FormatOptions={}):string{
 const zone=canonicalZone(options.zone??ownerZone()),date=asDay(value,zone);
 const today=civil(new Date(options.now??Date.now()),zone);
 const offset=dayDifference(date,today);
 if(offset===0)return 'Today';if(offset===1)return 'Tomorrow';if(offset===-1)return 'Yesterday';
 const [y,m,d]=date.split('-').map(Number);
 const at=new Date(Date.UTC(y,m-1,d,12));
 if(Math.abs(offset)<=6)return new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short'}).format(at);
 const label=new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(at);
 return y===Number(today.slice(0,4))?label:`${label}, ${y}`;
}
export function formatTime(instant:string|Date,options:FormatOptions={}):string{
 const date=new Date(instant),zone=canonicalZone(options.zone??ownerZone());
 return new Intl.DateTimeFormat('en',{timeZone:zone,hour:'numeric',minute:'2-digit',hourCycle:options.clock24h?'h23':'h12'}).format(date)
  .replace(/\s*AM$/i,' am').replace(/\s*PM$/i,' pm');
}
export function formatTimeRange(from:string|Date,to:string|Date,options:FormatOptions={}):string{
 return `${formatTime(from,options)}–${formatTime(to,options)}`;
}
export function formatDateTime(value:string|Date,options:FormatOptions={}):string{
 return `${formatDay(value,options)} · ${formatTime(value,options)}`;
}
export function formatDuration(minutes:number):string{
 if(!Number.isFinite(minutes)||minutes<0)return '0 min';
 const total=Math.round(minutes),h=Math.floor(total/60),m=total%60;
 return h?`${h} h${m?' '+m+' min':''}`:`${m} min`;
}
/** Review intervals, stability and cadence: "10 min", "3 days", "30 days", "2 months", "1.5 years". Never "mo" or "d". */
export function formatInterval(days:number):string{
 if(!Number.isFinite(days)||days<0)return 'Unknown interval';
 if(days<1)return formatDuration(days*1440);
 if(days<45){const n=Math.round(days);return n+(n===1?' day':' days');}
 if(days<365){const n=Math.round(days/30.4375);return n+(n===1?' month':' months');}
 const n=Number((days/365.25).toFixed(1)).toLocaleString('en');
 return n+(n==='1'?' year':' years');
}
export function formatZone(zone:string):string{
 const canonical=canonicalZone(zone),when=new Date();
 return new Intl.DateTimeFormat('en-US',{timeZone:canonical,timeZoneName:'short'}).formatToParts(when)
  .find(x=>x.type==='timeZoneName')?.value??canonical;
}

/* v7 (Night critique v2, B2/B7): one short date style, one long date style and one clock, everywhere on v7 screens.
   Short "Wed 11 Nov" (the year only when it is not the current one), long "Wednesday 11 November", clock "09:30" (24-hour
   unless the owner chose 12-hour, then "9:30 am"). */
const civilUtc=(day:string)=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12));};
function dayParts(day:string,long:boolean):string{
 const at=civilUtc(day),f=(o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...o}).format(at);
 return long?`${f({weekday:'long'})} ${Number(day.slice(8,10))} ${f({month:'long'})}`:`${f({weekday:'short'})} ${Number(day.slice(8,10))} ${f({month:'short'})}`;
}
export function formatShortDate(value:string|Date,options:FormatOptions={}):string{
 const zone=canonicalZone(options.zone??ownerZone()),day=asDay(value,zone),year=day.slice(0,4);
 const thisYear=civil(new Date(options.now??Date.now()),zone).slice(0,4);
 return dayParts(day,false)+(year===thisYear?'':' '+year);
}
export function formatLongDate(value:string|Date,options:FormatOptions={}):string{
 const zone=canonicalZone(options.zone??ownerZone());
 return dayParts(asDay(value,zone),true);
}
export function formatClock(instant:string|Date,options:FormatOptions={}):string{
 const zone=canonicalZone(options.zone??ownerZone());
 if(options.clock24h===false)return formatTime(instant,{...options,clock24h:false});
 return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
}
/** "Due in 45 min", "Due in 3 h", "Due today · 17:00", "Due tomorrow", "Due in 4 days", "Due Sat 21 Nov", or "Overdue · Mon".
 *  B2: computed from the full due date and time, never from the effort still left. */
export function formatTimeLeft(due:{kind:'date';date:string}|{kind:'instant';at:string},options:FormatOptions={}):string{
 const zone=canonicalZone(options.zone??ownerZone()),now=new Date(options.now??Date.now()),today=civil(now,zone);
 const day=due.kind==='date'?due.date:civil(new Date(due.at),zone),days=dayDifference(day,today);
 if(due.kind==='instant'){
  const minutes=Math.round((Date.parse(due.at)-now.getTime())/60000);
  if(minutes<0)return 'Overdue · '+(days===0?formatClock(due.at,options):formatShortDate(day,{...options,zone}));
  if(minutes<60)return `Due in ${Math.max(1,minutes)} min`;
  if(days===0)return minutes<180?`Due in ${Math.round(minutes/60)} h`:'Due today · '+formatClock(due.at,options);
 }else if(days<0)return 'Overdue · '+formatShortDate(day,{...options,zone});
 if(days===0)return 'Due today';
 if(days===1)return 'Due tomorrow';
 if(days<=6)return `Due in ${days} days`;
 return 'Due '+formatShortDate(day,{...options,zone});
}

/** V34 (v7 UX audit r3): a time zone as people say it ("India Standard Time"), not its id's city ("Calcutta time").
 *  Falls back to the city when the platform only knows an offset. */
export function zoneLongName(zone: string, at: Date = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('en-GB', {timeZone: zone, timeZoneName: 'long'}).formatToParts(at).find(part => part.type === 'timeZoneName')?.value;
    if (name && !/^(GMT|UTC)[+-−]/.test(name)) return name;
  } catch {/* an unknown zone falls through */}
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ') + ' time';
}
