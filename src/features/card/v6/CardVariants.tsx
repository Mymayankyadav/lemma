import {useState} from 'react';
import type {NoteStatus} from '../../../data/types';

/** Every sibling card has its own scheduler state; never substitute the first
 * variant for a reverse/cloze sibling. This remains display-only for scheduling:
 * note edits and suspension use the already audited LemmaApi mutations. */
export interface CardVariant {
 ordinal:number;due:string|null;stability:number;
 difficulty?:number;state?:string;lastReview?:string|null;reps?:number;lapses?:number;
}
export function describeDue(value:string|null,now=Date.now()):string{
 if(!value)return 'Not scheduled';
 const milliseconds=Date.parse(value);
 if(!Number.isFinite(milliseconds))return 'Unavailable';
 const days=Math.ceil((milliseconds-now)/86400000);
 return days<=0?'Due now':days===1?'Tomorrow':'In '+days+' days';
}
const duration=(value:number)=>Number.isFinite(value)&&value>0?
 Math.round(value)+' d':'New';
const count=(value:number|undefined):number=>typeof value==='number'&&
 Number.isSafeInteger(value)&&value>=0?value:0;
export default function CardVariants({
 variants,status,onEdit,onToggleStatus,busy=false,
}:{
 variants:readonly CardVariant[];
 status?:NoteStatus;
 onEdit?:()=>void;onToggleStatus?:()=>void;busy?:boolean;
}){
 const [expanded,setExpanded]=useState(true);
 const ordered=[...variants].sort((a,b)=>a.ordinal-b.ordinal);
 return <section aria-label="Card variants" className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
  <button type="button" aria-expanded={expanded}
   onClick={()=>setExpanded(v=>!v)}
   className="flex min-h-11 w-full items-center justify-between text-left text-label font-semibold">
   <span>Card variants ({ordered.length})</span>
   <span aria-hidden="true">{expanded?'−':'+'}</span>
  </button>
  {expanded&&(ordered.length?<ol className="mt-2 space-y-3">
   {ordered.map(card=><li key={card.ordinal} aria-label={'Variant '+card.ordinal}
     className="border-t border-edge pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <span className="text-label font-semibold">Variant {card.ordinal}</span>
     <span className="text-label text-ink-2">{describeDue(card.due)}</span>
    </div>
    <dl className="mt-2 grid grid-cols-2 gap-2 text-caption text-ink-3 sm:grid-cols-4">
     <div><dt>Schedule</dt><dd className="text-ink">{card.state?.replaceAll('_',' ')??'Unknown'}</dd></div>
     <div><dt>Stability</dt><dd className="text-ink">{card.stability>0?duration(card.stability)+" stable":"New"}</dd></div>
     <div><dt>Reviews</dt><dd className="text-ink tabular-nums">{count(card.reps)}</dd></div>
     <div><dt>Lapses</dt><dd className="text-ink tabular-nums">{count(card.lapses)}</dd></div>
    </dl>
    {card.lastReview&&Number.isFinite(Date.parse(card.lastReview))&&
     <p className="mt-1 text-caption text-ink-3">
      Last reviewed: <time dateTime={card.lastReview}>{new Date(card.lastReview).toLocaleDateString()}</time>
     </p>}
   </li>)}
  </ol>:<p className="mt-2 text-label text-ink-3">No scheduled variants yet.</p>)}
  {(onEdit||onToggleStatus)&&<div className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-3">
   {onEdit&&<button type="button" disabled={busy} onClick={onEdit}
    className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50">
    Edit note and preview math</button>}
   {onToggleStatus&&status!=='deleted'&&<button type="button" disabled={busy}
    onClick={onToggleStatus} className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50">
    {status==='suspended'?'Restore card':'Suspend card'}</button>}
  </div>}
 </section>;
}
