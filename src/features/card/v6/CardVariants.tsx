import {useState} from 'react';
import {getApi} from '../../../data';
import type {NoteStatus,SchedulingState} from '../../../data/types';

/** Every sibling card has its own scheduler state; never substitute the first
 * variant for a reverse/cloze sibling. This remains display-only for scheduling:
 * note edits and suspension use the already audited LemmaApi mutations. */
export interface CardVariant {
 ordinal:number;due:string|null;stability:number;
 difficulty?:number;state?:SchedulingState;lastReview?:string|null;reps?:number;lapses?:number;
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
const phaseNames=['New','Learning','Review','Relearning'] as const;
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
 const [override,setOverride]=useState<Record<number,CardVariant>>({});
 const [scheduleDates,setScheduleDates]=useState<Record<number,string>>({});
 const [pending,setPending]=useState(false);
 const [confirmReset,setConfirmReset]=useState<number|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 // This v6-only component is mounted by /cards/:no; note number + ordinal
 // identifies the exact sibling without changing the legacy CardDetail DTO.
 const route=typeof window==='undefined'?'':window.location.pathname;
 const match=route.match(/\/cards\/([1-9]\d*)\/?$/);
 const noteNo=match?Number(match[1]):null;
 const ordered=[...variants].sort((a,b)=>a.ordinal-b.ordinal)
  .map(card=>override[(noteNo??0)+':'+card.ordinal]??card);
 const schedule=async(ordinal:number,operation:'reschedule'|'reset')=>{
  if(noteNo===null||pending||busy)return;
  try{
   setPending(true);setMessage(null);
   if(operation==='reschedule'){
    const input=scheduleDates[ordinal];
    if(!input||!Number.isFinite(Date.parse(input))){
     setMessage('Choose a valid date and time first.');return;
    }
    await getApi().rescheduleCard(noteNo,ordinal,new Date(input).toISOString());
   }else await getApi().resetCard(noteNo,ordinal);
   // Use the authoritative owner record, never invent a card schedule.
   const current=await getApi().getCard(noteNo);
   const variant=current.cards.find(card=>card.ord===ordinal);
   if(!variant)throw new Error('Updated card variant unavailable');
   setOverride(previous=>({...previous,[(noteNo??0)+':'+ordinal]:{
    ordinal,due:variant.state.due,stability:variant.state.stability,
    difficulty:variant.state.difficulty,state:variant.state.state,
    lastReview:variant.state.lastReview,reps:variant.state.reps,
    lapses:variant.state.lapses
   }}));
   setMessage(operation==='reset'?'Card returned to New.':'Next review updated.');
  }catch{
   setMessage('Could not change this card schedule. Try again.');
  }finally{
   setPending(false);setConfirmReset(null);
  }
 };
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
     <div><dt>Schedule</dt><dd className="text-ink">{card.state===undefined?'Unknown':phaseNames[card.state]}</dd></div>
     <div><dt>Stability</dt><dd className="text-ink">{card.stability>0?duration(card.stability)+" stable":"New"}</dd></div>
     <div><dt>Reviews</dt><dd className="text-ink tabular-nums">{count(card.reps)}</dd></div>
     <div><dt>Lapses</dt><dd className="text-ink tabular-nums">{count(card.lapses)}</dd></div>
    </dl>
    {card.lastReview&&Number.isFinite(Date.parse(card.lastReview))&&
     <p className="mt-1 text-caption text-ink-3">
      Last reviewed: <time dateTime={card.lastReview}>{new Date(card.lastReview).toLocaleDateString()}</time>
     </p>}
    {noteNo!==null&&<div className="mt-2 flex flex-wrap items-end gap-2"
     aria-label={'Schedule actions for variant '+card.ordinal}>
     <label className="text-caption text-ink-2">
      Next review date and time
      <input type="datetime-local"
       aria-label={'Next review for variant '+card.ordinal}
       value={scheduleDates[card.ordinal]??''}
       onChange={event=>setScheduleDates(v=>({...v,[card.ordinal]:event.target.value}))}
       className="mt-1 block min-h-11 rounded-ctl border border-edge bg-[var(--paper)] px-2" />
     </label>
     <button type="button" disabled={busy||pending}
      onClick={()=>void schedule(card.ordinal,'reschedule')}
      className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50">
      Reschedule</button>
     {confirmReset===card.ordinal?<>
      <button type="button" disabled={busy||pending}
       onClick={()=>void schedule(card.ordinal,'reset')}
       className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50">
       Confirm reset</button>
      <button type="button" disabled={busy||pending} onClick={()=>setConfirmReset(null)}
       className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold">Cancel</button>
     </>:<button type="button" disabled={busy||pending}
       onClick={()=>setConfirmReset(card.ordinal)}
       className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50">
       Reset to New</button>}
    </div>}
   </li>)}
  </ol>:<p className="mt-2 text-label text-ink-3">No scheduled variants yet.</p>)}
  {message&&<p role="status" className="mt-2 text-label text-ink-2">{message}</p>}
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
