/** N121 — v6-only human formatting. Keep legacy text formatters untouched. */
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
export function formatInterval(days:number):string{
 if(!Number.isFinite(days)||days<0)return 'Unknown interval';
 if(days<1)return formatDuration(days*1440);
 const rounded=(n:number)=>Number(n.toFixed(1)).toLocaleString('en');
 if(days<14){const n=rounded(days);return `${n} day${n==='1'?'':'s'}`;}
 if(days<60){const n=rounded(days/7);return `${n} week${n==='1'?'':'s'}`;}
 if(days<365){const n=rounded(days/30.4375);return `${n} month${n==='1'?'':'s'}`;}
 const n=rounded(days/365.25);return `${n} year${n==='1'?'':'s'}`;
}
export function formatZone(zone:string):string{
 const canonical=canonicalZone(zone),when=new Date();
 return new Intl.DateTimeFormat('en-US',{timeZone:canonical,timeZoneName:'short'}).formatToParts(when)
  .find(x=>x.type==='timeZoneName')?.value??canonical;
}
