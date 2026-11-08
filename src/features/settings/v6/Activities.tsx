// N77: v6 activity presets; all writes remain in the N55 mode-aware PresetApi.
// No raw table DML, owner fields, or settings mutations.
import {useEffect,useState,type FormEvent} from 'react';
import {getPresetApi} from '../../../data/presets';
import type {NewPreset,PresetMode,PresetRecord} from '../../../data/presets/contract';

type Draft={
 label:string;mode:PresetMode;focusMinutes:string;breakMinutes:string;
 longBreakMinutes:string;cycles:string;
};
const defaults:Draft={
 label:'',mode:'pomodoro',focusMinutes:'25',breakMinutes:'5',
 longBreakMinutes:'15',cycles:'4',
};
const field='min-h-11 w-full rounded-ctl border border-edge bg-well px-3 py-2 text-body text-ink';
const action='min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold disabled:opacity-50';
const initial=(row?:PresetRecord):Draft=>row?{
 label:row.label,mode:row.mode,focusMinutes:String(row.focusMinutes),
 breakMinutes:String(row.breakMinutes),longBreakMinutes:String(row.longBreakMinutes),
 cycles:String(row.cycles),
}:{...defaults};
function asInput(draft:Draft):NewPreset{
 const number=(text:string,min:number,max:number,label:string):number=>{
  if(!/^[0-9]+$/.test(text.trim()))throw Error(label+' must be a whole number');
  const n=Number(text);
  if(!Number.isSafeInteger(n)||n<min||n>max)
   throw Error(label+' must be '+min+'–'+max);
  return n;
 };
 const label=draft.label.trim();
 if(!label||label.length>120)throw Error('Activity name must be 1–120 characters');
 return {label,mode:draft.mode,
  focusMinutes:number(draft.focusMinutes,1,480,'Focus minutes'),
  breakMinutes:number(draft.breakMinutes,1,180,'Break minutes'),
  longBreakMinutes:number(draft.longBreakMinutes,1,240,'Long break minutes'),
  cycles:number(draft.cycles,1,24,'Cycles'),
 };
}
export const activityPresetInput=asInput;

/** Load all bounded owner-RLS pages; never present a partial set as complete. */
export async function loadActivityPresets():Promise<PresetRecord[]>{
 const api=getPresetApi();
 const rows:PresetRecord[]=[];
 const seen=new Set<string>();
 let cursor:string|null=null;
 for(let page=0;page<500;page++){
  const result=await api.listPresets({archived:'all',limit:50,cursor});
  if(!Array.isArray(result.items)||result.items.length>50)
   throw Error('Invalid activity preset page');
  rows.push(...result.items);
  if(result.nextCursor===null){
   if(rows.length!==result.total)throw Error('Incomplete activity preset list');
   return rows.sort((a,b)=>a.position-b.position||
    a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  }
  if(seen.has(result.nextCursor)||!result.nextCursor)
   throw Error('Repeated activity preset cursor');
  seen.add(result.nextCursor);
  cursor=result.nextCursor;
 }
 throw Error('Activity preset paging limit exceeded');
}
export default function Activities(){
 const [items,setItems]=useState<PresetRecord[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [draft,setDraft]=useState<Draft>(()=>initial());
 const [editing,setEditing]=useState<string|null>(null);
 const [positions,setPositions]=useState<Record<string,string>>({});
 const reload=async()=>{
  const next=await loadActivityPresets();
  setItems(next);
  setPositions(Object.fromEntries(next.map(x=>[x.id,String(x.position)])));
 };
 useEffect(()=>{
  let alive=true;
  void loadActivityPresets().then(next=>{
   if(!alive)return;
   setItems(next);
   setPositions(Object.fromEntries(next.map(x=>[x.id,String(x.position)])));
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Could not load activities');})
   .finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[]);
 const run=async(f:()=>Promise<unknown>,message:string)=>{
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await f();
   await reload();
   setNotice(message);
  }catch(e){setError(e instanceof Error?e.message:'Could not save activity')}
  finally{setBusy(false)}
 };
 const submit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  let value:NewPreset;
  try{value=asInput(draft)}catch(e){
   setError(e instanceof Error?e.message:'Invalid activity');return;
  }
  const chosen=editing?items.find(r=>r.id===editing):null;
  if(editing&&!chosen){setError('This activity is no longer available');return;}
  void run(async()=>{
   const api=getPresetApi();
   if(chosen)await api.updatePreset(chosen.id,chosen.version,value);
   else await api.createPreset({...value,position:items.length?
    Math.max(...items.map(x=>x.position))+1:0});
   setEditing(null);setDraft(initial());
  },chosen?'Activity saved':'Activity created');
 };
 const change=(key:keyof Draft,value:string)=>setDraft(prev=>({...prev,[key]:value}));
 const active=items.filter(x=>x.archivedAt===null);
 const archived=items.filter(x=>x.archivedAt!==null);
 return <section aria-label="Activities" className="space-y-4">
  <h2 className="text-title-s font-semibold">Activities</h2>
  <p className="text-label text-ink-2">Save focus modes and timing for future study sessions. Archiving keeps past sessions intact.</p>
  {loading?<p role="status">Loading activities…</p>:null}
  {error?<p role="alert" className="text-label text-again">{error}</p>:null}
  {notice?<p role="status" className="text-label text-ink-2">{notice}</p>:null}
  <form aria-label={editing?'Edit activity':'Create activity'} noValidate
   onSubmit={submit} className="space-y-3 rounded-slab border border-edge p-4">
   <h3 className="text-body font-semibold">{editing?'Edit activity':'New activity'}</h3>
   <label className="block text-label">Name
    <input className={field} aria-label="Activity name" maxLength={120}
     value={draft.label} onChange={event=>change('label',event.target.value)}/>
   </label>
   <label className="block text-label">Mode
    <select className={field} aria-label="Activity mode" value={draft.mode}
     onChange={event=>change('mode',event.target.value)}>
     <option value="pomodoro">Pomodoro</option>
     <option value="flowtime">Flowtime</option>
     <option value="open">Open</option>
    </select>
   </label>
   <div className="grid grid-cols-2 gap-3">
    {([
     ['focusMinutes','Focus minutes',480],
     ['breakMinutes','Break minutes',180],
     ['longBreakMinutes','Long break minutes',240],
     ['cycles','Cycles',24],
    ] as const).map(([key,label,max])=><label key={key} className="text-label">{label}
     <input type="number" min={1} max={max} step={1} aria-label={label}
      className={field} value={draft[key]}
      onChange={event=>change(key,event.target.value)}/>
    </label>)}
   </div>
   <div className="flex flex-wrap gap-2">
    <button className={action} type="submit" disabled={busy}>
     {editing?'Save activity':'Create activity'}
    </button>
    {editing&&<button className={action} type="button"
     onClick={()=>{setEditing(null);setDraft(initial());setError('')}}
     disabled={busy}>Cancel editing</button>}
   </div>
  </form>
  {!loading&&<section aria-label="Active activities" className="space-y-2">
   <h3 className="text-body font-semibold">Active ({active.length})</h3>
   {!active.length&&<p className="text-label text-ink-2">No active activities yet.</p>}
   {active.map(row=><article key={row.id} className="rounded-slab border border-edge p-4">
    <h4 className="text-body font-semibold">{row.label}</h4>
    <p className="mt-1 text-label text-ink-2">{row.mode} · {row.focusMinutes} min focus · {row.breakMinutes} min break · {row.cycles} cycles</p>
    <div className="mt-3 flex flex-wrap items-end gap-2">
     <button type="button" className={action} disabled={busy}
      onClick={()=>{setEditing(row.id);setDraft(initial(row));setError('')}}
      aria-label={'Edit '+row.label}>Edit</button>
     <button type="button" className={action} disabled={busy}
      onClick={()=>void run(()=>getPresetApi().archivePreset(row.id,row.version),'Activity archived')}
      aria-label={'Archive '+row.label}>Archive</button>
     <label className="text-label">Order for {row.label}
      <input className={field+' w-20'} type="number" min={0} max={2147483647}
       step={1} aria-label={'Order '+row.label}
       value={positions[row.id]??String(row.position)}
       onChange={event=>setPositions(prev=>({...prev,[row.id]:event.target.value}))}/>
     </label>
     <button type="button" className={action} disabled={busy}
      aria-label={'Save order '+row.label}
      onClick={()=>{
       const raw=positions[row.id];
       if(raw===undefined||!/^(0|[1-9][0-9]*)$/.test(raw)||
        Number(raw)>2147483647){setError('Order must be a non-negative integer');return}
       void run(()=>getPresetApi().reorderPreset(row.id,row.version,Number(raw)),
        'Activity order saved');
      }}>Save order</button>
    </div>
   </article>)}
  </section>}
  {!loading&&<section aria-label="Archived activities" className="space-y-2">
   <h3 className="text-body font-semibold">Archived ({archived.length})</h3>
   {archived.map(row=><article key={row.id} className="rounded-slab border border-edge p-4">
    <h4 className="text-label font-semibold">{row.label}</h4>
    <button type="button" className={action+' mt-2'} disabled={busy}
     aria-label={'Restore '+row.label}
     onClick={()=>void run(()=>getPresetApi().restorePreset(row.id,row.version),
      'Activity restored')}>Restore</button>
   </article>)}
  </section>}
 </section>;
}
