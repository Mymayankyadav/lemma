import {useState} from 'react';
/** N84: show every sibling card's independent FSRS scheduling state.
 * Card-edit, comment, suspend and reset continue to use the existing actions. */
export interface CardVariant {
 ordinal:number;due:string|null;stability:number;
}
export function describeDue(value:string|null,now=Date.now()):string{
 if(!value)return 'Not scheduled';
 const milliseconds=Date.parse(value);
 if(!Number.isFinite(milliseconds))return 'Unavailable';
 const days=Math.ceil((milliseconds-now)/86400000);
 return days<=0?'Due now':days===1?'Tomorrow':'In '+days+' days';
}
export default function CardVariants({variants}:{variants:readonly CardVariant[]}){
 const [expanded,setExpanded]=useState(true);
 const ordered=[...variants].sort((a,b)=>a.ordinal-b.ordinal);
 return <section aria-label="Card variants" className="rounded-ctl border border-edge p-3">
  <button type="button" aria-expanded={expanded}
   onClick={()=>setExpanded(v=>!v)}
   className="flex min-h-11 w-full items-center justify-between text-left text-label font-semibold">
   <span>Card variants ({ordered.length})</span>
   <span aria-hidden="true">{expanded?'−':'+'}</span>
  </button>
  {expanded&&(ordered.length?<ol className="mt-2 space-y-2">
   {ordered.map(card=><li key={card.ordinal} className="flex items-center justify-between gap-3 border-t border-edge py-2">
    <span className="text-label">Variant {card.ordinal}</span>
    <span className="text-label text-ink-2">{describeDue(card.due)}</span>
    <span className="text-caption text-ink-3">{card.stability>0?Math.round(card.stability)+' d stable':'New'}</span>
   </li>)}
  </ol>:<p className="text-label text-ink-3">No scheduled variants yet.</p>)}
 </section>;
}
