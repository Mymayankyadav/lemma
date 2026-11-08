// N77: read-only picker for the v6 Focus start flow.
// N72 will carry the chosen preset ID and exact session configuration into
// study_command; until then the pick only prepares an intention and link IDs.
import {useEffect,useState} from 'react';
import {getPresetApi} from '../../data/presets';
import type {PresetRecord} from '../../data/presets/contract';

export interface FocusPresetChoice {
 presetId:string;
 intent:string;
 subjectId:string|null;
 projectId:string|null;
 checkpointId:string|null;
 mode:PresetRecord['mode'];
 focusMinutes:number;
 breakMinutes:number;
 longBreakMinutes:number;
 cycles:number;
}
export function focusPresetChoice(preset:PresetRecord):FocusPresetChoice{
 if(preset.archivedAt!==null)throw Error('Archived activities cannot start focus');
 return {
  presetId:preset.id,intent:preset.label,
  subjectId:preset.subjectId,projectId:preset.projectId,
  checkpointId:preset.checkpointId,mode:preset.mode,
  focusMinutes:preset.focusMinutes,breakMinutes:preset.breakMinutes,
  longBreakMinutes:preset.longBreakMinutes,cycles:preset.cycles,
 };
}
export async function loadActiveFocusPresets():Promise<PresetRecord[]>{
 const api=getPresetApi(),items:PresetRecord[]=[],seen=new Set<string>();
 let cursor:string|null=null;
 for(let i=0;i<500;i++){
  const page=await api.listPresets({archived:'active',limit:50,cursor});
  if(!Array.isArray(page.items)||page.items.length>50)
   throw Error('Invalid preset page');
  items.push(...page.items);
  if(page.nextCursor===null){
   if(items.length!==page.total||items.some(x=>x.archivedAt!==null))
    throw Error('Incomplete active preset list');
   return items.sort((a,b)=>a.position-b.position||
    a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  }
  if(!page.nextCursor||seen.has(page.nextCursor))
   throw Error('Repeated preset cursor');
  seen.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw Error('Preset list safety bound exceeded');
}
export default function PresetPicker({onPick,selectedPresetId=null,disabled=false}:{
 onPick:(choice:FocusPresetChoice|null)=>void;
 selectedPresetId?:string|null;
 disabled?:boolean;
}){
 const [items,setItems]=useState<PresetRecord[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let alive=true;
  void loadActiveFocusPresets().then(rows=>{
   if(alive){setItems(rows);setError('');setLoading(false)}
  }).catch(e=>{
   if(alive){setError(e instanceof Error?e.message:'Could not load activities');setLoading(false)}
  });
  return()=>{alive=false};
 },[attempt]);
 const selected=items.find(x=>x.id===selectedPresetId);
 return <section aria-label="Focus activity presets" className="space-y-2">
  <label className="block text-label font-semibold" htmlFor="v6-focus-activity">Activity
   <select id="v6-focus-activity" aria-label="Focus activity"
    className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well px-3 text-body"
    value={selectedPresetId??''} disabled={disabled||loading||!!error}
    onChange={event=>{
     const next=items.find(x=>x.id===event.target.value);
     onPick(next?focusPresetChoice(next):null);
    }}>
    <option value="">No preset — use my intention</option>
    {items.map(preset=><option value={preset.id} key={preset.id}>
     {preset.label} · {preset.mode} · {preset.focusMinutes} min
    </option>)}
   </select>
  </label>
  {loading?<p role="status" className="text-label">Loading activities…</p>:null}
  {error?<div role="alert" className="text-label">
   Activities unavailable.
   <button type="button" className="ml-2 min-h-11 underline"
    onClick={()=>{setError('');setLoading(true);setAttempt(x=>x+1)}}>Try again</button>
  </div>:null}
  {!loading&&!error&&items.length===0?
   <p className="text-label text-ink-2">No active presets yet. Create one in Settings → Activities.</p>:null}
  {selected?<p className="text-label text-ink-2">
   {selected.mode} · {selected.focusMinutes} min focus · {selected.breakMinutes} min break
   {selected.projectId?' · Project linked':''}
   {selected.subjectId?' · Subject linked':''}
   {selected.checkpointId?' · Checkpoint linked':''}
  </p>:null}
 </section>;
}
