// N79: typed focus preferences. Server N39 JSON remains the authoritative
// validation and unknown-key-preserving merge; this screen sends only known keys.
import {useState,type FormEvent} from 'react';
import type {FocusDefaultsPrefs,ReviewBudgetPrefs,AttentionPrefs,Settings} from '../../../data/types';
import type {SettingsPatch} from '../../../data/api';
import {useUpdateSettings} from '../../../data/hooks';

const field='min-h-11 rounded-ctl border border-edge bg-well px-3 text-body';
const btn='min-h-11 rounded-ctl border border-edge px-3 font-semibold disabled:opacity-50';
const number=(raw:string,min:number,max:number,name:string):number=>{
 if(!/^(0|[1-9][0-9]*)$/.test(raw)||!Number.isSafeInteger(Number(raw))||
  Number(raw)<min||Number(raw)>max)throw Error(name+' must be '+min+'–'+max+' whole minutes');
 return Number(raw);
};
export function validateFocusValues(raw:Record<string,string>):FocusDefaultsPrefs{
 const mode=raw.mode;
 if(mode!=='pomodoro'&&mode!=='flowtime'&&mode!=='open')
  throw Error('Unknown focus mode');
 const ratio=Number(raw.flowtimeBreakRatio);
 if(!Number.isFinite(ratio)||ratio<=0||ratio>1)
  throw Error('Flowtime break ratio must be greater than zero and at most one');
 return {
  mode,
  focus_minutes:number(raw.focusMinutes,1,480,'Focus'),
  break_minutes:number(raw.breakMinutes,1,180,'Break'),
  long_break_minutes:number(raw.longBreakMinutes,1,240,'Long break'),
  cycles:number(raw.cycles,1,24,'Cycles'),
  flowtime_break_ratio:ratio,
  long_session_guard_minutes:number(raw.longSessionGuardMinutes,30,720,'Long-session guard'),
 };
}
export function validateReviewBudgetValues(raw:Record<string,string>):ReviewBudgetPrefs{
 return {
  cards:number(raw.cards,0,2000,'Review cards'),
  minutes:number(raw.minutes,0,720,'Review minutes'),
  reserve_in_plans:raw.reserveInPlans==='true',
 };
}
const defaults:FocusDefaultsPrefs={
 mode:'pomodoro',focus_minutes:25,break_minutes:5,long_break_minutes:15,
 cycles:4,flowtime_break_ratio:0.2,long_session_guard_minutes:120,
};
const budgetDefaults:ReviewBudgetPrefs={cards:20,minutes:20,reserve_in_plans:true};
function values(s:Settings):Record<string,string>{
 const f={...defaults,...s.focusDefaults},r={...budgetDefaults,...s.reviewBudget};
 return {mode:f.mode,focusMinutes:String(f.focus_minutes),
  breakMinutes:String(f.break_minutes),longBreakMinutes:String(f.long_break_minutes),
  cycles:String(f.cycles),flowtimeBreakRatio:String(f.flowtime_break_ratio),
  longSessionGuardMinutes:String(f.long_session_guard_minutes),
  cards:String(r.cards),minutes:String(r.minutes),reserveInPlans:String(r.reserve_in_plans)};
}
export default function Focus({settings}:{settings:Settings}){
 const [form,setForm]=useState(()=>values(settings));
 const [driftPrompt,setDriftPrompt]=useState(settings.attention?.drift_prompt??false);
 const [urgePrompt,setUrgePrompt]=useState(settings.attention?.urge_prompt??false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const update=useUpdateSettings(),busy=update.isPending;
 const set=(name:string,value:string)=>setForm(v=>({...v,[name]:value}));
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(busy)return;
  setError('');setNotice('');
  let patch:SettingsPatch;
  try{
   const focusDefaults=validateFocusValues(form),reviewBudget=validateReviewBudgetValues(form);
   const attention:AttentionPrefs={drift_prompt:driftPrompt,urge_prompt:urgePrompt};
   patch={focusDefaults,reviewBudget,attention};
  }catch(e){setError(e instanceof Error?e.message:'Invalid focus preferences');return;}
  try{await update.mutateAsync(patch);setNotice('Focus preferences saved')}
  catch(e){setError(e instanceof Error?e.message:'Could not save focus preferences')}
 };
 return <section aria-label="Focus preferences" className="space-y-3">
  <h2 className="text-title-s font-semibold">Focus preferences</h2>
  <form noValidate onSubmit={event=>{void submit(event)}} className="space-y-4">
   <label className="block text-label">Focus mode
    <select className={field+' ml-2'} aria-label="Focus mode"
     value={form.mode} onChange={e=>set('mode',e.target.value)}>
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
     ['longSessionGuardMinutes','Long session guard minutes',720],
    ] as const).map(([key,label,max])=><label key={key} className="text-label">
     {label}
     <input type="number" min={1} max={max} step={1} aria-label={label}
      value={form[key]} className={field+' w-full'}
      onChange={e=>set(key,e.target.value)}/>
    </label>)}
   </div>
   <label className="block text-label">Flowtime break ratio
    <input type="number" min="0.01" max="1" step="0.01"
     className={field+' ml-2 w-24'} aria-label="Flowtime break ratio"
     value={form.flowtimeBreakRatio} onChange={e=>set('flowtimeBreakRatio',e.target.value)}/>
   </label>
   <h3 className="text-body font-semibold">Review budget</h3>
   <div className="grid grid-cols-2 gap-3">
    {([['cards','Review cards',2000],['minutes','Review minutes',720]] as const)
     .map(([key,label,max])=><label key={key} className="text-label">{label}
      <input className={field+' w-full'} type="number" min={0} max={max}
       aria-label={label} value={form[key]} onChange={e=>set(key,e.target.value)}/>
     </label>)}
   </div>
   <label className="flex min-h-11 items-center gap-2 text-label">
    <input type="checkbox" checked={form.reserveInPlans==='true'}
     onChange={e=>set('reserveInPlans',String(e.target.checked))}/>Reserve review time in plans
   </label>
   <h3 className="text-body font-semibold">Attention</h3>
   <label className="flex min-h-11 items-center gap-2 text-label">
    <input type="checkbox" checked={driftPrompt}
     onChange={e=>setDriftPrompt(e.target.checked)}/>Prompt for drift
   </label>
   <label className="flex min-h-11 items-center gap-2 text-label">
    <input type="checkbox" checked={urgePrompt}
     onChange={e=>setUrgePrompt(e.target.checked)}/>Prompt for urges
   </label>
   {error?<p role="alert">{error}</p>:null}
   {notice?<p role="status">{notice}</p>:null}
   <button type="submit" disabled={busy} className={btn}>Save focus preferences</button>
  </form>
 </section>;
}
