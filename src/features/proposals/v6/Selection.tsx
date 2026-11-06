import type {Proposal} from '../../../data/types';
import {groupProposals} from '../groups';

export type Decision='approve'|'reject';
/** Selection is a bounded set of owner-visible proposal IDs, not a server-side filter. */
export function selectedPending(all:readonly Proposal[],ids:ReadonlySet<string>):Proposal[]{
 const seen=new Set<string>();
 return all.filter(p=>{
  if(!ids.has(p.id)||seen.has(p.id))return false;
  seen.add(p.id);return true;
 }).slice(0,20);
}
/** Every existing approve/reject call is atomic per proposal. No false
 * all-or-nothing claim: stop at the first error and report the untouched IDs. */
export async function applySelectedDecisions(
 ids:readonly string[],decision:Decision,
 approve:(id:string)=>Promise<unknown>,reject:(id:string)=>Promise<unknown>,
):Promise<{succeeded:string[];remaining:string[];failed:boolean}>{
 const distinct=[...new Set(ids)];
 const succeeded:string[]=[];
 for(let index=0;index<distinct.length;index++){
  const id=distinct[index];
  try{
   if(decision==='approve')await approve(id);
   else await reject(id);
   succeeded.push(id);
  }catch{
   return {succeeded,remaining:distinct.slice(index),failed:true};
  }
 }
 return {succeeded,remaining:[],failed:false};
}
const control='min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold focus-visible:outline-2 focus-visible:outline-amber disabled:opacity-50';
function summary(p:Proposal):string{
 if(p.kind==='card')return p.card?.front??'Card proposal';
 if(p.kind==='card_edit')return 'Card edit: N'+(p.cardEdit?.note_no??'');
 if(p.kind==='plan')return 'Plan: '+(p.plan?.checkpoints[0]?.title??p.projectSlug);
 return 'Plan change: '+(p.planChange?.ops.length??0)+' edits';
}
/** N32.2.1: native, keyboard-operable selected batches for both Inbox tabs. */
export default function SelectionPanel({visible,all,ids,busy,kind,onToggle,onSelectPage,onClear,onStage}:{
 visible:Proposal[];all:Proposal[];ids:ReadonlySet<string>;busy:boolean;
 kind:'cards'|'plan';
 onToggle:(id:string)=>void;onSelectPage:()=>void;onClear:()=>void;
 onStage:(decision:Decision)=>void;
}){
 const selected=selectedPending(all,ids),groups=groupProposals(visible);
 if(!visible.length)return null;
 return <section aria-label="Select Inbox proposals"
  className="min-w-0 space-y-3 rounded-slab border border-edge bg-[var(--paper)] p-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="text-body font-semibold text-ink">Selected {kind==='cards'?'cards':'plans'} · {selected.length}</h2>
   <div className="flex flex-wrap gap-2">
    <button type="button" className={control} disabled={busy} onClick={onSelectPage}>Select this page</button>
    <button type="button" className={control} disabled={busy||selected.length===0} onClick={onClear}>Clear</button>
   </div>
  </div>
  {groups.map(group=><fieldset key={group.key} className="min-w-0 border-t border-edge pt-2">
   <legend className="px-1 text-label font-medium text-ink-2">
    {group.project.replaceAll('-',' ')} · {group.label}
   </legend>
   <div className="flex flex-col gap-1">
    {group.proposals.map(p=><label key={p.id}
     className="flex min-h-11 min-w-0 items-center gap-3 rounded-ctl px-2 text-label text-ink">
     <input type="checkbox" data-inbox-proposal-id={p.id} className="size-5 shrink-0 accent-amber"
      disabled={busy} checked={ids.has(p.id)} onChange={()=>onToggle(p.id)}
      aria-label={'Select '+summary(p)}/>
     <span className="min-w-0 flex-1 break-words">{summary(p)}</span>
    </label>)}
   </div>
  </fieldset>)}
  <p className="text-caption text-ink-2">Select up to 20 proposals. Each decision saves separately after the Undo window; failures stop the batch and leave the rest untouched.</p>
  <div className="grid grid-cols-2 gap-2">
   <button type="button" className={control+' border-again text-again'} disabled={busy||selected.length===0}
    onClick={()=>onStage('reject')}>Reject {selected.length} selected</button>
   <button type="button" className={control+' bg-amber-tint text-ink'} disabled={busy||selected.length===0}
    onClick={()=>onStage('approve')}>Approve {selected.length} selected</button>
  </div>
 </section>;
}
