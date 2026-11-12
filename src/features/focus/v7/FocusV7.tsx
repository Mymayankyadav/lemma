import {useEffect,useRef,useState} from 'react';
import {useMotionReduced} from '../../../ui/v7/effects';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {Check,ChevronDown,CircleAlert,Coffee,MoreHorizontal,Pause,Play,SkipForward,Smartphone,Waves} from 'lucide-react';
import {ActionSheet} from '../../../ui/v7/ActionSheet';
import {useHome} from '../../../data/hooks';
import {getStudyApi} from '../../../data/study';
import {getThoughtApi} from '../../../data/parked-thoughts';
import {getStudyEventApi} from '../../../data/study-events';
import type {StudyEntryRecord} from '../../../data/study/contract';
import {Button,Sheet,Stepper} from '../../../ui/v7/components';
import {Emblem} from '../../../ui/v7/Emblem';
import {SubjectMark,subjectClass} from '../../../ui/v7/Subject';
import {ImmersiveHeader} from '../../../app/v7/V7Shell';
import {announceFocusChange,focusClock,focusEyebrow,focusWord,useActiveFocus,useNow} from '../../../app/v7/focus';
import {kitSubject} from '../../atlas/v7/model';
import {clockTime} from '../../home/v7/todayModel';
import {useToast} from '../../../ui/Toast';
import {isFlagOn} from '../../../flags';
import './focus.css';
import {Loader} from '../../../ui/v7/Loader';

const RING=280,STROKE=6,RADIUS=(RING-STROKE*2-10)/2,CIRCUMFERENCE=2*Math.PI*RADIUS;
const draftKey=(id:string)=>'lemma.v7.focus-intention.'+id;
function readDraft(id:string):string|null{try{return localStorage.getItem(draftKey(id));}catch{return null;}}
function writeDraft(id:string,value:string|null){try{if(value===null)localStorage.removeItem(draftKey(id));else localStorage.setItem(draftKey(id),value);}catch{/* a device-local convenience only */}}
const ratings=['Rough','Hard going','Steady','Good','Great'] as const;

/** Whole focused minutes so far (0 when less than half a minute has been focused). */
export function focusedMinutes(entry:StudyEntryRecord,now:number):number{
 let total=0;for(const interval of entry.intervals)if(interval.kind==='focus')total+=Math.max(0,(interval.end?Date.parse(interval.end):now)-Date.parse(interval.start));
 return Math.round(total/60_000);
}
/** R0 · F09: what a learner reads when a focus action fails: what happened and what is safe, never validation text. */
export function focusError(reason:unknown,action:'save'|'other'='other'):string{
 const message=reason instanceof Error?reason.message:'';
 if(/another device|changed/i.test(message))return 'This session changed on another device. Refresh to see where it is now.';
 if(/end must follow start|interval|minutes/i.test(message))return 'This session is too short to save. Discard it, or keep going and finish later.';
 return action==='save'?'We couldn’t save this session. It is still running, so nothing is lost; try again.':'That didn’t work. Your session is still running; try again.';
}

/** Milliseconds focused so far (focus intervals only). */
export function focusedMs(entry:StudyEntryRecord,now:number):number{
 let total=0;for(const interval of entry.intervals)if(interval.kind==='focus')total+=Math.max(0,(interval.end?Date.parse(interval.end):now)-Date.parse(interval.start));
 return total;
}
/** N131 · L-04 / A4 focus orbit: where the orbiting point is, as a fraction of the ring (one turn per focused minute). */
export const orbitTurn=(ms:number)=>(Math.max(0,ms)%60_000)/60_000;
/** The orbit for an open-mode session: a ring the point traces once a minute; it rests when paused and ripples on Drifted. */
function FocusOrbit({entry,now,paused,drifted,reduced}:{entry:StudyEntryRecord;now:number;paused:boolean;drifted:boolean;reduced:boolean}){
 const turn=orbitTurn(focusedMs(entry,now)),angle=-Math.PI/2+2*Math.PI*turn;
 return <svg className="v7-focus-orbit" viewBox={'0 0 '+RING+' '+RING} aria-hidden="true" data-paused={paused?'true':undefined} data-drifted={drifted?'true':undefined} data-turn={turn.toFixed(3)} data-wrap={turn<1/30?'true':undefined}>
  <circle cx={RING/2} cy={RING/2} r={RADIUS} className="v7-focus-track"/>
  <circle cx={RING/2} cy={RING/2} r={RADIUS} className="v7-focus-arc" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE*(1-turn)} transform={'rotate(-90 '+RING/2+' '+RING/2+')'}/>
  {!reduced&&<circle cx={RING/2+Math.cos(angle)*RADIUS} cy={RING/2+Math.sin(angle)*RADIUS} r={5} className="v7-focus-head"/>}
  {drifted&&!reduced&&<circle cx={RING/2} cy={RING/2} r={RADIUS} className="v7-focus-ripple"/>}
 </svg>;
}
/** PLAN §6.3: one session, nothing else on screen. */
export default function FocusV7(){
 const {entry,loading,refresh}=useActiveFocus(),now=useNow(1000),navigate=useNavigate(),home=useHome(),notify=useToast();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState(false);
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[thought,setThought]=useState(''),[noted,setNoted]=useState<string|null>(null);
 const [finishing,setFinishing]=useState(false),[minutes,setMinutes]=useState(25),[rating,setRating]=useState<number|null>(null),[learned,setLearned]=useState('');
 const [confirmDiscard,setConfirmDiscard]=useState(false);
 const reduced=useMotionReduced();
 const intention=entry?(readDraft(entry.id)??entry.intent):'';
 const project=home.data?.projects.find(item=>item.id===entry?.projectId);
 const subject=kitSubject(project?.subject.name??'');
 async function act(action:(fresh:StudyEntryRecord)=>Promise<unknown>){
  if(busy||!entry)return;setBusy(true);setError('');
  try{
   const fresh=await getStudyApi().activeStudyEntry();
   if(!fresh||fresh.id!==entry.id)throw Error('This session changed on another device. Refresh to continue.');
   await action(fresh);
  }catch(reason){setError(focusError(reason));}
  finally{setBusy(false);refresh();announceFocusChange();}
 }
 const pause=()=>act(fresh=>fresh.status==='paused'?getStudyApi().resumeStudyEntry(fresh.id,fresh.version):getStudyApi().pauseStudyEntry(fresh.id,fresh.version));
 const takeBreak=()=>act(fresh=>getStudyApi().breakStudyEntry(fresh.id,fresh.version));
 const openFinish=()=>{if(!entry)return;setMinutes(focusedMinutes(entry,Date.now()));setRating(null);setLearned('');setConfirmDiscard(false);setFinishing(true);};
 const save=()=>act(async fresh=>{
  const saved=await getStudyApi().saveStudyEntry(fresh.id,fresh.version,{minutes,rating:(rating as StudyEntryRecord['rating'])??null,reflection:learned.trim()||null});
  const local=readDraft(fresh.id);
  // Running intention edits are device-local drafts; they are corrected through the existing API once logged.
  if(local&&local!==fresh.intent)await getStudyApi().correctStudyEntry(saved.record.id,saved.record.version,{intent:local});
  writeDraft(fresh.id,null);setFinishing(false);
  notify('Logged '+minutes+' min'+(project?' to '+project.title:''),{tone:'success'});
  navigate('/');
 });
 const discard=()=>act(async fresh=>{
  await getStudyApi().discardStudyEntry(fresh.id,fresh.version);
  writeDraft(fresh.id,null);setFinishing(false);navigate('/');
 });
 const park=async()=>{
  if(!entry||!thought.trim())return;
  try{await getThoughtApi().createThought({text:thought.trim(),studyEntryId:entry.id});setThought('');setNoted('Parked');}
  catch{setError('We couldn’t park that thought. It is still in the box; try again.');}
 };
 const drifted=async()=>{
  if(!entry)return;
  try{await getStudyEventApi().recordEvent({entryId:entry.id,kind:'drift',durationMinutes:1});setNoted('Noted');}
  catch{setError('We couldn’t note that. Try again.');}
 };
 // N123: "Finish" on the Android lock screen pauses the session and opens this screen with ?finish=1 to log it.
 const [params,setParams]=useSearchParams();
 useEffect(()=>{if(params.get('finish')!=='1'||!entry)return;openFinish();const next=new URLSearchParams(params);next.delete('finish');setParams(next,{replace:true});// eslint-disable-line react-hooks/exhaustive-deps
 },[params,entry]);
 useEffect(()=>{if(!noted)return;const timer=window.setTimeout(()=>setNoted(null),1000);return ()=>window.clearTimeout(timer);},[noted]);
 // Desktop keys: Space pauses or resumes, B takes a break, Esc minimises.
 const keys=useRef({pause,takeBreak,finishing,editing});keys.current={pause,takeBreak,finishing,editing};
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement|null;
   if(keys.current.finishing||keys.current.editing||target?.closest('input,textarea,select,[contenteditable],dialog'))return;
   if(event.key===' '){event.preventDefault();void keys.current.pause();}
   else if(event.key==='b'||event.key==='B')void keys.current.takeBreak();
   else if(event.key==='Escape')navigate('/');
  };
  window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);
 },[navigate]);
 if(loading)return <main id="main-content" className="v7-focus" aria-label="Focus"><Loader className="v7-focus-empty" label="Opening your session…"/></main>;
 if(!entry)return <main id="main-content" className="v7-focus" aria-label="Focus">
  <ImmersiveHeader leave={<Link className="v7-icon-button" to="/" aria-label="Back to Today"><ChevronDown aria-hidden="true"/></Link>} center={<span className="v7-meta">Focus</span>}/>
  <div className="v7-focus-empty"><h1 className="v7-hub-title">No session running</h1><p className="v7-meta">Start one from Today, from a study block, or with Quick focus.</p>
   <Link className="v7-button v7-primary" to="/"><span>Go to Today</span></Link></div>
 </main>;
 const word=focusWord(entry),clock=focusClock(entry,now),eyebrow=focusEyebrow(entry),onBreak=word==='Break';
 const offset=clock.progress===null?0:CIRCUMFERENCE*(1-clock.progress),angle=-Math.PI/2+2*Math.PI*(clock.progress??0);
 return <main id="main-content" className={'v7-focus '+subjectClass(subject)} aria-label="Focus" data-word={word}>
  <ImmersiveHeader leave={<Link className="v7-icon-button" to="/" aria-label="Minimise"><ChevronDown aria-hidden="true"/></Link>}
   center={project?<span className="v7-focus-subject"><span className={'v7-tag '+subjectClass(subject)}><SubjectMark subject={subject}/><span>{subject==='Other'?project.subject.name:subject}</span></span><span className="v7-meta">{project.title}</span></span>:<span className="v7-meta">Focus</span>}
   more={<div className="v7-focus-more"><button type="button" className="v7-icon-button" aria-label="Timer details" aria-haspopup="menu" aria-expanded={menu} onClick={()=>setMenu(true)}><MoreHorizontal aria-hidden="true"/></button>
    {menu&&<ActionSheet open onClose={()=>setMenu(false)} title="Timer" label="Timer details"
     note={clock.endsAt?'This phase ends at '+clockTime(clock.endsAt,Intl.DateTimeFormat().resolvedOptions().timeZone)+'.':undefined}
     items={[
      ...(entry.mode&&entry.mode!=='open'?[{label:'Skip to the next phase',hint:'End this phase now',disabled:busy,icon:<SkipForward aria-hidden="true"/>,onClick:()=>{void act(fresh=>getStudyApi().nextPhase(fresh.id,fresh.version));}}]:[]),
      {label:'Take control on this device',hint:'Run the timer here instead of the other device',disabled:busy,icon:<Smartphone aria-hidden="true"/>,onClick:()=>{void act(fresh=>getStudyApi().takeLease(fresh.id,fresh.version));}},
     ]}/>}</div>}/>
  <h1 className="v7-sr-only">Focus · {word}</h1>
  <section className="v7-focus-centre" aria-label="Timer">
   {/* FO1/KC23: the emblem is centred on the timer, with the kit's Night hero glow; eyebrow, timer and intention are one block. */}
   <div className="v7-focus-emblem" aria-hidden="true" data-still={reduced||onBreak?'true':undefined}>
    {onBreak?<span className="v7-focus-breath" data-still={reduced?'true':undefined}/>:<Emblem subject={subject} seed={entry.projectId??entry.id} size={520} animate={false}/>}
   </div>
   {clock.progress!==null?<div className="v7-focus-ring" data-word={word}>
    <svg viewBox={'0 0 '+RING+' '+RING} aria-hidden="true">
     <circle cx={RING/2} cy={RING/2} r={RADIUS} className="v7-focus-track"/>
     <circle cx={RING/2} cy={RING/2} r={RADIUS} className="v7-focus-arc" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} transform={'rotate(-90 '+RING/2+' '+RING/2+')'}/>
     <circle cx={RING/2+Math.cos(angle)*RADIUS} cy={RING/2+Math.sin(angle)*RADIUS} r={5} className="v7-focus-head"/>
    </svg>
    <div className="v7-focus-readout"><p className="v7-eyebrow" aria-live="polite">{eyebrow}</p>
     <time className="v7-focus-time" aria-label={clock.label+' left'} data-testid="focus-clock">{clock.label}</time>
     {clock.endsAt&&<p className="v7-meta">ends {clockTime(clock.endsAt,Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>}</div>
   </div>:isFlagOn('focusOrbit')?<div className="v7-focus-ring" data-word={word} data-orbit="">
    <FocusOrbit entry={entry} now={now} paused={entry.status==='paused'} drifted={noted==='Noted'} reduced={reduced}/>
    <div className="v7-focus-readout"><p className="v7-eyebrow" aria-live="polite">{eyebrow}</p>
     <time className="v7-focus-time" aria-label={clock.label+' focused'} data-testid="focus-clock">{clock.label}</time></div>
   </div>:<div className="v7-focus-open"><p className="v7-eyebrow" aria-live="polite">{eyebrow}</p>
    <time className="v7-focus-time" aria-label={clock.label+' focused'} data-testid="focus-clock">{clock.label}</time></div>}
   {editing?<form className="v7-focus-intention-form" onSubmit={event=>{event.preventDefault();writeDraft(entry.id,draft.trim()&&draft.trim()!==entry.intent?draft.trim():null);setEditing(false);}}>
    <label className="v7-sr-only" htmlFor="v7-focus-intention">Intention</label>
    <input id="v7-focus-intention" autoFocus maxLength={200} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={event=>event.currentTarget.form?.requestSubmit()}/>
   </form>:<button type="button" className="v7-focus-intention" onClick={()=>{setDraft(intention);setEditing(true);}} aria-label={'Intention: '+intention+'. Edit'}>{intention}</button>}
  </section>
  <section className="v7-focus-bottom" aria-label="Session controls">
   <form className="v7-focus-thought" onSubmit={event=>{event.preventDefault();void park();}}>
    <label className="v7-sr-only" htmlFor="v7-focus-thought">Park a thought</label>
    <input id="v7-focus-thought" placeholder="Park a thought…" value={thought} onChange={event=>setThought(event.target.value)} enterKeyHint="done"/>
    <button type="button" className="v7-focus-drift" onClick={()=>{void drifted();}} aria-label="Drifted: log a distraction"><Waves aria-hidden="true"/><span aria-hidden="true">Drifted</span></button>
   </form>
   <p className="v7-focus-noted" role="status">{noted?<><Check aria-hidden="true"/>{noted}</>:' '}</p>
   {!!error&&<div className="v7-focus-error" role="alert"><CircleAlert aria-hidden="true"/><p>{error}</p><Button small variant="ghost" onClick={()=>setError('')}>Dismiss</Button></div>}
   <div className="v7-focus-controls">
    <div><button type="button" className="v7-focus-control" disabled={busy||onBreak||entry.status==='paused'} onClick={()=>{void takeBreak();}} aria-label="Take a break"><Coffee aria-hidden="true"/></button><span>Break</span></div>
    <div><button type="button" className="v7-focus-control v7-focus-main" disabled={busy} onClick={()=>{void pause();}} aria-label={entry.status==='paused'?(onBreak?'Resume now':'Resume'):'Pause'}>
     {entry.status==='paused'?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>}</button><span>{entry.status==='paused'?(onBreak?'Resume now':'Resume'):'Pause'}</span></div>
    {/* PA4/FO5: Finish stays secondary until the planned length is reached, so a running timer does not invite stopping early. */}
    <div><button type="button" className={'v7-focus-control'+(clock.progress!==null&&clock.progress>=1?' v7-focus-finish':'')} disabled={busy} onClick={openFinish} aria-label="Finish"><Check aria-hidden="true"/></button><span>Finish</span></div>
   </div>
  </section>
  {finishing&&minutes<1?<Sheet open onClose={()=>setFinishing(false)} title="Nothing to log yet" eyebrow={eyebrow}
   footer={<><Button variant="ghost" onClick={()=>setFinishing(false)}>Keep going</Button><Button variant="primary" destructive loading={busy} onClick={()=>{void discard();}}>Discard session</Button></>}>
   <p>Less than a minute was focused, so there is no time to save. Discard this session, or keep going and finish later.</p>
  </Sheet>:
  <Sheet open={finishing} onClose={()=>setFinishing(false)} title="Log this session" eyebrow={eyebrow}
   footer={<Button variant="primary" disabled={busy} onClick={()=>{void save();}}>Save</Button>}>
   <div className="v7-focus-finish-form">
    <Stepper label="Focused time" unit="min" value={minutes} min={1} max={1440} onChange={setMinutes}/>
    <fieldset className="v7-focus-rating"><legend>How did it go?</legend>
     <div role="radiogroup" aria-label="How did it go?">{ratings.map((label,index)=><button key={label} type="button" role="radio" aria-checked={rating===index+1} aria-label={label} onClick={()=>setRating(index+1)}>
      <span aria-hidden="true"/></button>)}</div>
     <p className="v7-meta"><span>Rough</span><span>Great</span></p></fieldset>
    <label className="v7-today-field">What did you learn? <span className="v7-meta">Optional</span>
     <textarea rows={3} value={learned} onChange={event=>setLearned(event.target.value)}/></label>
    {/* R1 · F17/F39: Save is the footer's only, full-width action; a destructive action lives last in the body. */}
    <div className="v7-sheet-danger-zone">{confirmDiscard?<><p className="v7-meta" role="status">Discarding removes this session's time. It can't be undone.</p>
     <Button small destructive disabled={busy} onClick={()=>{void discard();}}>Discard this session</Button></>
     :<Button small variant="ghost" destructive onClick={()=>setConfirmDiscard(true)}>Discard session</Button>}</div>
   </div>
  </Sheet>}
 </main>;
}
