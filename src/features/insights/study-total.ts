import {formatCount} from '../../lib/text';

/** Compact *visible* value for narrow Insights tiles, with a lossless
 * screen-reader equivalent. Never use the abbreviated value as the stored
 * duration or as a replacement for the precise accessible total.
 */
export function compactStudyTotal(minutes:number):{short:string;exact:string}{
 if(!Number.isFinite(minutes))return {short:'—',exact:'Study time unavailable'};
 const total=Math.max(0,Math.round(minutes));
 const days=Math.floor(total/1440);
 const hours=Math.floor((total%1440)/60);
 const rest=total%60;
 const exact=[
  days?formatCount(days)+' '+(days===1?'day':'days'):null,
  hours?hours+' '+(hours===1?'hour':'hours'):null,
  rest||!days&&!hours?rest+' '+(rest===1?'minute':'minutes'):null,
 ].filter(Boolean).join(', ');
 const short=days>=1000
  ? String(Math.round(days/100)/10)+'k d'
  : days?formatCount(days)+' d'
  : hours?formatCount(hours)+' h'
  : total+' m';
 return {short,exact};
}
