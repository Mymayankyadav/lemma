import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router';
import {useHome,useSettings} from '../../../data/hooks';
import {getPracticeTopicApi} from '../../../data/practice-topics';
import type {PracticeCadence,PracticeEventRecord,PracticeRating,PracticeTopicRecord} from '../../../data/practice-topics/contract';
import {HubHeader} from '../../../app/v7/V7Shell';
import {StatusBadge} from '../../../ui/v7/Status';
import {Tag} from '../../../ui/v7/KitPrimitives';
import {kitSubject} from '../../atlas/v7/model';
import {ChevronRight} from 'lucide-react';
import {Button,Segmented,Sheet} from '../../../ui/v7/components';
import {formatShortDate as formatDay,ownerZone} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {clock} from '../../review/v7/reviewModel';
import {loadAllPracticeEvents,loadAllPracticeTopics,parsePracticeCadence} from '../Page';
import {cadenceText,dueChip,lastText,ratingNames} from './practiceModel';
import './practice.css';

const ratings:PracticeRating[]=[1,2,3,4];
const kinds=['Every few days','Depends on my rating'] as const;

/** PLAN §6.13 Practice: one card per topic, a small Practice button, and a sheet to record how it went. */
export default function PracticeV7(){
 const settings=useSettings(),notify=useToast(),home=useHome();
 // PR4/KC2: a topic shows its subject as a Tag (glyph plus name).
 const subjectName=(id:string|null)=>id?home.data?.projects.find(project=>project.subject.id===id)?.subject.name??null:null;
 const zone=ownerZone(settings.data);
 const today=useMemo(()=>new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(new Date()),[zone]);
 const [items,setItems]=useState<PracticeTopicRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [reload,setReload]=useState(0),[busy,setBusy]=useState(false);
 const [recording,setRecording]=useState<PracticeTopicRecord|null>(null),[managing,setManaging]=useState<PracticeTopicRecord|null>(null);
 useEffect(()=>{const again=()=>setReload(value=>value+1);window.addEventListener('focus',again);return()=>window.removeEventListener('focus',again);},[]);
 useEffect(()=>{
  let live=true;
  void loadAllPracticeTopics().then(rows=>{if(live){setItems(rows);setError('');setLoading(false);}})
   .catch(failure=>{if(live){setError(failure instanceof Error?failure.message:'Could not load practice topics');setLoading(false);}});
  return()=>{live=false;};
 },[reload]);
 const active=items.filter(item=>item.archivedAt===null),archived=items.filter(item=>item.archivedAt!==null);
 const mostOverdue=active.filter(item=>item.nextDueDate!==null&&item.nextDueDate<today).sort((a,b)=>a.nextDueDate!.localeCompare(b.nextDueDate!))[0]?.id??null;
 const change=useCallback(async(work:()=>Promise<unknown>,message:string)=>{
  if(busy)return false;
  setBusy(true);setError('');
  try{await work();setItems(await loadAllPracticeTopics());notify(message,{tone:'success'});return true;}
  catch(failure){setError(failure instanceof Error?failure.message:'Practice operation failed');return false;}
  finally{setBusy(false);}
 },[busy,notify]);
 return <main id="main-content" className="v7-page v7-pr" aria-label="Practice">
  {/* PR1: Practice is a Review hub tab, so it renders inside the hub header (no Back, no second title). */}
  <HubHeader title="Review">
   <nav className="v7-hub-tabs" aria-label="Review sections"><Link to="/review">Due</Link><Link to="/practice" aria-current="page">Practice</Link></nav>
  </HubHeader>
  {loading&&<p role="status" className="v7-pr-note">Loading practice topics…</p>}
  {!!error&&<p role="alert" className="v7-alert">{error}</p>}
  {/* PR3: the explanation is a first-run tip, shown only before there is anything to practise. */}
  {!loading&&!active.length&&!error&&<p className="v7-pr-note">No active practice topics yet. Ask your tutor to add one. Practise a topic and rate how it went; the rating sets when it comes back.</p>}
  <ul className="v7-pr-list" aria-label="Practice topics">{active.map(topic=>{
   const chip=dueChip(topic.nextDueDate,today),subject=subjectName(topic.subjectId);
   // PR2: one primary per view — only the most overdue topic carries it; the rest are 44 px secondaries.
   return <li key={topic.id} className="v7-pr-card">
    <h2 className="v7-headline">{topic.title}</h2>
    <p className="v7-pr-badges">{subject&&<Tag subject={kitSubject(subject)}/>}
     <StatusBadge tone={chip.tone==='overdue'?'warning':'info'}>{chip.label}</StatusBadge></p>
    <p className="v7-pr-meta">{cadenceText(topic.cadence)} · {lastText(topic.lastPracticedAt,today)}</p>
    <div className="v7-pr-actions">
     <Button variant={topic.id===mostOverdue?'primary':'secondary'} small aria-label={'Practice '+topic.title} disabled={busy} onClick={()=>setRecording(topic)}>Practice</Button>
     <Button variant="ghost" small aria-label={'Manage '+topic.title} onClick={()=>setManaging(topic)}>Manage</Button>
    </div>
   </li>;})}</ul>
  {archived.length>0&&<details className="v7-pr-archived"><summary><span>Archived topics ({archived.length})</span><ChevronRight aria-hidden="true"/></summary>
   <ul aria-label="Archived practice topics">{archived.map(topic=><li key={topic.id}><span>{topic.title}</span>
    <Button variant="ghost" small aria-label={'Restore '+topic.title} disabled={busy}
     onClick={()=>{void change(()=>getPracticeTopicApi().restoreTopic(topic.id,topic.version),'Topic restored');}}>Restore</Button></li>)}</ul></details>}
  {recording&&<RecordSheet key={recording.id} topic={recording} busy={busy} onClose={()=>setRecording(null)}
   onSave={async input=>{const ok=await change(()=>getPracticeTopicApi().recordPractice(recording.id,recording.version,input),'Practice recorded');if(ok)setRecording(null);}}/>}
  {managing&&<ManageSheet key={managing.id} topic={managing} busy={busy} onClose={()=>setManaging(null)}
   onCadence={async cadence=>{const ok=await change(()=>getPracticeTopicApi().updateTopic(managing.id,managing.version,{cadence}),'Cadence saved');if(ok)setManaging(null);}}
   onArchive={async()=>{const ok=await change(()=>getPracticeTopicApi().archiveTopic(managing.id,managing.version),'Topic archived');if(ok)setManaging(null);}}/>}
 </main>;
}

function RecordSheet({topic,busy,onClose,onSave}:{topic:PracticeTopicRecord;busy:boolean;onClose:()=>void;
 onSave:(input:{rating:PracticeRating;response:string|null;minutes:number|null})=>Promise<void>}){
 const [rating,setRating]=useState<PracticeRating>(3),[notes,setNotes]=useState(''),[minutes,setMinutes]=useState('');
 const [seconds,setSeconds]=useState(0),[running,setRunning]=useState(false),[problem,setProblem]=useState('');
 useEffect(()=>{
  if(!running)return;
  const timer=window.setInterval(()=>setSeconds(value=>value+1),1000);
  return()=>window.clearInterval(timer);
 },[running]);
 function save(){
  let value:number|null=null;
  if(minutes.trim()){
   if(!/^(0|[1-9][0-9]*)$/.test(minutes.trim())||Number(minutes)>1440){setProblem('Minutes must be a whole number from 0 to 1440.');return;}
   value=Number(minutes);
  }else if(seconds>0)value=Math.max(1,Math.round(seconds/60));
  setProblem('');
  void onSave({rating,response:notes.trim()||null,minutes:value});
 }
 return <Sheet open onClose={onClose} title={'Practice: '+topic.title} eyebrow="How did it go?"
  footer={<Button variant="primary" loading={busy} onClick={save}>Save</Button>}>
  <div className="v7-pr-sheet">
   <div className="v7-pr-ratings" role="radiogroup" aria-label="How did it go?">{ratings.map(value=>
    <button key={value} type="button" role="radio" aria-checked={rating===value} className="v7-filter-chip" onClick={()=>setRating(value)}>{ratingNames[value]}</button>)}</div>
   <label className="v7-pr-field">Notes (optional)
    <textarea rows={3} maxLength={4000} value={notes} onChange={event=>setNotes(event.target.value)}/></label>
   <div className="v7-pr-timer">
    <output aria-label="Elapsed time">{clock(seconds)}</output>
    <Button variant="secondary" small onClick={()=>setRunning(value=>!value)}>{running?'Pause timer':seconds>0?'Resume timer':'Start timer'}</Button>
    <label className="v7-pr-field">Minutes
     <input type="number" inputMode="numeric" min={0} max={1440} placeholder={seconds>0?String(Math.max(1,Math.round(seconds/60))):'Optional'} value={minutes} onChange={event=>setMinutes(event.target.value)}/></label>
   </div>
   {!!problem&&<p role="alert" className="v7-alert">{problem}</p>}
  </div>
 </Sheet>;
}

function ManageSheet({topic,busy,onClose,onCadence,onArchive}:{topic:PracticeTopicRecord;busy:boolean;onClose:()=>void;
 onCadence:(cadence:PracticeCadence)=>Promise<void>;onArchive:()=>Promise<void>}){
 const [kind,setKind]=useState<typeof kinds[number]>(topic.cadence.kind==='fixed_days'?kinds[0]:kinds[1]);
 const [days,setDays]=useState(topic.cadence.kind==='fixed_days'?[String(topic.cadence.days),'1','3','7','14']:['7',...topic.cadence.daysByRating.map(String)]);
 const [events,setEvents]=useState<PracticeEventRecord[]|null>(null),[problem,setProblem]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let live=true;
  void loadAllPracticeEvents(topic.id).then(rows=>{if(live)setEvents(rows);}).catch(()=>{if(live)setEvents([]);});
  return()=>{live=false;};
 },[topic.id,reload]);
 function saveCadence(){
  try{
   const cadence=kind===kinds[0]?parsePracticeCadence('fixed_days',days.slice(0,1)):parsePracticeCadence('after_rating',days.slice(1,5));
   setProblem('');void onCadence(cadence);
  }catch(failure){setProblem(failure instanceof Error?failure.message:'Invalid cadence');}
 }
 return <Sheet open onClose={onClose} title={'Manage: '+topic.title} eyebrow="Cadence and history">
  <div className="v7-pr-sheet">
   <Segmented label="Schedule" options={[...kinds]} value={kind} onChange={value=>setKind(value as typeof kinds[number])}/>
   <div className="v7-pr-cadence">{(kind===kinds[0]?[0]:[1,2,3,4]).map(index=><label key={index} className="v7-pr-field">
    {index===0?'Days':'After '+ratingNames[index as PracticeRating]+', days'}
    <input type="number" inputMode="numeric" min={1} max={3650} value={days[index]} onChange={event=>setDays(old=>old.map((v,i)=>i===index?event.target.value:v))}/></label>)}</div>
   {!!problem&&<p role="alert" className="v7-alert">{problem}</p>}
   <Button variant="primary" loading={busy} onClick={saveCadence}>Save cadence</Button>
   <h3 className="v7-headline">History</h3>
   {events===null?<p className="v7-pr-note" role="status">Loading history…</p>:!events.length?<p className="v7-pr-note">No practice yet.</p>:
    <ul className="v7-pr-history" aria-label="Practice history">{events.map(event=><li key={event.id}>
     <span>{formatDay(event.occurredAt)} · {ratingNames[event.rating]}{event.minutes!==null?' · '+event.minutes+' min':''}{event.voidedAt?' · Voided':''}</span>
     {event.response&&<small>{event.response}</small>}
     {!event.voidedAt&&<Button variant="ghost" small aria-label={'Void practice from '+formatDay(event.occurredAt)} disabled={busy}
      onClick={()=>{void getPracticeTopicApi().voidPracticeEvent(event.id,event.version).then(()=>setReload(value=>value+1)).catch(()=>setProblem('Could not void that entry.'));}}>Void</Button>}
    </li>)}</ul>}
   <Button variant="ghost" destructive loading={busy} onClick={()=>{void onArchive();}}>Archive topic</Button>
  </div>
 </Sheet>;
}
