import type {CSSProperties} from 'react';

const utc=(day:string)=>new Date(day+'T12:00:00Z');
const thisYear=()=>new Date().getUTCFullYear();
/** "Mon, Nov 9" for a civil day key; the year only when it is not this year (#1331, mockup order). */
export function civilDayLabel(day:string,now:Date=new Date()):string{
 const year=Number(day.slice(0,4));
 return new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',
  ...(year===now.getUTCFullYear()?{}:{year:'numeric' as const})}).format(utc(day));
}
/** "Nov 9 – 15", "Nov 30 – Dec 6", "Dec 28, 2026 – Jan 3, 2027". */
export function civilRangeLabel(from:string,to:string):string{
 const [fy,fm]=[from.slice(0,4),from.slice(5,7)],[ty,tm]=[to.slice(0,4),to.slice(5,7)];
 const md=(day:string,year:boolean)=>new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'short',day:'numeric',
  ...(year?{year:'numeric' as const}:{})}).format(utc(day));
 const showYear=fy!==ty||Number(fy)!==thisYear();
 if(fy===ty&&fm===tm&&!showYear)return md(from,false)+' – '+Number(to.slice(8,10));
 return md(from,showYear)+' – '+md(to,showYear);
}
/** "November 2026". */
export function civilMonthLabel(day:string):string{
 return new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'long',year:'numeric'}).format(utc(day));
}
/** Deterministic subject colour from the token palette (N121 B3/B6); no stripe without a subject. */
const palette=['var(--accent)','var(--good,#3f8f6b)','var(--easy,#4d7cc7)','var(--warn,#b7791f)','var(--again,#c0504d)','var(--link,#6b5bd2)'];
export function subjectColor(subjectId:string|null|undefined):string|null{
 if(!subjectId)return null;
 let hash=0;for(const char of subjectId)hash=(hash*31+char.charCodeAt(0))>>>0;
 return palette[hash%palette.length];
}
export function subjectStripe(subjectId:string|null|undefined):CSSProperties|undefined{
 const color=subjectColor(subjectId);
 return color?{boxShadow:'inset -4px 0 0 '+color}:undefined;
}
