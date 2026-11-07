import {useEffect,useRef,useState} from 'react';
import {getThoughtApi,type ParkedThought,type ThoughtApi} from '../../data/parked-thoughts';
import {getStudyEventApi,type StudyEventApi,type StudyEventRecord} from '../../data/study-events';

interface Page<T>{items:T[];total:number;nextCursor:string|null}
export interface FocusEventSummary {
 notices:number;drifts:number;driftMinutes:number;parked:number;
}
const empty:FocusEventSummary={notices:0,drifts:0,driftMinutes:0,parked:0};

/** Preserve exact totals when an owner's list spans several 50-item pages. */
export async function collectFocusPages<T extends {id:string}>(
 fetchPage:(cursor:string|null)=>Promise<Page<T>>
):Promise<T[]> {
 const rows:T[]=[],seenIds=new Set<string>(),seenCursors=new Set<string>();
 let cursor:string|null=null,total:number|null=null;
 do {
  const page=await fetchPage(cursor);
  if(!Number.isSafeInteger(page.total)||page.total<0||page.items.length>50||
   (total!==null&&page.total!==total))
   throw new Error('Focus page changed; refresh and retry.');
  total=page.total;
  for(const item of page.items){
   if(seenIds.has(item.id))throw new Error('Repeated focus record; refresh and retry.');
   seenIds.add(item.id);rows.push(item);
  }
  if(page.nextCursor){
   if(rows.length>=total||seenCursors.has(page.nextCursor)||cursor===page.nextCursor)
    throw new Error('Invalid focus cursor; refresh and retry.');
   seenCursors.add(page.nextCursor);
  }
  cursor=page.nextCursor;
 } while(cursor);
 if(rows.length!==total)throw new Error('Incomplete focus page; refresh and retry.');
 return rows;
}
export async function readFocusEvents(entryId:string,thoughts:ThoughtApi,events:StudyEventApi):Promise<FocusEventSummary>{
 const [notices,drifts,parked]=await Promise.all([
  collectFocusPages<StudyEventRecord>(cursor=>events.listEvents({entryId,kind:['notice'],cursor,limit:50})),
  collectFocusPages<StudyEventRecord>(cursor=>events.listEvents({entryId,kind:['drift'],cursor,limit:50})),
  collectFocusPages<ParkedThought>(cursor=>thoughts.listThoughts({status:['open'],cursor,limit:50}))
 ]);
 const activeNotices=notices.filter(e=>e.entryId===entryId&&e.kind==='notice'&&!e.voidedAt);
 const activeDrifts=drifts.filter(e=>e.entryId===entryId&&e.kind==='drift'&&!e.voidedAt);
 return {
  notices:activeNotices.length,drifts:activeDrifts.length,
  driftMinutes:activeDrifts.reduce((n,e)=>n+(e.durationMinutes??0),0),
  parked:parked.filter(t=>t.studyEntryId===entryId&&t.status==='open').length
 };
}

/** Thought and drift writes never change the StudyApi timer or its saved focus effort. */
export default function FocusEvents({entryId}:{entryId:string}){
 const thoughts=getThoughtApi(),events=getStudyEventApi();
 const [summary,setSummary]=useState<FocusEventSummary>(empty);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [open,setOpen]=useState(false),[thought,setThought]=useState(''),[minutes,setMinutes]=useState('1');
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null);
 async function refresh(){setSummary(await readFocusEvents(entryId,thoughts,events));}
 useEffect(()=>{
  let alive=true;
  setLoading(true);setSummary(empty);setError('');
  void readFocusEvents(entryId,thoughts,events)
   .then(value=>{if(alive)setSummary(value);})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Focus records unavailable');})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[entryId,thoughts,events]);
 useEffect(()=>{
  const node=dialog.current;
  if(!node)return;
  if(open&&!node.open){
   if(typeof node.showModal==='function')node.showModal();
   else node.setAttribute('open','');
  }else if(!open&&node.open){
   if(typeof node.close==='function')node.close();
   else node.removeAttribute('open');
  }
 },[open]);
 function dismiss(){setOpen(false);trigger.current?.focus();}
 async function park(){
  const value=thought.trim();
  if(busy)return;
  if(!value||value.length>4000){setError('Enter a thought up to 4000 characters.');return;}
  setBusy(true);setError('');setMessage('');
  try {
   await thoughts.createThought({studyEntryId:entryId,text:value});
   setThought('');dismiss();setMessage('Thought parked without stopping focus.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to park thought. Retry.');}
  finally{setBusy(false);}
 }
 async function drift(){
  if(busy)return;
  const value=Number(minutes);
  if(!Number.isSafeInteger(value)||value<1||value>100000){
   setError('Enter 1–100000 whole drift minutes.');return;
  }
  setBusy(true);setError('');setMessage('');
  try {
   await events.recordEvent({entryId,kind:'drift',durationMinutes:value,occurredAt:new Date().toISOString()});
   setMessage('Drift recorded; focus minutes have not been deducted.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to record drift. Retry.');}
  finally{setBusy(false);}
 }
 return <section aria-label="Focus thoughts and drift"
  className="mt-3 rounded-ctl border border-edge bg-fill-1 p-3">
  <h3 className="text-label font-semibold text-ink">During focus</h3>
  <p className="mt-1 text-caption text-ink-2">Park a thought without pausing. Drift is recorded now; N66 will add an optional focus-time deduction.</p>
  <div className="mt-2 flex flex-wrap gap-3 text-label text-ink-2" aria-live="polite">
   <output aria-label="Study notices">Notices: {summary.notices}</output>
   <output aria-label="Parked thought count">Parked: {summary.parked}</output>
   <output aria-label="Recorded drift">Drift: {summary.drifts} ({summary.driftMinutes} min)</output>
  </div>
  <div className="mt-3 flex flex-wrap items-end gap-2">
   <button ref={trigger} type="button" onClick={()=>setOpen(true)}
    className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold">Park a thought</button>
   <label className="text-label text-ink-2">Drift minutes
    <input aria-label="Drift minutes" type="number" inputMode="numeric" min="1" max="100000"
     step="1" value={minutes} onChange={e=>setMinutes(e.target.value)}
     className="ml-2 min-h-11 w-20 rounded-ctl border border-edge bg-[var(--paper)] px-2"/>
   </label>
   <button type="button" disabled={busy} onClick={()=>{void drift();}}
    className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-60">I drifted</button>
   <button type="button" disabled={loading||busy} onClick={()=>{
    setLoading(true);setError('');
    void refresh().catch(e=>setError(e instanceof Error?e.message:'Focus refresh failed'))
     .finally(()=>setLoading(false));
   }} className="min-h-11 px-2 text-label underline">Refresh counts</button>
  </div>
  {loading&&<p role="status" className="mt-2 text-caption">Loading focus notes…</p>}
  {message&&<p role="status" className="mt-2 text-label">{message}</p>}
  {error&&<p role="alert" className="mt-2 text-label">{error}</p>}
  <dialog ref={dialog} aria-labelledby="park-heading" aria-modal="true"
   onCancel={e=>{e.preventDefault();dismiss();}} onClose={dismiss}
   className="fixed inset-0 z-50 m-auto w-[min(430px,calc(100vw-24px))] rounded-[24px] border border-edge bg-[var(--paper)] p-5 text-ink shadow-xl backdrop:bg-black/65">
   <h3 id="park-heading" className="text-title-s font-semibold">Park a thought</h3>
   <form onSubmit={e=>{e.preventDefault();void park();}}>
    <label className="mt-3 block text-label">Thought
     <textarea aria-label="Thought to park" rows={4} maxLength={4000} required value={thought}
      onChange={e=>setThought(e.target.value)}
      className="mt-1 block w-full rounded-ctl border border-edge bg-fill-1 p-3 text-body"/>
    </label>
    <div className="mt-4 flex justify-end gap-2">
     <button type="button" disabled={busy} onClick={dismiss}
      className="min-h-11 rounded-ctl border border-edge px-3">Cancel</button>
     <button type="submit" disabled={busy}
      className="min-h-11 rounded-ctl bg-amber px-4 text-amber-ink">Save thought</button>
    </div>
   </form>
  </dialog>
 </section>;
}
