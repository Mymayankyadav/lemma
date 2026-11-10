import {useId} from 'react';
import {emblemStrokes, emblemKind, emblemHash, type EmblemKind} from './emblem';
import './emblem.css';

/** Decorative mathematical art: identity and status are also conveyed in text. */
export function Emblem({subject, seed, kind=emblemKind(subject), size=96, animate=true, focus=false}:{subject:string;seed:string;kind?:EmblemKind;size?:number;animate?:boolean;focus?:boolean}) {
 const id=useId().replace(/:/g,'');
 return <svg aria-hidden="true" width={size} height={size} style={{width:size,height:size}} viewBox="0 0 200 200" fill="none" className={`v7-emblem${animate?' v7-emblem-draw':''}${focus?' v7-emblem-focus':''}`}>
  <defs>
   <clipPath id={`${id}-clip`}><circle cx="100" cy="100" r="98"/></clipPath>
   <linearGradient id={`${id}-gradient`}><stop stopColor="currentColor"/><stop className="v7-emblem-highlight" offset="1" stopColor="color-mix(in srgb, currentColor 45%, white)"/></linearGradient>
  </defs>
  <g clipPath={`url(#${id}-clip)`} className="v7-emblem-ink" stroke={`url(#${id}-gradient)`} transform={`rotate(${emblemHash(seed)%360} 100 100)`}>{emblemStrokes(subject,seed,kind).map((s,i)=><path key={i} d={s.d} strokeWidth={s.width} opacity={s.opacity} pathLength={1}/>)}</g>
 </svg>;
}
