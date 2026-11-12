import type {CalendarBlockRecord} from '../../../data/study/contract';
import {calendarRange,shiftDay} from '../model';

/** Pure rules for the v7 Calendar Day, so the strip, drops and toasts are testable from data. */
export interface WeekCell{day:string;initial:string;number:number;long:string}
export function weekCells(weekStart:string):WeekCell[]{
 return Array.from({length:7},(_,index)=>{
  const day=shiftDay(weekStart,index),at=new Date(day+'T00:00:00.000Z');
  return {day,initial:new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'narrow'}).format(at),number:at.getUTCDate(),
   long:new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(at)};
 });
}
export function monthLabel(day:string):string{
 return new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(day+'T00:00:00.000Z'));
}
/** Dropping on another day keeps the time of day (by elapsed time from that day's start) and any pending 15-minute shift. */
export function moveToDay(block:Pick<CalendarBlockRecord,'startsAt'|'endsAt'>,from:string,to:string,deltaMinutes:number,zone:string):{startsAt:string;endsAt:string}{
 const shift=Date.parse(calendarRange(to,zone).start)-Date.parse(calendarRange(from,zone).start)+deltaMinutes*60_000;
 return {startsAt:new Date(Date.parse(block.startsAt)+shift).toISOString(),endsAt:new Date(Date.parse(block.endsAt)+shift).toISOString()};
}
/** "Moved to 16:00–17:30". */
export function movedLabel(startsAt:string,endsAt:string,clock:(instant:string)=>string):string{
 return 'Moved to '+clock(startsAt)+'–'+clock(endsAt);
}
