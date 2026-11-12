import type {CalendarBlockRecord} from '../../../data/study/contract';

/** PLAN §6.2. Pure rules for Today, so each hero state and the briefing are testable from data. */
export function todayGreeting(now:Date,zone:string):string{
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
 return hour>=17||hour<4?'Good evening':hour>=12?'Good afternoon':'Good morning';
}
const plural=(n:number,one:string,many=one+'s')=>n+' '+(n===1?one:many);
/** Short sentences (TD3): first what comes next — a running session or the next block — then the counts, in priority order
 *  (study blocks left, cards due, overdue items). "1 study block left" is left out when that block is the next one. */
export function todayBriefing(facts:{session:'Focus'|'Break'|'Paused'|null;nextIn:string|null;studyBlocksLeft:number;due:number;overdue:number}):string{
 const sentences:string[]=[];
 if(facts.session)sentences.push(facts.session==='Focus'?'Your focus session is running.':facts.session==='Break'?'You are on a break.':'Your focus session is paused.');
 else if(facts.nextIn)sentences.push('Next block '+facts.nextIn+'.');
 const counts:string[]=[];
 const blocksLeft=facts.nextIn?facts.studyBlocksLeft-1:facts.studyBlocksLeft;
 if(blocksLeft>0)counts.push(facts.nextIn?plural(blocksLeft,'more study block'):plural(blocksLeft,'study block')+' left');
 if(facts.due>0)counts.push(plural(facts.due,'card')+' due');
 if(facts.overdue>0)counts.push(plural(facts.overdue,'thing')+' overdue');
 const kept=counts.slice(0,sentences.length?2:3);
 if(kept.length){const text=kept.length===1?kept[0]:kept.slice(0,-1).join(', ')+' and '+kept[kept.length-1];sentences.push(text[0].toUpperCase()+text.slice(1)+'.');}
 if(!sentences.length)return 'Nothing scheduled. A good day to get ahead.';
 return sentences.join(' ');
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
/** PA10: the day strip covers the owner's planning window, widened to whole hours that fit the day's blocks and now
 *  (falls back to 06:00–24:00). Minutes since local midnight. */
export function stripWindow(input:{start?:string|null;end?:string|null;blocks:readonly [number,number][];now:number}):[number,number]{
 const parse=(value:string|null|undefined,fallback:number)=>{const m=/^(\d\d):(\d\d)/.exec(value??'');return m?Number(m[1])*60+Number(m[2]):fallback;};
 let from=parse(input.start,360),to=parse(input.end,1440);if(to<=from)to=1440;
 for(const [a,b] of input.blocks){from=Math.min(from,a);to=Math.max(to,b);}
 from=Math.min(from,input.now);to=Math.max(to,input.now+30);
 from=Math.max(0,Math.floor(from/60)*60);to=Math.min(1440,Math.ceil(to/60)*60);
 if(to-from<180)to=Math.min(1440,from+180);
 return [from,to];
}
/** Up to seven evenly spaced hour labels across the window. */
export function stripHours([from,to]:[number,number]):string[]{
 const hours=(to-from)/60,step=Math.max(1,Math.ceil(hours/6)),out:string[]=[];
 for(let h=from/60;h<=to/60;h+=step)out.push(String(h).padStart(2,'0'));
 return out;
}
export function stripSegment(start:number,end:number,window:[number,number]=[360,1440]):{left:number;width:number}{
 const [lo,hi]=window,span=(hi-lo)/100,clip=(minutes:number)=>Math.min(hi,Math.max(lo,minutes)),from=clip(start),to=clip(end);
 return {left:(from-lo)/span,width:Math.max(0,to-from)/span};
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
