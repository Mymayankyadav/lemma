// N79: owner settings form for the typed N39 planning and Calendar preference fields.
import {useState,type FormEvent} from 'react';
import type {PlanningPrefs,Settings} from '../../../data/types';
import {useUpdateSettings} from '../../../data/hooks';

const inputClass='mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well px-3 text-body';
const buttonClass='min-h-11 rounded-ctl border border-edge px-4 font-semibold disabled:opacity-50';
const integer=(text:string,min:number,max:number,label:string):number=>{
 if(!/^(0|[1-9][0-9]*)$/.test(text)||!Number.isSafeInteger(Number(text))||
  Number(text)<min||Number(text)>max)
  throw Error(label+' must be a whole number between '+min+' and '+max);
 return Number(text);
};
export function validatePlanningValues(raw:Record<string,string>):PlanningPrefs {
 const times=['windowStart','windowEnd'] as const;
 for(const key of times)if(!/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(raw[key]??''))
  throw Error('Planning times must use HH:MM');
 if(raw.windowEnd<=raw.windowStart)throw Error('Planning end must be after start');
 return {
  window_start:raw.windowStart,
  window_end:raw.windowEnd,
  gap_minutes:integer(raw.gapMinutes,0,120,'Gap'),
  max_consecutive_minutes:integer(raw.maxConsecutiveMinutes,15,600,'Maximum continuous study'),
  daily_minimum_minutes:integer(raw.dailyMinimumMinutes,0,600,'Daily minimum'),
  daily_intention:raw.dailyIntention==='true',
 };
}
export function validateCalendarValues(raw:{weekStart:string;clock24h:string}):
 {weekStart:number;clock24h:boolean} {
 const weekStart=integer(raw.weekStart,0,6,'Week start');
 if(raw.clock24h!=='true'&&raw.clock24h!=='false')throw Error('Invalid clock format');
 return {weekStart,clock24h:raw.clock24h==='true'};
}
const defaults:PlanningPrefs={
 window_start:'08:00',window_end:'22:00',gap_minutes:10,
 max_consecutive_minutes:120,daily_minimum_minutes:20,daily_intention:true,
};
function fields(settings:Settings):Record<string,string>{
 const p={...defaults,...settings.planning};
 return {
  windowStart:p.window_start,windowEnd:p.window_end,
  gapMinutes:String(p.gap_minutes),
  maxConsecutiveMinutes:String(p.max_consecutive_minutes),
  dailyMinimumMinutes:String(p.daily_minimum_minutes),
  dailyIntention:String(p.daily_intention),
  weekStart:String(settings.weekStart??1),
  clock24h:String(settings.clock24h??true),
 };
}
export default function Planning({settings}:{settings:Settings}){
 const [form,setForm]=useState(()=>fields(settings));
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const update=useUpdateSettings(),busy=update.isPending;
 const set=(key:string,value:string)=>setForm(prev=>({...prev,[key]:value}));
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  setError('');setNotice('');
  try{
   const planning=validatePlanningValues(form);
   const calendar=validateCalendarValues({weekStart:form.weekStart,clock24h:form.clock24h});
   await update.mutateAsync({planning,...calendar});
   setNotice('Planning preferences saved');
  }catch(e){setError(e instanceof Error?e.message:'Could not save planning preferences')}
 }
 return <section aria-label="Planning preferences" className="space-y-3">
  <h2 className="text-title-s font-semibold">Planning preferences</h2>
  <form className="space-y-4" noValidate onSubmit={event=>{void submit(event)}}>
   <div className="grid grid-cols-2 gap-3">
    {([['windowStart','Planning starts','time'],['windowEnd','Planning ends','time'],
      ['gapMinutes','Gap minutes','number'],['maxConsecutiveMinutes','Maximum continuous minutes','number'],
      ['dailyMinimumMinutes','Daily minimum minutes','number']] as const)
      .map(([key,label,type])=><label className="block text-label" key={key}>
       {label}
       <input className={inputClass} type={type} aria-label={label} value={form[key]}
        onChange={e=>set(key,e.target.value)}/>
      </label>)}
   </div>
   <label className="flex min-h-11 items-center gap-2 text-label">
    <input type="checkbox" checked={form.dailyIntention==='true'}
     onChange={e=>set('dailyIntention',String(e.target.checked))}/>Ask for daily intention
   </label>
   <div className="grid grid-cols-2 gap-3">
    <label className="block text-label">Start of week
     <select className={inputClass} aria-label="Start of week" value={form.weekStart}
      onChange={e=>set('weekStart',e.target.value)}>
      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
        .map((label,day)=><option key={day} value={day}>{label}</option>)}
     </select>
    </label>
    <label className="block text-label">Time display
     <select className={inputClass} aria-label="Time display" value={form.clock24h}
      onChange={e=>set('clock24h',e.target.value)}>
      <option value="true">24-hour</option><option value="false">12-hour</option>
     </select>
    </label>
   </div>
   {error?<p role="alert">{error}</p>:null}
   {notice?<p role="status">{notice}</p>:null}
   <button type="submit" className={buttonClass} disabled={busy}>Save planning preferences</button>
  </form>
 </section>;
}
