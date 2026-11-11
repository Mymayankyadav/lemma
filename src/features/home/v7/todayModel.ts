import type {CalendarBlockRecord} from '../../../data/study/contract';

/** PLAN §6.2. Pure rules for Today, so each hero state and the briefing are testable from data. */
export function todayGreeting(now:Date,zone:string):string{
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
 return hour>=17||hour<4?'Good evening':hour>=12?'Good afternoon':'Good morning';
}
const plural=(n:number,one:string,many=one+'s')=>n+' '+(n===1?one:many);
const numberWords=['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'];
const counted=(n:number,one:string,many=one+'s')=>(n<=10?numberWords[n]:String(n))+' '+(n===1?one:many);
/** Up to three facts, in priority order: a running session, the next block, blocks left, cards due, overdue items. */
export function todayBriefing(facts:{session:'Focus'|'Break'|'Paused'|null;nextIn:string|null;studyBlocksLeft:number;due:number;overdue:number}):string{
 const parts:string[]=[];
 if(facts.session)parts.push(facts.session==='Focus'?'Your focus session is running':facts.session==='Break'?'You are on a break':'Your focus session is paused');
 else if(facts.nextIn)parts.push('Your next block starts '+facts.nextIn);
 if(facts.studyBlocksLeft>0)parts.push(parts.length?plural(facts.studyBlocksLeft,'study block')+' left':counted(facts.studyBlocksLeft,'study block')+' left');
 if(facts.due>0&&parts.length<3)parts.push(plural(facts.due,'card')+' due');
 if(facts.overdue>0&&parts.length<3)parts.push(facts.overdue+' things overdue');
 if(!parts.length)return 'Nothing scheduled. A good day to get ahead.';
 const [first,...rest]=parts;
 const tail=rest.length===0?'':rest.length===1?' and '+rest[0]:', '+rest.slice(0,-1).join(', ')+' and '+rest[rest.length-1];
 return first+tail+'.';
}
export type HeroState='session'|'now'|'upcoming'|'closed'|'free'|'first';
export function heroState(input:{session:boolean;next:CalendarBlockRecord|null;now:number;closed:boolean;hasPaths:boolean}):HeroState{
 if(input.session)return 'session';
 if(!input.hasPaths)return 'first';
 if(input.closed)return 'closed';
 if(input.next)return Date.parse(input.next.startsAt)<=input.now?'now':'upcoming';
 return 'free';
}
/** "in 1 h 17 min", "in 5 min". */
export function startsIn(startsAt:string,now:number):string{
 const minutes=Math.max(1,Math.round((Date.parse(startsAt)-now)/60_000)),h=Math.floor(minutes/60),m=minutes%60;
 return 'in '+(h?h+' h'+(m?' '+m+' min':''):m+' min');
}
/** The next study block that has not ended, among planned blocks. */
export function nextStudyBlock(blocks:readonly CalendarBlockRecord[],now:number):CalendarBlockRecord|null{
 return [...blocks].filter(block=>block.kind==='study'&&block.status==='planned'&&Date.parse(block.endsAt)>now)
  .sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0]??null;
}
/** The day strip covers 06:00–24:00; segments are clipped to it (minutes since local midnight). */
export function stripSegment(start:number,end:number):{left:number;width:number}{
 const clip=(minutes:number)=>Math.min(1440,Math.max(360,minutes)),from=clip(start),to=clip(end);
 return {left:(from-360)/10.8,width:Math.max(0,to-from)/10.8};
}
export function localMinute(instant:string|Date,zone:string):number{
 const date=typeof instant==='string'?new Date(instant):instant;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const value=(type:string)=>Number(parts.find(part=>part.type===type)?.value??0);
 return (value('hour')%24)*60+value('minute');
}
export function localDay(zone:string,now=new Date()):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const pick=(type:string)=>parts.find(part=>part.type===type)?.value??'';
 return pick('year')+'-'+pick('month')+'-'+pick('day');
}
export function clockTime(instant:string,zone:string):string{
 return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
}
export function minutesLabel(minutes:number):string{
 const m=Math.max(0,Math.round(minutes)),h=Math.floor(m/60),r=m%60;
 return h?h+' h'+(r?' '+r+' min':''):r+' min';
}
