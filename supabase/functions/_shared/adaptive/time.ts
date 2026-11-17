// Time model (spec §5). Pure: no clock, no I/O. Every date or count the tutor
// sees comes from here (invariant I1).
import {addDays,diffDays,isDay,weekdayName,weekdayIndex,daysBetween,type DateStr} from './dates.ts';

export type TimeSettings={time_zone?:string|null;rollover_hour?:number|null};
/** Local study day of an instant: wall clock in the zone, minus the rollover hour. */
export function studyDay(s:TimeSettings,at:Date|number|string):DateStr{
  const zone=s?.time_zone||'UTC',rollover=s?.rollover_hour??4,now=new Date(at);
  try{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const get=(f:string)=>Number(parts.find(x=>x.type===f)?.value||0);
    const wall=new Date(Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second')));
    wall.setUTCHours(wall.getUTCHours()-rollover);
    return wall.toISOString().slice(0,10);
  }catch{return new Date(now.getTime()-rollover*3600000).toISOString().slice(0,10)}
}
/** Calendar date of an instant in the zone (no rollover): used for deadlines. */
export function localDate(zone:string|null|undefined,at:Date|number|string):DateStr{
  return studyDay({time_zone:zone,rollover_hour:0},at);
}
/** Minutes since midnight of `HH:MM`. */
export function clock(text:string|undefined|null,fallback:number):number{
  const m=/^(\d{1,2}):(\d{2})$/.exec(text||'');return m?Math.min(1440,Number(m[1])*60+Number(m[2])):fallback;
}
export type CapacityConfig={
  weekdayMinutes?:number[]|null;          // Mon..Sun defaults; null/absent = unset
  overrides?:Record<DateStr,number>;      // capacity_overrides
  windowStart?:string|null;windowEnd?:string|null; // settings.planning
  busy?:Record<DateStr,number>;           // minutes covered by calendar_blocks per day
};
export type Capacity={minutes:number;configured:boolean};
/** capacity(d) = min(override or weekday default, window minutes − busy). Gross (before today's logged time). */
export function capacityOn(d:DateStr,c:CapacityConfig):Capacity{
  const override=c.overrides?.[d];
  const dflt=c.weekdayMinutes&&c.weekdayMinutes.length===7?c.weekdayMinutes[weekdayIndex(d)]:undefined;
  const base=override??dflt;
  if(base===undefined||base===null||!Number.isFinite(base))return {minutes:0,configured:false};
  const win=Math.max(0,clock(c.windowEnd,22*60)-clock(c.windowStart,8*60));
  const free=Math.max(0,win-Math.max(0,c.busy?.[d]??0));
  return {minutes:Math.max(0,Math.min(Math.round(base),free)),configured:true};
}
export type ProjectTime={
  deadlineDate:DateStr|null;lastStudyOn:DateStr|null;confirmed:boolean;
};
/** deadline_at (timestamptz) → local date; target_date is the compatible fallback. */
export function projectTime(p:{deadline_at?:string|null;last_study_on?:string|null;target_date?:string|null;time_confirmed?:boolean|null},zone:string|null|undefined):ProjectTime{
  const target=p.target_date?String(p.target_date).slice(0,10):null;
  const deadlineDate=p.deadline_at?localDate(zone,p.deadline_at):(target&&isDay(target)?target:null);
  const last=p.last_study_on?String(p.last_study_on).slice(0,10):null;
  return {deadlineDate,lastStudyOn:last&&isDay(last)?last:deadlineDate,confirmed:p.time_confirmed===true};
}
/** Study days left including today; 0 once past. */
export function studyDaysLeft(today:DateStr,lastStudyOn:DateStr|null):number{
  return lastStudyOn?Math.max(0,diffDays(lastStudyOn,today)+1):0;
}
export type Mode='normal'|'deadline_today'|'post_deadline'|'no_deadline';
export function modeOf(today:DateStr,t:ProjectTime):Mode{
  if(!t.lastStudyOn)return 'no_deadline';
  if(today>t.lastStudyOn)return 'post_deadline';
  if(t.deadlineDate&&today>=t.deadlineDate)return 'deadline_today';
  return 'normal';
}
export type BaselineEntry={checkpoint_id:string;due_on:DateStr|null};
export type TimeCp={id:string;code:string;done:boolean;inactive:boolean;position:number};
export type TimeInput={
  today:DateStr;zone:string;project:ProjectTime;firstSession:DateStr|null;
  cps:TimeCp[];baseline:BaselineEntry[];capacityToday:Capacity;usedToday:number;
};
const cap=(items:string[],max:number)=>items.length>max?[...items.slice(0,max),'+'+(items.length-max)+' more']:items;
/** Fixed-format TIME block (spec §5). No pace, forecast or projected finish. */
export function timeBlock(i:TimeInput):string{
  const due=new Map(i.baseline.map(b=>[b.checkpoint_id,b.due_on]));
  const open=i.cps.filter(c=>!c.done&&!c.inactive).sort((a,b)=>a.position-b.position);
  const dueToday=open.filter(c=>due.get(c.id)===i.today).map(c=>c.code);
  const overdue=open.filter(c=>{const d=due.get(c.id);return d&&d<i.today}).map(c=>c.code+':+'+diffDays(i.today,due.get(c.id) as string)+'d');
  const fmt=(d:DateStr|null)=>d??'none';
  const days=studyDaysLeft(i.today,i.project.lastStudyOn);
  return [
    'TIME today='+i.today+' ('+weekdayName(i.today)+') tz='+i.zone,
    'deadline='+fmt(i.project.deadlineDate)+' last_study='+fmt(i.project.lastStudyOn)+' study_days_left='+days+' (incl. today)',
    'first_session='+fmt(i.firstSession),
    'due_today=['+dueToday.join(',')+'] overdue_vs_baseline=['+cap(overdue,8).join(',')+']',
    'capacity_today='+(i.capacityToday.configured?i.capacityToday.minutes+'m':'unset')+' used_today='+Math.max(0,Math.round(i.usedToday))+'m'
  ].join('\n');
}
export {addDays,daysBetween};
