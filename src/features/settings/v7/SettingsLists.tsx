import {lazy,Suspense,useState,type ReactNode} from 'react';
import {Check,ChevronRight} from 'lucide-react';
import {useUpdateSettings} from '../../../data/hooks';
import type {SettingsPatch} from '../../../data/api';
import type {FocusDefaultsPrefs,NotifyPrefs,PlanningPrefs,ReviewBudgetPrefs,Settings} from '../../../data/types';
import {mergeNotifyPrefs} from '../../../data/notify';
import {useToast} from '../../../ui/Toast';
import {Button,Field,Sheet,Slider,Stepper,Switch} from '../../../ui/v7/components';
import {formatDuration} from '../../../lib/format';
import {validateFocusValues,validateReviewBudgetValues} from '../v6/Focus';
import {validatePlanningValues} from '../v6/Planning';
import {isNative} from '../../../platform/native';
import {requestNotificationPermission} from '../../../platform/permissions';
import {reminderKindRows} from './reminderKinds';
// N123: phone-only rows load only inside the Android app.
const PhoneReminders=lazy(()=>import('./PhoneSettings').then(module=>({default:module.PhoneReminders})));
const PhonePlanning=lazy(()=>import('./PhoneSettings').then(module=>({default:module.PhonePlanning})));

/**
 * Release plan R1 · F03: Settings as grouped lists. A row shows its label and current value with a chevron, or an inline
 * switch; a value opens a small sheet (a Pick sheet that closes on choice, or a Form sheet with Cancel and Save); every
 * change saves at once with a "Saved · Undo" toast. Numerics live behind an Advanced row. No per-section Save buttons.
 */
export function Group({title,children,note}:{title:string;children:ReactNode;note?:string}){
 return <section className="v7-set-group" aria-label={title}><h2 className="v7-eyebrow">{title}</h2><ul className="v7-settings-card v7-set-list">{children}</ul>{note&&<p className="v7-set-note">{note}</p>}</section>;
}
export function ValueRow({label,value,onOpen,hint}:{label:string;value:string;onOpen:()=>void;hint?:string}){
 return <li><button type="button" className="v7-set-row" onClick={onOpen} aria-haspopup="dialog">
  <span className="v7-set-text"><span className="v7-set-label">{label}</span>{hint&&<small>{hint}</small>}</span>
  <span className="v7-set-value">{value}</span><ChevronRight aria-hidden="true"/></button></li>;
}
/** A row that only states something (no action): a version, or a reminder kind this phone cannot deliver. */
export function InfoRow({label,value,hint}:{label:string;value?:string;hint?:string}){
 return <li><div className="v7-set-row v7-set-info">
  <span className="v7-set-text"><span className="v7-set-label">{label}</span>{hint&&<small>{hint}</small>}</span>
  {value!==undefined&&<span className="v7-set-value">{value}</span>}</div></li>;
}
/** A row that opens a page outside Lemma (the release page), not a sheet. */
export function LinkRow({label,hint,onOpen}:{label:string;hint?:string;onOpen:()=>void}){
 return <li><button type="button" className="v7-set-row" onClick={onOpen}>
  <span className="v7-set-text"><span className="v7-set-label">{label}</span>{hint&&<small>{hint}</small>}</span><ChevronRight aria-hidden="true"/></button></li>;
}
export function SwitchRow({label,checked,onChange,disabled}:{label:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
 return <li className="v7-set-switch"><Switch label={label} checked={checked} onChange={onChange} disabled={disabled}/></li>;
}

/** Save a patch now; the toast offers Undo with the previous values. */
export function useSaveSettings(){
 const update=useUpdateSettings(),notify=useToast();
 return {busy:update.isPending,save:async(patch:SettingsPatch,undo?:SettingsPatch,message='Saved')=>{
  try{
   await update.mutateAsync(patch);
   notify(message,{tone:'success',...(undo?{action:{label:'Undo',onClick:()=>{void update.mutateAsync(undo).catch(()=>notify('We couldn’t undo that change. Try again.',{tone:'danger'}));}}}:{})});
   return true;
  }catch{notify('We couldn’t save that change. Try again.',{tone:'danger'});return false;}
 }};
}

/** Pick sheet (F17): a list with a ✓ on the current choice; choosing closes the sheet. */
export function PickSheet<T extends string|number>({title,eyebrow,options,value,onPick,onClose}:{title:string;eyebrow?:string;options:{value:T;label:string;hint?:string}[];value:T;onPick:(value:T)=>void;onClose:()=>void}){
 return <Sheet open onClose={onClose} title={title} eyebrow={eyebrow}>
  <div className="v7-pick-list" role="radiogroup" aria-label={title}>
   {options.map(option=><button key={String(option.value)} type="button" role="radio" aria-checked={option.value===value} className="v7-pick-row"
    onClick={()=>{onClose();if(option.value!==value)onPick(option.value);}}>
    <span className="v7-set-text"><span className="v7-set-label">{option.label}</span>{option.hint&&<small>{option.hint}</small>}</span>
    {option.value===value&&<Check aria-hidden="true"/>}</button>)}
  </div>
 </Sheet>;
}
const CLOCK=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** Form sheet for one 24-hour time (F51: the app's own field, not a native time input). */
export function TimeSheet({title,eyebrow,value,onSave,onClose,hint}:{title:string;eyebrow?:string;value:string;onSave:(value:string)=>void;onClose:()=>void;hint?:string}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('');
 const save=()=>{const v=draft.length===4&&/^\d{4}$/.test(draft)?draft.slice(0,2)+':'+draft.slice(2):draft;if(!CLOCK.test(v)){setError('Use 24-hour time, for example 07:30.');return;}onClose();if(v!==value)onSave(v);};
 return <Sheet open onClose={onClose} title={title} eyebrow={eyebrow} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
  <form className="v7-form-stack" noValidate onSubmit={event=>{event.preventDefault();save();}}>
   <Field label={title} inputMode="numeric" maxLength={5} autoFocus value={draft} onChange={event=>{setDraft(event.target.value);setError('');}} error={error||undefined} hint={hint??'24-hour time'}/>
   <button type="submit" hidden/>
  </form>
 </Sheet>;
}
/** Form sheet for one whole number, with the shared stepper (F14) and a typed field for large jumps. */
export function NumberSheet({title,eyebrow,value,min,max,unit,step=1,onSave,onClose}:{title:string;eyebrow?:string;value:number;min:number;max:number;unit:string|((n:number)=>string);step?:number;onSave:(value:number)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState(value);
 return <Sheet open onClose={onClose} title={title} eyebrow={eyebrow} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={()=>{onClose();if(draft!==value)onSave(draft);}}>Save</Button></>}>
  <div className="v7-form-stack"><Stepper label={title} unit={unit} value={draft} min={min} max={max} onChange={next=>setDraft(Math.round(next/step)*step||next)}/></div>
 </Sheet>;
}

type Open=null|{kind:'pick';title:string;options:{value:string|number;label:string;hint?:string}[];value:string|number;onPick:(value:never)=>void}
 |{kind:'time';title:string;value:string;onSave:(value:string)=>void;hint?:string}
 |{kind:'number';title:string;value:number;min:number;max:number;unit:string|((n:number)=>string);onSave:(value:number)=>void}
 |{kind:'recall'};
function useEditor(eyebrow:string){
 const [open,setOpen]=useState<Open>(null),close=()=>setOpen(null);
 const sheet=open?.kind==='pick'?<PickSheet title={open.title} eyebrow={eyebrow} options={open.options} value={open.value} onPick={open.onPick as (value:string|number)=>void} onClose={close}/>
  :open?.kind==='time'?<TimeSheet title={open.title} eyebrow={eyebrow} value={open.value} hint={open.hint} onSave={open.onSave} onClose={close}/>
  :open?.kind==='number'?<NumberSheet title={open.title} eyebrow={eyebrow} value={open.value} min={open.min} max={open.max} unit={open.unit} onSave={open.onSave} onClose={close}/>
  :null;
 return {open,setOpen,close,sheet};
}

const recallWords=(n:number)=>n>=95?'Very high · many reviews':n>=90?'High':n>=85?'Balanced':'Light · fewer reviews';
/** Study and review: Memory and Focus as grouped lists; numerics behind Advanced. */
export function StudyLists({settings,onAdvanced}:{settings:Settings;onAdvanced:()=>void}){
 const {save,busy}=useSaveSettings(),editor=useEditor('Study and review');
 const [recall,setRecall]=useState<number|null>(null);
 const retention=Math.round(settings.desiredRetention*100);
 const focus:FocusDefaultsPrefs={mode:'pomodoro',focus_minutes:25,break_minutes:5,long_break_minutes:15,cycles:4,flowtime_break_ratio:0.2,long_session_guard_minutes:120,...settings.focusDefaults};
 const budget:ReviewBudgetPrefs={cards:20,minutes:20,reserve_in_plans:true,...settings.reviewBudget};
 const focusWith=(patch:Partial<FocusDefaultsPrefs>)=>{
  const next={...focus,...patch};
  const valid=validateFocusValues({mode:next.mode,focusMinutes:String(next.focus_minutes),breakMinutes:String(next.break_minutes),longBreakMinutes:String(next.long_break_minutes),cycles:String(next.cycles),flowtimeBreakRatio:String(next.flowtime_break_ratio),longSessionGuardMinutes:String(next.long_session_guard_minutes)});
  void save({focusDefaults:valid},{focusDefaults:focus});
 };
 const budgetWith=(patch:Partial<ReviewBudgetPrefs>)=>{
  const next={...budget,...patch};
  const valid=validateReviewBudgetValues({cards:String(next.cards),minutes:String(next.minutes),reserveInPlans:String(next.reserve_in_plans)});
  void save({reviewBudget:valid},{reviewBudget:budget});
 };
 const modeWord={pomodoro:'Pomodoro',flowtime:'Flowtime',open:'Open'} as const;
 const attention={drift_prompt:false,urge_prompt:false,...settings.attention};
 return <div className="v7-settings-body">
  <Group title="Memory">
   <ValueRow label="Target recall" value={retention+'%'} hint="Higher recall means more reviews each day" onOpen={()=>{setRecall(retention);editor.setOpen({kind:'recall'});}}/>
   <ValueRow label="New cards a day" value={String(settings.newPerDay)} onOpen={()=>editor.setOpen({kind:'number',title:'New cards a day',value:settings.newPerDay,min:0,max:60,unit:n=>n===1?'card':'cards',onSave:value=>{void save({newPerDay:value},{newPerDay:settings.newPerDay});}})}/>
  </Group>
  <Group title="Focus">
   <ValueRow label="Default mode" value={modeWord[focus.mode]} onOpen={()=>editor.setOpen({kind:'pick',title:'Default mode',value:focus.mode,options:[
    {value:'pomodoro',label:'Pomodoro',hint:'Fixed focus and break lengths'},{value:'flowtime',label:'Flowtime',hint:'Focus as long as it flows; breaks scale with it'},{value:'open',label:'Open',hint:'A stopwatch, no breaks'}],
    onPick:((value:FocusDefaultsPrefs['mode'])=>focusWith({mode:value})) as (value:never)=>void})}/>
   <ValueRow label="Focus" value={formatDuration(focus.focus_minutes)} onOpen={()=>editor.setOpen({kind:'number',title:'Focus length',value:focus.focus_minutes,min:1,max:480,unit:'min',onSave:value=>focusWith({focus_minutes:value})})}/>
   <ValueRow label="Break" value={formatDuration(focus.break_minutes)} onOpen={()=>editor.setOpen({kind:'number',title:'Break length',value:focus.break_minutes,min:1,max:180,unit:'min',onSave:value=>focusWith({break_minutes:value})})}/>
   <ValueRow label="Long break" value={formatDuration(focus.long_break_minutes)+' after '+focus.cycles} onOpen={()=>editor.setOpen({kind:'number',title:'Long break length',value:focus.long_break_minutes,min:1,max:240,unit:'min',onSave:value=>focusWith({long_break_minutes:value})})}/>
   <SwitchRow label="Ask about drifting during focus" checked={attention.drift_prompt} disabled={busy} onChange={value=>{void save({attention:{...attention,drift_prompt:value}},{attention});}}/>
   <SwitchRow label="Ask about urges to switch" checked={attention.urge_prompt} disabled={busy} onChange={value=>{void save({attention:{...attention,urge_prompt:value}},{attention});}}/>
  </Group>
  <Group title="Review time">
   <ValueRow label="Cards a day" value={String(budget.cards)} onOpen={()=>editor.setOpen({kind:'number',title:'Review cards a day',value:budget.cards,min:0,max:2000,unit:n=>n===1?'card':'cards',onSave:value=>budgetWith({cards:value})})}/>
   <ValueRow label="Minutes a day" value={formatDuration(budget.minutes)} onOpen={()=>editor.setOpen({kind:'number',title:'Review minutes a day',value:budget.minutes,min:0,max:720,unit:'min',onSave:value=>budgetWith({minutes:value})})}/>
   <SwitchRow label="Keep review time in day plans" checked={budget.reserve_in_plans} disabled={busy} onChange={value=>budgetWith({reserve_in_plans:value})}/>
  </Group>
  <Group title="More">
   <ValueRow label="Advanced" value="" hint="Cycles, flowtime breaks, long-session guard, math shortcuts, optimiser, activities" onOpen={onAdvanced}/>
  </Group>
  {editor.open?.kind==='recall'?<Sheet open onClose={editor.close} eyebrow="Study and review" title="Target recall"
   footer={<><Button variant="ghost" onClick={editor.close}>Cancel</Button><Button variant="primary" onClick={()=>{const next=recall??retention;editor.close();if(next!==retention)void save({desiredRetention:next/100},{desiredRetention:settings.desiredRetention});}}>Save</Button></>}>
   <div className="v7-form-stack"><Slider label="Target recall" value={recall??retention} min={80} max={97} onChange={setRecall}/>
    <p className="v7-set-note">{(recall??retention)+'% · '+recallWords(recall??retention)}</p></div>
  </Sheet>:editor.sheet}
 </div>;
}

const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
/** Planning: the day window and calendar as rows; gaps and continuous limits behind Advanced. */
export function PlanningLists({settings}:{settings:Settings}){
 const {save,busy}=useSaveSettings(),editor=useEditor('Planning'),notify=useToast();
 const [advanced,setAdvanced]=useState(false);
 const planning:PlanningPrefs={window_start:'08:00',window_end:'22:00',gap_minutes:10,max_consecutive_minutes:120,daily_minimum_minutes:20,daily_intention:true,...settings.planning};
 const withPlanning=(patch:Partial<PlanningPrefs>)=>{
  const next={...planning,...patch};
  try{
   const valid=validatePlanningValues({windowStart:next.window_start,windowEnd:next.window_end,gapMinutes:String(next.gap_minutes),maxConsecutiveMinutes:String(next.max_consecutive_minutes),dailyMinimumMinutes:String(next.daily_minimum_minutes),dailyIntention:String(next.daily_intention)});
   void save({planning:valid},{planning});
  }catch{notify('The day has to end after it starts. Nothing was changed.',{tone:'danger'});}
 };
 const minimums=[0,10,15,20,30,45,60,90,120,180];
 return <div className="v7-settings-body">
  <Group title="Your day">
   <ValueRow label="Daily minimum" value={planning.daily_minimum_minutes?formatDuration(planning.daily_minimum_minutes):'None'} onOpen={()=>editor.setOpen({kind:'pick',title:'Daily minimum',value:planning.daily_minimum_minutes,
    options:[...new Set([...minimums,planning.daily_minimum_minutes])].sort((a,b)=>a-b).map(n=>({value:n,label:n?formatDuration(n):'None'})),onPick:((value:number)=>withPlanning({daily_minimum_minutes:value})) as (value:never)=>void})}/>
   <ValueRow label="Day starts" value={planning.window_start} onOpen={()=>editor.setOpen({kind:'time',title:'Day starts',value:planning.window_start,onSave:value=>withPlanning({window_start:value})})}/>
   <ValueRow label="Day ends" value={planning.window_end} onOpen={()=>editor.setOpen({kind:'time',title:'Day ends',value:planning.window_end,onSave:value=>withPlanning({window_end:value})})}/>
   <SwitchRow label="Ask for an intention each morning" checked={planning.daily_intention} disabled={busy} onChange={value=>withPlanning({daily_intention:value})}/>
  </Group>
  <Group title="Calendar">
   <ValueRow label="Week starts on" value={weekdays[settings.weekStart??1]} onOpen={()=>editor.setOpen({kind:'pick',title:'Week starts on',value:settings.weekStart??1,options:weekdays.map((label,value)=>({value,label})),onPick:((value:number)=>{void save({weekStart:value},{weekStart:settings.weekStart??1});}) as (value:never)=>void})}/>
   <ValueRow label="Time display" value={(settings.clock24h??true)?'24-hour':'12-hour'} onOpen={()=>editor.setOpen({kind:'pick',title:'Time display',value:(settings.clock24h??true)?'24':'12',options:[{value:'24',label:'24-hour',hint:'17:30'},{value:'12',label:'12-hour',hint:'5:30 pm'}],onPick:((value:string)=>{void save({clock24h:value==='24'},{clock24h:settings.clock24h??true});}) as (value:never)=>void})}/>
  </Group>
  {isNative()&&<Suspense fallback={null}><PhonePlanning/></Suspense>}
  <Group title="More">
   <ValueRow label="Advanced" value="" hint="Gaps between blocks and the longest stretch" onOpen={()=>setAdvanced(true)}/>
  </Group>
  {advanced&&<Sheet open onClose={()=>setAdvanced(false)} eyebrow="Planning" title="Advanced">
   <ul className="v7-settings-card v7-set-list">
    <ValueRow label="Gap between blocks" value={formatDuration(planning.gap_minutes)||'None'} onOpen={()=>{setAdvanced(false);editor.setOpen({kind:'number',title:'Gap between blocks',value:planning.gap_minutes,min:0,max:120,unit:'min',onSave:value=>withPlanning({gap_minutes:value})});}}/>
    <ValueRow label="Longest stretch" value={formatDuration(planning.max_consecutive_minutes)} onOpen={()=>{setAdvanced(false);editor.setOpen({kind:'number',title:'Longest stretch of study',value:planning.max_consecutive_minutes,min:15,max:600,unit:'min',onSave:value=>withPlanning({max_consecutive_minutes:value})});}}/>
   </ul>
  </Sheet>}
  {editor.sheet}
 </div>;
}

const scheduleWord={off:'Off',live:'As things happen',daily:'Daily summary',weekly:'Weekly digest'} as const;
/** Reminders: one switch, the schedule, what to remind about, quiet hours and the digest; every change saves at once. */
export function ReminderLists({settings}:{settings:Settings}){
 const {save,busy}=useSaveSettings(),editor=useEditor('Reminders');
 const value:NotifyPrefs=settings.notify??{};
 const put=(patch:NotifyPrefs)=>{void save({notify:mergeNotifyPrefs(value,patch)},{notify:value});};
 const app=isNative(),rows=reminderKindRows(app);
 const mode=value.mode??'off',quiet={start:'22:00',end:'07:00',...value.quiet},digest={weekday:0 as NotifyPrefs extends {digest?:{weekday:infer W}}?W:number,time:'09:00',...value.digest};
 return <div className="v7-settings-body">
  <Group title="Reminders" note={'Times are in '+(settings.timeZone?settings.timeZone.split('/').pop()!.replace(/_/g,' ')+' time':'your device’s time zone')+'.'}>
   <SwitchRow label="Reminders" checked={value.enabled===true} disabled={busy} onChange={enabled=>{put({enabled});if(enabled)void requestNotificationPermission();}}/>
   <ValueRow label="Schedule" value={scheduleWord[mode]} onOpen={()=>editor.setOpen({kind:'pick',title:'Schedule',value:mode,options:(Object.keys(scheduleWord) as (keyof typeof scheduleWord)[]).map(key=>({value:key,label:scheduleWord[key]})),onPick:((next:NotifyPrefs['mode'])=>put({mode:next})) as (value:never)=>void})}/>
   <ValueRow label="Preferred study time" value={value.studyTime??'09:00'} onOpen={()=>editor.setOpen({kind:'time',title:'Preferred study time',value:value.studyTime??'09:00',onSave:studyTime=>put({studyTime})})}/>
   <ValueRow label="At most" value={(value.maxPerDay??5)+' a day'} onOpen={()=>editor.setOpen({kind:'number',title:'Reminders a day, at most',value:value.maxPerDay??5,min:1,max:50,unit:n=>n===1?'reminder':'reminders',onSave:maxPerDay=>put({maxPerDay})})}/>
  </Group>
  <Group title="Remind me about">
   {rows.switches.map(({key,label})=><SwitchRow key={key} label={label} checked={value.kinds?.[key]??false} disabled={busy} onChange={on=>put({kinds:{[key]:on}})}/>)}
   {rows.proposalsSwitch&&<SwitchRow label="New card proposals" checked={value.approveCards===true} disabled={busy} onChange={approveCards=>put({approveCards})}/>}
   <ValueRow label="When cards due reach" value={(value.dueThreshold??10)+' cards'} onOpen={()=>editor.setOpen({kind:'pick',title:'When cards due reach',value:value.dueThreshold??10,options:[1,10,25,50].map(n=>({value:n,label:n+(n===1?' card':' cards')})),onPick:((dueThreshold:1|10|25|50)=>put({dueThreshold})) as (value:never)=>void})}/>
  </Group>
  {app&&<Suspense fallback={null}><PhoneReminders/></Suspense>}
  {app&&<Group title="In your Inbox on this phone" note="Lemma for Android has no push service, so these wait in your Inbox instead of arriving as notifications.">
   {rows.inbox.map(label=><InfoRow key={label} label={label}/>)}
  </Group>}
  <Group title="Quiet hours">
   <ValueRow label="Starts" value={quiet.start} onOpen={()=>editor.setOpen({kind:'time',title:'Quiet hours start',value:quiet.start,onSave:start=>put({quiet:{start,end:quiet.end}})})}/>
   <ValueRow label="Ends" value={quiet.end} onOpen={()=>editor.setOpen({kind:'time',title:'Quiet hours end',value:quiet.end,onSave:end=>put({quiet:{start:quiet.start,end}})})}/>
  </Group>
  <Group title="Weekly digest">
   <ValueRow label="Day" value={weekdays[digest.weekday as number]} onOpen={()=>editor.setOpen({kind:'pick',title:'Digest day',value:digest.weekday as number,options:weekdays.map((label,n)=>({value:n,label})),onPick:((weekday:0|1|2|3|4|5|6)=>put({digest:{weekday,time:digest.time}})) as (value:never)=>void})}/>
   <ValueRow label="Time" value={digest.time} onOpen={()=>editor.setOpen({kind:'time',title:'Digest time',value:digest.time,onSave:time=>put({digest:{weekday:digest.weekday as 0|1|2|3|4|5|6,time}})})}/>
  </Group>
  {editor.sheet}
 </div>;
}
