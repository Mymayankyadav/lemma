import {useEffect,useRef,useState} from 'react';
import {getStudyApi} from '../../data/study';
import {getPresetApi} from '../../data/presets';
import type {StudyEntryRecord,StudyRange,StudyTimerMode} from '../../data/study/contract';
import {dayBounds,loggedMinutes} from '../../lib/effort';
import {idleFocus,inProgressFocusMinutes,remainingFocusMinutes,transitionFocus,type FocusState} from '../../lib/focus/machine';
import FocusDialog from '../../ui/v6/focus/FocusDialog';
import V6FocusDialog from './V6FocusDialog';
import FocusNotices from './FocusNotices';
import PresetPicker,{focusPresetChoice,type FocusPresetChoice} from './PresetPicker';
import {isFlagOn} from '../../flags';

const FOCUS_CAP=25;
function zoneNow(){return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
function civilDate(zone:string){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=(key:string)=>parts.find(p=>p.type===key)?.value??'';
 return value('year')+'-'+value('month')+'-'+value('day');
}
/** StudyApi keeps open intervals (null end), whereas effort metrics require closed spans. */
export function loggedToday(entries:StudyEntryRecord[],range:StudyRange,zone:string,now:string):number {
 const completed=entries.filter(entry=>entry.status==='saved').map(entry=>({
  id:entry.id,
  status:'saved' as const,
  subjectId:entry.subjectId,
  intervals:entry.intervals.flatMap(interval=>interval.end===null?[]:
   [{start:interval.start,end:interval.end,kind:interval.kind}]),
 }));
 return loggedMinutes(completed,range,zone,now).minutes;
}

/** Restore N14.1's timestamped machine from the persisted StudyApi entry. */
export function focusFromEntry(entry:StudyEntryRecord):FocusState {
 const last=entry.intervals.at(-1);
 // SQL records breaks with status=paused; an open break interval wins.
 const phase=last?.kind==='break'&&last.end===null?'break':entry.status==='paused'?'paused':'running';
 const cap=entry.mode===undefined?FOCUS_CAP:entry.mode==='pomodoro'?
  Math.max(1,Number(entry.config?.focus_minutes)||FOCUS_CAP):1440;
 return {phase,session:{
  id:entry.id,intent:entry.intent,focusMinutes:cap,
  startedAt:entry.intervals[0]?.start??entry.createdAt,
  intervals:entry.intervals.map(i=>({kind:i.kind,start:i.start,end:i.end})),
  finishedAt:null,reflection:entry.reflection,savedMinutes:null,
 }};
}
export default function TodayFocus(){
 const api=getStudyApi(),zone=zoneNow(),range=dayBounds(civilDate(zone),zone);
 const [active,setActive]=useState<StudyEntryRecord|null>(null);
 const [focus,setFocus]=useState<FocusState>(idleFocus);
 const [logged,setLogged]=useState(0);
 const [intent,setIntent]=useState(''),[note,setNote]=useState('');
 const [chosenPreset,setChosenPreset]=useState<FocusPresetChoice|null>(null);
 const [mode,setMode]=useState<StudyTimerMode>('open');
 const [leaseOwned,setLeaseOwned]=useState(false);
 const [editedMinutes,setEditedMinutes]=useState('0');
 const [now,setNow]=useState(()=>new Date().toISOString());
 const [opened,setOpened]=useState(false),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const heroTrigger=useRef<HTMLButtonElement>(null),accessoryTrigger=useRef<HTMLButtonElement>(null);
 const lastTrigger=useRef<HTMLButtonElement|null>(null);

 async function refresh(){
  const [current,entries]=await Promise.all([api.activeStudyEntry(),api.listStudyEntries(range)]);
  setActive(current);
  setFocus(current?focusFromEntry(current):idleFocus());
  setLogged(loggedToday(entries,range,zone,new Date().toISOString()));
  if(current)setNote(current.reflection??'');
 }
 useEffect(()=>{
  let alive=true;
  void Promise.all([api.activeStudyEntry(),api.listStudyEntries(range)]).then(([current,entries])=>{
   if(!alive)return;
   setActive(current);
   setFocus(current?focusFromEntry(current):idleFocus());
   setLogged(loggedToday(entries,range,zone,new Date().toISOString()));
   if(current)setNote(current.reflection??'');
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[api,range.start,range.end,zone]);
 // Reload the server-authoritative session after returning from another tab.
 // An external version change always invalidates this tab's timer lease.
 useEffect(()=>{
  let alive=true;
  const sync=()=>{void Promise.all([api.activeStudyEntry(),api.listStudyEntries(range)])
   .then(([current,entries])=>{
    if(!alive)return;
    setLogged(loggedToday(entries,range,zone,new Date().toISOString()));
    if(current?.id!==active?.id||current?.version!==active?.version||
      (current?.leaseExpiresAt&&Date.parse(current.leaseExpiresAt)<=Date.now())){
     setLeaseOwned(false);setActive(current);
     setFocus(current?focusFromEntry(current):idleFocus());
     if(current)setNote(current.reflection??'');
     else setOpened(false);
    }
   }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Could not refresh focus.');});};
  const visible=()=>{if(document.visibilityState!=='hidden')sync();};
  window.addEventListener('focus',visible);
  document.addEventListener('visibilitychange',visible);
  return ()=>{alive=false;window.removeEventListener('focus',visible);
   document.removeEventListener('visibilitychange',visible);};
 },[api,active?.id,active?.version,range.start,range.end,zone]);
 useEffect(()=>{
  // Starting a committed block in the adjacent Today plan must open this
  // same session, not a second browser-only timer.
  const planned=()=>{
   lastTrigger.current=document.activeElement instanceof HTMLButtonElement?
    document.activeElement:heroTrigger.current;
   void refresh().then(()=>{setLeaseOwned(false);setOpened(true);}).catch(report);
  };
  window.addEventListener('lemma:planned-focus-started',planned);
  return ()=>window.removeEventListener('lemma:planned-focus-started',planned);
 },[api,range.start,range.end,zone]);
 useEffect(()=>{
  const open=()=>{if(active)setOpened(true);};
  window.addEventListener('lemma:open-focus',open);
  if(active&&window.location.hash.includes('?focus=open'))setOpened(true);
  return()=>window.removeEventListener('lemma:open-focus',open);
 },[active]);
 useEffect(()=>{
  const timer=window.setInterval(()=>setNow(new Date().toISOString()),10_000);
  return ()=>window.clearInterval(timer);
 },[]);
 function show(trigger:HTMLButtonElement|null){lastTrigger.current=trigger;setOpened(true);}
 function dismiss(){setOpened(false);lastTrigger.current?.focus();}
 function report(e:unknown){setError(e instanceof Error?e.message:'Focus change failed. Please retry.');}
 async function start(){
  if(busy||loading)return;
  lastTrigger.current=heroTrigger.current;
  if(active){setOpened(true);return;}
  setBusy(true);setError('');
  const at=new Date().toISOString();
  try{
   // The picker is a snapshot. Another device may archive or edit an activity
   // between selecting it and Start; re-read owner data before copying links.
   let verifiedPreset:FocusPresetChoice|null=null;
   if(chosenPreset){
    const latest=await getPresetApi().getPreset(chosenPreset.presetId);
    if(!latest||latest.archivedAt!==null)
     throw new Error('Selected activity is no longer active. Choose another activity.');
    verifiedPreset=focusPresetChoice(latest);
   }
   // A quick mode is backed by an owned, reusable activity so the server (not
   // the browser) captures an immutable configuration on first start.
   let presetId=verifiedPreset?.presetId??null;
   if(isFlagOn('v6Shell')&&!presetId&&mode!=='open'){
    const created=await getPresetApi().createPreset({label:mode==='pomodoro'?'Pomodoro focus':'Flowtime focus',
     mode,focusMinutes:25,breakMinutes:5,longBreakMinutes:15,cycles:4});
    presetId=created.record.id;
   }
   const result=await api.startStudyEntry({intent:intent.trim()||'Focused study',source:'timer',startedAt:at,
    ...(presetId?{presetId}:{}),
    ...(verifiedPreset?{subjectId:verifiedPreset.subjectId,projectId:verifiedPreset.projectId,
      checkpointId:verifiedPreset.checkpointId}:{}),
   });
   // Only a newly created entry is claimed automatically in this tab;
   // restoring an entry from another tab always requires explicit takeover.
   let record=result.record;
   if(isFlagOn('v6Shell')){
    try{record=(await api.takeLease(record.id,record.version)).record;setLeaseOwned(true);}
    catch{setLeaseOwned(false);setError('Focus started; take control of the timer to change phases.');}
   }
   setActive(record);setFocus(focusFromEntry(record));setNote(record.reflection??'');
   setNow(at);setOpened(true);
   window.dispatchEvent(new Event('lemma:focus-changed'));
  }catch(e){report(e);}
  finally{setBusy(false);}
 }
 async function transition(type:'pause'|'resume'|'break'){
  if(!active||busy)return;
  const at=new Date().toISOString();
  try{
   // The versioned command validates transitions on the server; local clock
   // skew must never reject a valid pause, resume or break before the RPC.
   setBusy(true);setError('');
   const result=type==='pause'?await api.pauseStudyEntry(active.id,active.version,at):
    type==='resume'?await api.resumeStudyEntry(active.id,active.version,at):
    await api.breakStudyEntry(active.id,active.version,at);
   setActive(result.record);setFocus(focusFromEntry(result.record));setNow(new Date().toISOString());
   window.dispatchEvent(new Event('lemma:focus-changed'));
  }catch(e){report(e);}
  finally{setBusy(false);}
 }
 function finish(){
  if(!active||busy)return;
  const localNow=new Date().toISOString();
  // A fast server clock may have started the newest interval after the phone's
  // current time. Clamp UI-only finish to that persisted boundary.
  const last=focus.session?.intervals.at(-1);
  const boundary=last?.end??last?.start??localNow;
  const at=new Date(Math.max(Date.parse(localNow),Date.parse(boundary))).toISOString();
  try{
   const finished=transitionFocus(focus,{type:'finish',at});
   setFocus(finished);
   setEditedMinutes(String(Math.round(inProgressFocusMinutes(finished,at)*10)/10));
   setNow(at);setError('');
  }catch(e){report(e);}
 }
 async function save(discard:boolean){
  if(!active||busy)return;
  const at=new Date().toISOString();
  try{
   const minutes=Number(editedMinutes);
   if(!discard&&(!editedMinutes.trim()||!Number.isFinite(minutes)||minutes<0))
    throw new Error('Enter a valid number of minutes.');
   // Save/discard is authoritative in StudyApi; don't gate a versioned RPC on
   // the phone's wall clock after a server-timestamped finish.
   setBusy(true);setError('');
   if(discard)await api.discardStudyEntry(active.id,active.version);
   else await api.saveStudyEntry(active.id,active.version,{minutes,reflection:note.trim()||null});
   await refresh();setLeaseOwned(false);setOpened(false);lastTrigger.current?.focus();
   window.dispatchEvent(new Event('lemma:focus-changed'));
  }catch(e){report(e);}
  finally{setBusy(false);}
 }
 async function takeControl(){
  if(!active||busy)return;
  setBusy(true);setError('');
  try{
   const result=await api.takeLease(active.id,active.version);
   setActive(result.record);setFocus(focusFromEntry(result.record));setLeaseOwned(true);
   window.dispatchEvent(new Event('lemma:focus-changed'));
  }catch(e){setLeaseOwned(false);report(e);await refresh().catch(()=>{});}
  finally{setBusy(false);}
 }
 async function nextPhase(){
  if(!active||busy||!leaseOwned)return;
  setBusy(true);setError('');
  try{
   const result=await api.nextPhase(active.id,active.version);
   setActive(result.record);setFocus(focusFromEntry(result.record));setNow(new Date().toISOString());
   window.dispatchEvent(new Event('lemma:focus-changed'));
  }catch(e){setLeaseOwned(false);report(e);await refresh().catch(()=>{});}
  finally{setBusy(false);}
 }
 async function excludeMinutes(minutes:number,reason:string){
  if(!active||busy)return;
  if(!leaseOwned)throw Error('Take control of this timer before deducting drift.');
  const result=await api.excludeMinutes(active.id,active.version,minutes,reason);
  setActive(result.record);setFocus(focusFromEntry(result.record));
  window.dispatchEvent(new Event('lemma:focus-changed'));
 }
 const phase=focus.phase;
 const remaining=remainingFocusMinutes(focus,now);
 const accessory=active!==null&&(phase==='running'||phase==='paused'||phase==='break');
 const dialogProps={open:opened,state:focus,now,note,editedMinutes,busy,error,
  onDismiss:dismiss,onNote:setNote,onMinutes:setEditedMinutes,
  onPause:()=>{void transition('pause');},onResume:()=>{void transition('resume');},
  onBreak:()=>{void transition('break');},onFinish:finish,
  onSave:()=>{void save(false);},onDiscard:()=>{void save(true);}};
 return <>
  <section aria-label="Current study action" className="rounded-[24px] border border-edge bg-[var(--paper)] p-4 shadow-sm">
   <p className="text-label font-semibold text-ink-2">Your next step</p>
   <h2 className="mt-1 text-title font-semibold text-ink">{active?'Stay with your focus':'Make time for focused study'}</h2>
   <p className="mt-2 text-label text-ink-2">{active?active.intent:'Choose an intention, then start a focused session.'}</p>
   {!active&&<label className="mt-3 block text-label text-ink-2">
    Focus intention
    <input aria-label="Focus intention" value={intent} onChange={e=>setIntent(e.target.value)}
     placeholder="What will you work on?" maxLength={200}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 text-body text-ink"/>
   </label>}
   {!active&&isFlagOn('v6Shell')&&<>
    <PresetPicker selectedPresetId={chosenPreset?.presetId??null}
     disabled={busy||loading} onPick={choice=>{setChosenPreset(choice);if(choice){setIntent(choice.intent);setMode(choice.mode);}else setMode('open');}}/>
    <label className="mt-3 block text-label font-semibold text-ink-2">Timer mode
     <select aria-label="Timer mode" value={chosenPreset?.mode??mode} disabled={busy||loading}
      onChange={e=>{setChosenPreset(null);setMode(e.target.value as StudyTimerMode);}}
      className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 text-body text-ink">
      <option value="open">Open — no phase limit</option>
      <option value="pomodoro">Pomodoro — 25/5 minute cycles</option>
      <option value="flowtime">Flowtime — flexible focus</option>
     </select>
    </label>
    {!chosenPreset&&mode!=='open'&&<p className="mt-1 text-caption text-ink-2">Quick mode creates a reusable activity with this configuration.</p>}
   </>}
   <button type="button" ref={heroTrigger} onClick={()=>{void start();}}
    disabled={busy||loading} className="mt-3 min-h-11 rounded-ctl bg-amber px-5 text-label font-semibold text-amber-ink disabled:opacity-60">
    {active?'Return to focus':'Start focus'}
   </button>
   <p className="mt-3 text-label text-ink-2">
    Logged today: <output aria-label="Logged today" className="font-semibold text-ink tabular-nums">{Math.round(logged*10)/10} min</output>
   </p>
   {loading&&<p role="status" className="text-caption text-ink-2">Loading study time…</p>}
   {error&&<p role="alert" className="mt-2 text-label text-ink">{error}</p>}
  </section>
  {accessory&&!isFlagOn('v6Shell')&&<>
   <aside aria-label="Focus accessory" className="fixed inset-x-3 bottom-[calc(var(--tab)+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[504px] items-center gap-3 rounded-t-ctl border border-edge bg-[var(--paper)] px-4 py-2 shadow-lg">
    <div className="min-w-0 flex-1">
     <p className="truncate text-label font-semibold text-ink">{active?.intent??''}</p>
     <p className="text-caption text-ink-2">{Math.ceil(remaining)} min remaining</p>
    </div>
    <button type="button" onClick={()=>{void transition(phase==='running'?'pause':'resume');}}
     disabled={busy} className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink">
     {phase==='running'?'Pause':'Resume'}
    </button>
    <button type="button" ref={accessoryTrigger} onClick={()=>show(accessoryTrigger.current)}
     className="min-h-11 rounded-ctl bg-amber px-3 text-label font-semibold text-amber-ink">Open focus</button>
   </aside>
   <div aria-hidden="true" className="h-16"/>
  </>}
  {active&&isFlagOn('v6Shell')?<V6FocusDialog {...dialogProps} entry={active}
   leaseOwned={leaseOwned} onTakeLease={()=>{void takeControl();}} onNextPhase={()=>{void nextPhase();}}/>:
   <FocusDialog {...dialogProps}/>}
  {active&&<FocusNotices entryId={active.id}
   onExclude={isFlagOn('v6Shell')?excludeMinutes:undefined}/>}
 </>;
}
