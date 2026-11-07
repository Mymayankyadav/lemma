import {useEffect,useRef,useState} from 'react';
import {getStudyApi} from '../../data/study';
import type {StudyEntryRecord,StudyRange} from '../../data/study/contract';
import {dayBounds,loggedMinutes} from '../../lib/effort';
import {idleFocus,inProgressFocusMinutes,remainingFocusMinutes,transitionFocus,type FocusState} from '../../lib/focus/machine';
import FocusDialog from '../../ui/v6/focus/FocusDialog';
import FocusNotices from './FocusNotices';

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
 return {phase,session:{
  id:entry.id,intent:entry.intent,focusMinutes:FOCUS_CAP,
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
   const result=await api.startStudyEntry({intent:intent.trim()||'Focused study',source:'timer',startedAt:at});
   // Server-owned interval timestamps are authoritative in live mode.
   setActive(result.record);setFocus(focusFromEntry(result.record));setNote(result.record.reflection??'');
   setNow(at);setOpened(true);
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
   await refresh();setOpened(false);lastTrigger.current?.focus();
  }catch(e){report(e);}
  finally{setBusy(false);}
 }
 const phase=focus.phase;
 const remaining=remainingFocusMinutes(focus,now);
 const accessory=active!==null&&(phase==='running'||phase==='paused'||phase==='break');
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
  {accessory&&<>
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
  <FocusDialog open={opened} state={focus} now={now} note={note} editedMinutes={editedMinutes}
   busy={busy} error={error} onDismiss={dismiss} onNote={setNote} onMinutes={setEditedMinutes}
   onPause={()=>{void transition('pause');}} onResume={()=>{void transition('resume');}}
   onBreak={()=>{void transition('break');}} onFinish={finish}
   onSave={()=>{void save(false);}} onDiscard={()=>{void save(true);}}/>
  {active&&<FocusNotices entryId={active.id}/>}
 </>;
}
