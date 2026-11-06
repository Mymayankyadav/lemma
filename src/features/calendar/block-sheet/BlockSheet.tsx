import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {getStudyApi} from '../../../data/study';
import type {
  CalendarBlockKind, CalendarBlockPatch, CalendarBlockRecord, CalendarBlockStatus,
  NewCalendarBlock, StudyApi,
} from '../../../data/study/contract';
import {useToast} from '../../../ui/Toast';

const field='min-h-11 w-full min-w-0 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink';
const action='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink';

/** Convert an instant to wall-clock input in the owner's IANA zone, not device UTC. */
export function zonedInput(instant:string, zone:string):string {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',
   day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 const field=(key:string)=>parts.find(p=>p.type===key)?.value??'';
 return `${field('year')}-${field('month')}-${field('day')}T${field('hour')}:${field('minute')}`;
}

/** Reject invalid wall times and DST gaps; select the first occurrence at a fall-back overlap. */
export function instantInZone(input:string,zone:string):string|null {
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input))return null;
 const [y,m,d,h,min]=input.split(/[-T:]/).map(Number);
 const naive=Date.UTC(y,m-1,d,h,min);
 if(!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,16)!==input)return null;
 try {
  const offsets=new Set<number>();
  for(const delta of [-36,-12,0,12,36]){
   const probe=naive+delta*3600000;
   const parts=zonedInput(new Date(probe).toISOString(),zone);
   const [py,pm,pd,ph,pmin]=parts.split(/[-T:]/).map(Number);
   offsets.add(Date.UTC(py,pm-1,pd,ph,pmin)-probe);
  }
  const matches=[...offsets].map(offset=>naive-offset)
   .filter(time=>zonedInput(new Date(time).toISOString(),zone)===input)
   .sort((a,b)=>a-b);
  return matches.length?new Date(matches[0]).toISOString():null;
 }catch{return null}
}
export function blockFormInput(values:{
 title:string;kind:CalendarBlockKind;start:string;end:string;zone:string;
}):NewCalendarBlock {
 const title=values.title.trim();
 if(!title||title.length>200)throw new Error('Enter a title of at most 200 characters.');
 if(!['study','busy'].includes(values.kind))throw new Error('Choose a block type.');
 const startsAt=instantInZone(values.start,values.zone);
 const endsAt=instantInZone(values.end,values.zone);
 if(!startsAt||!endsAt||Date.parse(endsAt)<=Date.parse(startsAt))
  throw new Error('Enter a valid start before the end in your time zone.');
 return {title,kind:values.kind,startsAt,endsAt,timeZone:values.zone};
}
function message(error:unknown):string {
 const e=error as {code?:string;message?:string};
 return e?.code==='conflict'||/conflict|version|stale/i.test(e?.message??'')
  ? 'Changed elsewhere. The current block was reloaded; review it before retrying.'
  : (e?.message??'Could not save the calendar block.');
}
function snapshotPatch(block:CalendarBlockRecord):CalendarBlockPatch {
 return {kind:block.kind,title:block.title,startsAt:block.startsAt,endsAt:block.endsAt,
   timeZone:block.timeZone,status:block.status};
}
function originalInput(block:CalendarBlockRecord,zone:string) {
 return {title:block.title,kind:block.kind,start:zonedInput(block.startsAt,zone),
   end:zonedInput(block.endsAt,zone),status:block.status};
}

export interface BlockSheetProps {
 block:CalendarBlockRecord|null;
 date:string;zone:string;onClose:()=>void;onRefresh:()=>void;
}
export default function BlockSheet({block,date,zone,onClose,onRefresh}:BlockSheetProps) {
 const dialog=useRef<HTMLDialogElement>(null),busy=useRef(false),heading=useId();
 const notify=useToast();
 const [current,setCurrent]=useState(block);
 const [title,setTitle]=useState(block?.title??'');
 const [kind,setKind]=useState<CalendarBlockKind>(block?.kind??'study');
 const [start,setStart]=useState(block?zonedInput(block.startsAt,zone):date+'T09:00');
 const [end,setEnd]=useState(block?zonedInput(block.endsAt,zone):date+'T10:00');
 const [status,setStatus]=useState<CalendarBlockStatus>(block?.status??'planned');
 const [saving,setSaving]=useState(false);
 const [confirmDelete,setConfirmDelete]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  if(typeof node.showModal==='function')node.showModal();else node.setAttribute('open','');
  return ()=>{if(node.open&&typeof node.close==='function')node.close();};
 },[]);
 function restore(record:CalendarBlockRecord) {
  setCurrent(record);
  const form=originalInput(record,zone);
  setTitle(form.title);setKind(form.kind);setStart(form.start);setEnd(form.end);setStatus(form.status);
 }
 async function reloadConflict(api:StudyApi,prior:CalendarBlockRecord) {
  // A moved block can lie outside the displayed day, so reload around the
  // original bounds, including the adjacent civil days.
  try {
   const day=86400000;
   const range={start:new Date(Date.parse(prior.startsAt)-day).toISOString(),
     end:new Date(Date.parse(prior.endsAt)+day).toISOString()};
   const records=await api.listCalendarBlocks(range);
   const fresh=records.find(r=>r.id===prior.id);
   if(fresh) restore(fresh);
   else setError('Changed elsewhere. The block may have moved or been deleted. Close and reload.');
  }catch{
   setError('Changed elsewhere. Close and reload the Calendar.');
  }
  onRefresh();
 }
 async function runUndo(action:()=>Promise<unknown>){
  try{await action();onRefresh();}
  catch(e){notify(message(e),{tone:'danger'});onRefresh();}
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy.current)return;
  let input:NewCalendarBlock;
  try{input=blockFormInput({title,kind,start,end,zone});}
  catch(e){setError(e instanceof Error?e.message:'Invalid block details.');return;}
  busy.current=true;setSaving(true);setError('');setConfirmDelete(false);
  const api=getStudyApi(),prior=current;
  try {
   if(!prior) {
    const receipt=await api.createCalendarBlock(input);
    notify('Calendar block created',{tone:'success',action:{label:'Undo',
     onClick:()=>{void runUndo(()=>api.deleteCalendarBlock(receipt.record.id,receipt.record.version));}}});
   }else{
    const patch:CalendarBlockPatch={...input,status};
    const receipt=await api.updateCalendarBlock(prior.id,prior.version,patch);
    notify('Calendar block updated',{tone:'success',action:{label:'Undo',
     onClick:()=>{void runUndo(()=>api.updateCalendarBlock(prior.id,receipt.record.version,snapshotPatch(prior)));}}});
   }
   onRefresh();onClose();
  }catch(e){
   setError(message(e));
   if(prior&&(e as {code?:string})?.code==='conflict')await reloadConflict(api,prior);
  }finally{busy.current=false;setSaving(false);}
 }
 async function remove(){
  if(busy.current||!current||!confirmDelete)return;
  const prior=current,api=getStudyApi();
  busy.current=true;setSaving(true);setError('');
  try{
   await api.deleteCalendarBlock(prior.id,prior.version);
   notify('Calendar block deleted',{tone:'success',action:{label:'Undo',
    onClick:()=>{void runUndo(async()=>{
     const recreated=await api.createCalendarBlock(prior);
     if(prior.status!=='planned')await api.updateCalendarBlock(recreated.record.id,recreated.record.version,{status:prior.status});
    });}}});
   onRefresh();onClose();
  }catch(e){
   setError(message(e));
   if((e as {code?:string})?.code==='conflict')await reloadConflict(api,prior);
  }finally{busy.current=false;setSaving(false);}
 }
 return <dialog ref={dialog} aria-labelledby={heading}
   onCancel={event=>{event.preventDefault();if(!busy.current)onClose();}}
   className="w-[calc(100%-2rem)] max-w-[460px] max-h-[90dvh] overflow-y-auto rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-xl backdrop:bg-black/50"
   style={{paddingBottom:'max(1rem,env(safe-area-inset-bottom))'}}>
   <h2 id={heading} className="text-title-s font-semibold">{current?'Edit calendar block':'New calendar block'}</h2>
   <p className="text-label text-ink-2">Times are in {zone}. Saved study entries cannot be edited here.</p>
   <form noValidate onSubmit={event=>{void save(event);}} className="mt-4 flex flex-col gap-3">
    <label className="text-label">Title
     <input aria-label="Calendar block title" className={field} autoFocus maxLength={200} value={title}
       onChange={event=>setTitle(event.target.value)}/>
    </label>
    <label className="text-label">Type
     <select aria-label="Calendar block type" className={field} value={kind}
       onChange={event=>setKind(event.target.value as CalendarBlockKind)}>
       <option value="study">Study</option><option value="busy">Busy</option>
     </select>
    </label>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
     <label className="text-label">Start
      <input aria-label="Calendar block start" type="datetime-local" className={field}
        value={start} onChange={event=>setStart(event.target.value)}/>
     </label>
     <label className="text-label">End
      <input aria-label="Calendar block end" type="datetime-local" className={field}
        value={end} onChange={event=>setEnd(event.target.value)}/>
     </label>
    </div>
    {current&&<label className="text-label">Status
     <select aria-label="Calendar block status" className={field} value={status}
       onChange={event=>setStatus(event.target.value as CalendarBlockStatus)}>
       <option value="planned">Planned</option><option value="done">Done</option>
       <option value="cancelled">Cancelled</option>
     </select>
    </label>}
    {error&&<p role="alert" className="text-label text-again">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={action} disabled={saving} onClick={onClose}>Cancel</button>
      <button type="submit" className={action+' bg-amber text-amber-ink'} disabled={saving}>
       {saving?'Saving…':current?'Save changes':'Create block'}
      </button>
      {current&&!confirmDelete&&<button type="button" className={action+' text-again'} disabled={saving}
        onClick={()=>setConfirmDelete(true)}>Delete block</button>}
    </div>
    {current&&confirmDelete&&<div className="rounded-ctl border border-edge p-3">
      <p className="text-label">Delete this block? You can restore it with Undo.</p>
      <div className="mt-2 flex gap-2">
       <button type="button" className={action} disabled={saving} onClick={()=>setConfirmDelete(false)}>Keep block</button>
       <button type="button" className={action+' text-again'} disabled={saving} onClick={()=>{void remove();}}>Confirm delete block</button>
      </div>
    </div>}
   </form>
 </dialog>;
}
