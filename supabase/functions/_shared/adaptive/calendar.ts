import {hash,seeded,sigmoid} from './math.ts';
import {attendanceFeatures,type AttendanceState,type Block} from './timemodel.ts';
import {studyClock,DAY} from '../calendar.ts';
export type Slot=Block&{id:string;starts_at:string;ends_at:string;recentKept?:number;recentTotal?:number};
export function declaredSlots(now:number,zone:string,start:string|undefined,end:string|undefined,minutes=60,days=7):Slot[]{
 if(!start||!end||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))return [];
 const toMin=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3)),lo=toMin(start),hi=toMin(end);if(lo<0||hi>1440||hi<=lo||minutes<15)return [];
 const today=studyClock(0,zone).dayIndex(now),out:Slot[]=[];
 for(let d=0;d<days;d++)for(let m=lo;m+minutes<=hi;m+=minutes){const hour=Math.floor(m/60),at=studyClock(hour,zone).dayStart(today+d)+(m%60)*60000;if(at<now)continue;out.push({id:'window:'+(today+d)+':'+m,starts_at:new Date(at).toISOString(),ends_at:new Date(at+minutes*60000).toISOString(),weekday:new Date((today+d)*DAY).getUTCDay(),slot:Math.floor(m/360),minutes});}
 return out;
}
export function rankSlots(state:AttendanceState,slots:Slot[],user:string,studyDay:string):{slot:Slot;score:number;p:number;evidence:string}[]{
 const rng=seeded(hash(user+':'+studyDay)),draw=state.m.map((m,i)=>m+Math.sqrt(state.v[i])*Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(2*Math.PI*rng()));
 return slots.map(slot=>{const x=attendanceFeatures(slot),p=sigmoid(x.reduce((z,v,i)=>z+v*draw[i],0));return {slot,score:p*slot.minutes*Math.exp(-.1+.25**2/2),p,evidence:'kept '+(slot.recentKept??0)+' of '+(slot.recentTotal??0)+' recent'};}).sort((a,b)=>b.score-a.score||a.slot.starts_at.localeCompare(b.slot.starts_at)||a.slot.id.localeCompare(b.slot.id)).slice(0,2);
}
export function freeSlots(windows:Slot[],busy:{starts_at:string;ends_at:string}[]):Slot[]{
 const out:Slot[]=[];for(const w of windows){let fragments:[number,number][]=[[Date.parse(w.starts_at),Date.parse(w.ends_at)]];for(const b of busy){const lo=Date.parse(b.starts_at),hi=Date.parse(b.ends_at);fragments=fragments.flatMap(([a,z])=>hi<=a||lo>=z?[[a,z]] as [number,number][]:[...(lo>a?[[a,lo]] as [number,number][]:[]),...(hi<z?[[hi,z]] as [number,number][]:[])]);}
 for(const [lo,hi] of fragments)if(hi-lo>=15*60000)out.push({...w,id:w.id+':'+lo,starts_at:new Date(lo).toISOString(),ends_at:new Date(hi).toISOString(),minutes:(hi-lo)/60000});}return out;
}
