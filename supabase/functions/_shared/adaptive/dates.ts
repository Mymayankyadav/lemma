// Pure date helpers on YYYY-MM-DD strings (no time zone, no Date.now()).
export type DateStr=string;
const MS=86400000;
export const parseDay=(d:DateStr):number=>Date.parse(d+'T00:00:00Z');
export function isDay(d:unknown):d is DateStr{
  return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(parseDay(d))&&
    new Date(parseDay(d)).toISOString().slice(0,10)===d;
}
export function addDays(d:DateStr,n:number):DateStr{
  return new Date(parseDay(d)+Math.trunc(n)*MS).toISOString().slice(0,10);
}
/** a − b in whole days. */
export const diffDays=(a:DateStr,b:DateStr):number=>Math.round((parseDay(a)-parseDay(b))/MS);
export const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(d:DateStr):number{return (new Date(parseDay(d)).getUTCDay()+6)%7}
export const weekdayName=(d:DateStr):string=>WEEKDAYS[weekdayIndex(d)];
export const maxDay=(a:DateStr,b:DateStr):DateStr=>a>=b?a:b;
export const minDay=(a:DateStr,b:DateStr):DateStr=>a<=b?a:b;
/** Inclusive list of days from a to b ([] when b<a). */
export function daysBetween(a:DateStr,b:DateStr):DateStr[]{
  const out:DateStr[]=[];for(let d=a;d<=b&&out.length<4000;d=addDays(d,1))out.push(d);return out;
}
