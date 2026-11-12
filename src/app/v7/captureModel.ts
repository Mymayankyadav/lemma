/** PLAN §6.1 F. The local, rule-based capture recogniser. No network, no model: dates, times, lengths, "#path" and "front :: back". */
export type CaptureKind='task'|'block'|'card'|'thought';
export const captureKinds:readonly CaptureKind[]=['task','block','card','thought'];
export const kindLabel:Readonly<Record<CaptureKind,string>>={task:'Task',block:'Time block',card:'Card',thought:'Thought'};
export const addLabel:Readonly<Record<CaptureKind,string>>={task:'Add task',block:'Add block',card:'Add card',thought:'Park thought'};
export interface CapturePath{id:string;slug:string;title:string}
export interface CaptureToken{id:string;type:'date'|'time'|'length'|'path';label:string;raw:string}
export interface CaptureContext{now:Date;zone:string;paths:readonly CapturePath[];session:boolean}
export interface CaptureParse{
 title:string;kind:CaptureKind;tokens:CaptureToken[];date:string|null;time:string|null;minutes:number|null;path:CapturePath|null;
 front:string;back:string;
}
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad=(n:number)=>String(n).padStart(2,'0');
/** Civil date parts of an instant in a zone. */
export function civil(now:Date,zone:string):{y:number;m:number;d:number;weekday:number}{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now);
 const pick=(type:string)=>parts.find(part=>part.type===type)?.value??'';
 return {y:Number(pick('year')),m:Number(pick('month')),d:Number(pick('day')),weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(pick('weekday'))};
}
const keyOf=(y:number,m:number,d:number)=>y+'-'+pad(m)+'-'+pad(d);
export function addDays(date:string,days:number):string{
 const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
}
interface Hit{start:number;end:number;token:CaptureToken;date?:string;time?:string;minutes?:number;path?:CapturePath}
const label=(date:string,today:string)=>{
 if(date===today)return 'Today';if(date===addDays(today,1))return 'Tomorrow';
 const [y,m,d]=date.split('-').map(Number);return new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(Date.UTC(y,m-1,d)));
};
/** Recognised parts become tokens. A token the owner removed (its id is in `ignore`) goes back into the title. */
export function parseCapture(text:string,context:CaptureContext,ignore:ReadonlySet<string>=new Set(),forced:CaptureKind|null=null):CaptureParse{
 const today=(()=>{const c=civil(context.now,context.zone);return keyOf(c.y,c.m,c.d);})(),todayWeekday=civil(context.now,context.zone).weekday;
 const hits:Hit[]=[];
 const add=(match:RegExpExecArray,extend:number,build:(raw:string)=>Omit<Hit,'start'|'end'|'token'>&{type:CaptureToken['type'];label:string})=>{
  const start=match.index-extend,raw=text.slice(start,match.index+match[0].length),made=build(match[0]);
  const id=made.type+':'+match[0].toLowerCase();
  if(ignore.has(id))return;
  if(hits.some(hit=>start<hit.end&&match.index+match[0].length>hit.start))return;
  hits.push({start,end:match.index+match[0].length,date:made.date,time:made.time,minutes:made.minutes,path:made.path,token:{id,type:made.type,label:made.label,raw}});
 };
 const scan=(pattern:RegExp,fn:(match:RegExpExecArray)=>void)=>{pattern.lastIndex=0;let match:RegExpExecArray|null;while((match=pattern.exec(text)))fn(match);};
 // "#real" names a path by the start of its title or slug (never a bare number such as #4).
 scan(/(^|\s)#([\p{L}][\p{L}\p{N}-]*)/gu,match=>{
  const word=match[2].toLowerCase(),path=context.paths.find(item=>item.slug.toLowerCase().startsWith(word)||item.title.toLowerCase().startsWith(word))??
   context.paths.find(item=>item.title.toLowerCase().split(/\s+/).some(part=>part.startsWith(word)));
  if(!path)return;
  const index=match.index+match[1].length,raw='#'+match[2];
  const id='path:'+raw.toLowerCase();if(ignore.has(id)||hits.some(hit=>index<hit.end&&index+raw.length>hit.start))return;
  hits.push({start:index,end:index+raw.length,path,token:{id,type:'path',label:path.title,raw}});
 });
 // Lengths: "1h30", "1 h 30 min", "90m", "45 min", "2 hours", optionally after "for".
 scan(/\b(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)(?:\s*(\d{1,2})(?:\s*(?:m|min|mins|minutes))?)?|(\d{1,3})\s*(?:m|min|mins|minutes))\b/gi,match=>{
  const minutes=match[3]?Number(match[3]):Math.round(Number(match[1])*60+(match[2]?Number(match[2]):0));
  if(!(minutes>=5&&minutes<=720))return;
  const before=text.slice(0,match.index),forWord=/\bfor\s+$/i.exec(before);
  add(match,forWord?forWord[0].length:0,()=>({type:'length',label:minutes>=60&&minutes%60===0?minutes/60+' h':minutes+' min',minutes}));
 });
 // Times: 16:00, 4pm, 4:30 pm, with an optional "at".
 scan(/\b(?:([01]?\d|2[0-3]):([0-5]\d)(?:\s*([ap]m))?|(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap]m))\b/gi,match=>{
  let hour:number,minute:number;
  if(match[1]!==undefined){hour=Number(match[1]);minute=Number(match[2]);const mer=match[3]?.toLowerCase();if(mer){if(hour<1||hour>12)return;hour=hour%12+(mer==='pm'?12:0);}}
  else{hour=Number(match[4])%12+(match[6].toLowerCase()==='pm'?12:0);minute=match[5]?Number(match[5]):0;}
  const atWord=/\bat\s+$/i.exec(text.slice(0,match.index));
  add(match,atWord?atWord[0].length:0,()=>({type:'time',label:pad(hour)+':'+pad(minute),time:pad(hour)+':'+pad(minute)}));
 });
 // Dates: today, tomorrow, weekday names, "9 Nov", "Nov 9".
 scan(/\b(today|tomorrow|tonight)\b/gi,match=>{
  const word=match[1].toLowerCase(),date=word==='tomorrow'?addDays(today,1):today;
  add(match,0,()=>({type:'date',label:label(date,today),date}));
 });
 scan(new RegExp('\\b(?:(next)\\s+)?('+weekdays.map(name=>name.slice(0,3)+'(?:'+name.slice(3)+')?').join('|')+')\\b','gi'),match=>{
  const target=weekdays.findIndex(name=>name.startsWith(match[2].toLowerCase().slice(0,3)));
  let ahead=(target-todayWeekday+7)%7;if(match[1]&&ahead===0)ahead=7;
  const date=addDays(today,ahead);
  add(match,0,()=>({type:'date',label:label(date,today),date}));
 });
 const dayMonth=(day:number,month:number)=>{
  const c=Number(today.slice(0,4));let date=keyOf(c,month,day);if(date<today)date=keyOf(c+1,month,day);
  const check=new Date(date+'T00:00:00Z');return check.getUTCDate()===day?date:null;
 };
 scan(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+('+months.join('|')+')[a-z]*\\b','gi'),match=>{
  const date=dayMonth(Number(match[1]),months.indexOf(match[2].toLowerCase())+1);if(!date)return;
  add(match,0,()=>({type:'date',label:label(date,today),date}));
 });
 scan(new RegExp('\\b('+months.join('|')+')[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b','gi'),match=>{
  const date=dayMonth(Number(match[2]),months.indexOf(match[1].toLowerCase())+1);if(!date)return;
  add(match,0,()=>({type:'date',label:label(date,today),date}));
 });
 hits.sort((a,b)=>a.start-b.start);
 let title='',at=0;
 for(const hit of hits){title+=text.slice(at,hit.start);at=hit.end;}
 title=(title+text.slice(at)).replace(/\s+/g,' ').trim();
 const date=hits.find(hit=>hit.date)?.date??null,time=hits.find(hit=>hit.time)?.time??null,minutes=hits.find(hit=>hit.minutes)?.minutes??null,path=hits.find(hit=>hit.path)?.path??null;
 const split=text.indexOf('::'),front=split>=0?text.slice(0,split).trim():'',back=split>=0?text.slice(split+2).trim():'';
 const detected:CaptureKind=split>=0?'card':time||minutes?'block':context.session?'thought':'task';
 return {title,kind:forced??detected,tokens:hits.map(hit=>hit.token),date,time,minutes,path,front,back};
}
/** The default start when no time was given: the next free half hour for today, otherwise 09:00. */
export function defaultStart(date:string|null,time:string|null,context:{now:Date;zone:string}):{date:string;time:string}{
 const c=civil(context.now,context.zone),today=keyOf(c.y,c.m,c.d),day=date??today;
 if(time)return {date:day,time};
 if(day!==today)return {date:day,time:'09:00'};
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:context.zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(context.now);
 const hour=Number(parts.find(part=>part.type==='hour')?.value),minute=Number(parts.find(part=>part.type==='minute')?.value);
 const total=Math.ceil((hour*60+minute+1)/30)*30;
 return total>=1440?{date:addDays(today,1),time:'09:00'}:{date:today,time:pad(Math.floor(total/60))+':'+pad(total%60)};
}
export {monthNames};
