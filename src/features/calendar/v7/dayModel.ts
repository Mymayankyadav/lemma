import {localClockInstant,localWallParts} from '../../time-log/local-time';
import type {CalendarBlockRecord} from '../../../data/study/contract';
import {shiftDay} from '../model';

/** Pure rules for the v7 Calendar Day, so the strip, drops and toasts are testable from data. */
export interface WeekCell{day:string;initial:string;number:number;long:string}
const weekdayInitial=new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'narrow'});
const dayDescription=new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
export function weekCells(weekStart:string):WeekCell[]{
 return Array.from({length:7},(_,index)=>{
  const day=shiftDay(weekStart,index),at=new Date(day+'T00:00:00.000Z');
  return {day,initial:weekdayInitial.format(at),number:at.getUTCDate(),long:dayDescription.format(at)};
 });
}
export function monthLabel(day:string):string{
 return new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(day+'T00:00:00.000Z'));
}
/** Dropping on another day keeps the time of day (by elapsed time from that day's start) and any pending 15-minute shift. */
export function moveToDay(block:Pick<CalendarBlockRecord,'startsAt'|'endsAt'>,from:string,to:string,deltaMinutes:number,zone:string):{startsAt:string;endsAt:string}{
 void from;
 const target=localClockInstant(to,localWallParts(block.startsAt,zone).clock,zone);
 if(!target)throw Error('That local time does not exist on the selected day.');
 const start=Date.parse(target)+deltaMinutes*60000,duration=Date.parse(block.endsAt)-Date.parse(block.startsAt);
 return {startsAt:new Date(start).toISOString(),endsAt:new Date(start+duration).toISOString()};
}
/** "Moved to 16:00–17:30". */
export function movedLabel(startsAt:string,endsAt:string,clock:(instant:string)=>string):string{
 return 'Moved to '+clock(startsAt)+'–'+clock(endsAt);
}

/** The shared grid anchor records a civil time, even when a day has 23 or 25 hours. */
export function wallMinuteAt(ms:number,zone:string):number{
 const [hour,minute]=localWallParts(new Date(ms).toISOString(),zone).clock.split(':').map(Number);
 return hour*60+minute+(ms%60_000+60_000)%60_000/60_000;
}
export function elapsedMinuteAt(day:string,zone:string,from:number,wallMinute:number):number{
 const minute=Math.max(0,Math.min(1439,Math.floor(wallMinute)));
 const clock=Math.floor(minute/60).toString().padStart(2,'0')+':'+(minute%60).toString().padStart(2,'0');
 const instant=localClockInstant(day,clock,zone);
 // At a skipped clock time preserve the nearest visible hour without discarding the shared anchor.
 return instant?(Date.parse(instant)-from)/60_000+wallMinute-minute:minute;
}
