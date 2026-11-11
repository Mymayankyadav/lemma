import {useCallback,useEffect,useMemo,useState,type CSSProperties} from 'react';
import {Link,useNavigate} from 'react-router';
import {Check,ChevronRight,Inbox,Layers,Pause,Play} from 'lucide-react';
import {useHome,useSettings} from '../../../data/hooks';
import {getStudyApi} from '../../../data/study';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {dayBounds,loggedMinutes} from '../../../lib/effort';
import {Button,Sheet} from '../../../ui/v7/components';
import {Emblem} from '../../../ui/v7/Emblem';
import {SubjectMark,subjectClass,type Subject} from '../../../ui/v7/Subject';
import {HubHeader} from '../../../app/v7/V7Shell';
import {announceFocusChange,focusClock,focusWord,useActiveFocus,useNow} from '../../../app/v7/focus';
import {kitSubject} from '../../atlas/v7/model';
import {clockTime,heroState,localDay,localMinute,minutesLabel,nextStudyBlock,startsIn,stripSegment,todayBriefing,todayGreeting,type HeroState} from './todayModel';
import './today.css';

interface DayData{blocks:CalendarBlockRecord[];logged:number;closed:boolean;overdue:number}
function SubjectChip({subject,name}:{subject:Subject;name:string}){
 return <span className={'v7-tag '+subjectClass(subject)}><SubjectMark subject={subject}/><span>{name}</span></span>;
}
/** PLAN §6.2: Today decides what to do now, in one glance. */
export default function V7Today(){
 const home=useHome(),settings=useSettings(),navigate=useNavigate();
 const {entry,refresh:refreshFocus}=useActiveFocus();
 const now=useNow(30_000),date=new Date(now);
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const day=localDay(zone,date);
 const [data,setData]=useState<DayData|null>(null),[error,setError]=useState(false),[version,setVersion]=useState(0);
 const [busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[quick,setQuick]=useState(false);
 const [intention,setIntention]=useState(''),[pathId,setPathId]=useState<string|null>(null);
 const reload=useCallback(()=>setVersion(value=>value+1),[]);
 useEffect(()=>{
  let live=true;setError(false);
  const study=getStudyApi(),range=dayBounds(day,zone);
  const closed=import('../V6TodayPlan').then(module=>module.readTodayPlan(day,zone)).then(plan=>plan.plan?.status==='closed').catch(()=>false);
  const overdue=Promise.all([import('../../calendar/deadlines/load'),import('../../calendar/deadlines/OverdueBanner')])
   .then(async([load,banner])=>{const items=banner.overdueItems(await load.loadCalendarDues(),zone);return items.deadlines.length+items.topics.length;}).catch(()=>0);
  Promise.all([study.listCalendarBlocks(range),study.listStudyEntries(range),closed,overdue]).then(([blocks,entries,isClosed,overdueCount])=>{
   if(!live)return;
   const saved=entries.filter(item=>item.status==='saved').map(item=>({id:item.id,status:'saved' as const,subjectId:item.subjectId,
    intervals:item.intervals.filter(interval=>interval.end!==null).map(interval=>({start:interval.start,end:interval.end!,kind:interval.kind}))}));
   setData({blocks:blocks.filter(block=>block.status!=='cancelled'),logged:Math.max(0,loggedMinutes(saved,range,zone,new Date().toISOString()).minutes),closed:isClosed,overdue:overdueCount});
  },()=>{if(live)setError(true);});
  return ()=>{live=false;};
 },[day,zone,version]);
 const projects=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system&&project.status!=='archived'),[home.data]);
 const projectOf=(id:string|null|undefined)=>projects.find(project=>project.id===id);
 const subjectOf=(id:string|null|undefined)=>{const project=projectOf(id);return {subject:kitSubject(project?.subject.name??''),name:project?.subject.name??''};};
 const blocks=(data?.blocks??[]).slice().sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
 const next=nextStudyBlock(blocks,now);
 const left=blocks.filter(block=>block.kind==='study'&&block.status==='planned'&&Date.parse(block.endsAt)>now).length;
 const due=home.data?.due??0,pending=home.data?.pendingProposals??0;
 const ready=!!home.data&&!!data;
 const state:HeroState=heroState({session:!!entry,next,now,closed:!!data?.closed,hasPaths:projects.length>0});
 const word=entry?focusWord(entry):null;
 const focusGoal=Math.max(0,Number(settings.data?.planning?.daily_minimum_minutes)||0);
 const logged=Math.round(data?.logged??0);
 const planned=blocks.filter(block=>block.kind==='study').reduce((sum,block)=>sum+Math.max(0,(Date.parse(block.endsAt)-Date.parse(block.startsAt))/60_000),0);
 const heroLink=entry?.projectId??next?.projectId??null,hero=subjectOf(heroLink);
 async function act(action:()=>Promise<unknown>,after?:()=>void){
  if(busy)return;setBusy(true);setActionError('');
  try{await action();announceFocusChange();refreshFocus();reload();after?.();}
  catch(reason){setActionError(reason instanceof Error?reason.message:'That did not work. Try again.');reload();}
  finally{setBusy(false);}
 }
 // One tap from a cold open: start the next block (verified against the latest plan) and open Focus.
 const startBlock=(block:CalendarBlockRecord)=>act(async()=>{
  const plan=await import('../V6TodayPlan'),latest=await plan.readTodayPlan(day,zone);
  if(latest.plan?.status==='committed'&&latest.items.some(item=>item.disposition==='placed'&&item.blockId===block.id)){await plan.startVerifiedPlannedBlock(day,zone,latest.plan,block);return;}
  const study=getStudyApi();
  if(await study.activeStudyEntry())throw Error('Finish or resume your active focus session first.');
  const fresh=latest.blocks.find(item=>item.id===block.id);
  if(!fresh||fresh.status!=='planned'||fresh.version!==block.version)throw Error('This block changed. Refresh Today.');
  await study.startStudyEntry({source:'timer',intent:fresh.title,calendarBlockId:fresh.id,subjectId:fresh.subjectId??null,projectId:fresh.projectId??null,checkpointId:fresh.checkpointId??null,sessionId:fresh.sessionId??null});
 },()=>navigate('/focus'));
 const startQuick=()=>act(async()=>{
  const study=getStudyApi();
  if(await study.activeStudyEntry())throw Error('A focus session is already running.');
  const project=projectOf(pathId);
  await study.startStudyEntry({source:'timer',intent:intention.trim()||'Focused study',projectId:project?.id??null,subjectId:project?.subject.id??null});
 },()=>{setQuick(false);setIntention('');navigate('/focus');});
 const toggle=(active:StudyEntryRecord)=>act(async()=>{
  const study=getStudyApi(),fresh=await study.activeStudyEntry();
  if(!fresh||fresh.id!==active.id)throw Error('The session changed on another device.');
  if(fresh.status==='paused')await study.resumeStudyEntry(fresh.id,fresh.version);else await study.pauseStudyEntry(fresh.id,fresh.version);
 });
 const clock=entry?focusClock(entry,Date.now()):null;
 const briefing=todayBriefing({session:word,nextIn:next&&state==='upcoming'?startsIn(next.startsAt,now):null,studyBlocksLeft:left,due,overdue:data?.overdue??0});
 const heroCopy:Record<HeroState,{chip:string;title:string;line:string}>={
  session:{chip:word??'Focus',title:entry?.intent??'',line:clock?(clock.mode==='remaining'?clock.label+' left':clock.label+' focused'):''},
  now:{chip:next?'Now · until '+clockTime(next.endsAt,zone):'',title:next?.title??'',line:next?clockTime(next.startsAt,zone)+'–'+clockTime(next.endsAt,zone)+' · '+minutesLabel((Date.parse(next.endsAt)-Date.parse(next.startsAt))/60_000):''},
  upcoming:{chip:next?startsIn(next.startsAt,now):'',title:next?.title??'',line:next?clockTime(next.startsAt,zone)+'–'+clockTime(next.endsAt,zone)+' · '+minutesLabel((Date.parse(next.endsAt)-Date.parse(next.startsAt))/60_000):''},
  closed:{chip:'Day closed ∎',title:minutesLabel(logged)+' studied today',line:'Rest well. Tomorrow starts from your plan.'},
  free:{chip:'Free '+(localMinute(date,zone)>=1020?'evening':localMinute(date,zone)>=720?'afternoon':'morning'),title:'Nothing planned for the rest of today',line:'A little room to think is a good thing.'},
  first:{chip:'First path',title:'Start your first path',line:'A path gives your ideas a place to grow.'},
 };
 const copy=heroCopy[state];
 const todayLabel=new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'long',day:'numeric',month:'long'}).format(date);
 const nowLeft=stripSegment(localMinute(date,zone),localMinute(date,zone)).left;
 return <main id="main-content" className="v7-page v7-today" aria-label="Today">
  <HubHeader title={todayGreeting(date,zone)} date={todayLabel} pending={pending} settings>
   <p className="v7-today-briefing">{ready?briefing:' '}</p>
  </HubHeader>
  {!ready?<div className="v7-today-skeleton" role="status" aria-label="Today loading">
   {error||home.error?<div className="v7-alert" role="alert">Couldn't load Today. Your study data is safe.
    <Button small onClick={()=>{void home.refetch();reload();}}>Retry</Button></div>:<><span/><span/><span/></>}
  </div>:<>
   <section className={'v7-today-hero '+subjectClass(hero.subject)} aria-label="Your next step" data-state={state}>
    <div className="v7-today-hero-emblem" aria-hidden="true"><Emblem subject={hero.subject} seed={heroLink??'today'} size={250} animate={false}/></div>
    <div className="v7-today-hero-labels">
     {hero.subject!=='Other'&&(state==='session'||state==='now'||state==='upcoming')&&<SubjectChip subject={hero.subject} name={hero.name}/>}
     <span className={'v7-badge '+(state==='closed'?'v7-proof-demonstrated':'v7-proof-progress')}>{copy.chip}</span>
    </div>
    <h2 className="v7-today-hero-title">{copy.title}</h2>
    {state==='session'&&clock?<div className="v7-today-hero-clock">
     <span className="v7-today-figure">{clock.label}</span><span className="v7-meta">{clock.mode==='remaining'?'left':'focused'}</span>
     {clock.progress!==null&&<span className="v7-today-hero-meter" aria-hidden="true"><span style={{width:Math.round(clock.progress*100)+'%'}}/></span>}
    </div>:<p className="v7-today-hero-line">{copy.line}</p>}
    <div className="v7-today-hero-actions">
     {state==='session'&&entry&&<><Link className="v7-button v7-primary" to="/focus"><span>Return to focus</span></Link>
      <button type="button" className="v7-today-round" disabled={busy} onClick={()=>{void toggle(entry);}} aria-label={entry.status==='paused'?'Resume focus':'Pause focus'}>
       {entry.status==='paused'?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>}</button></>}
     {(state==='now'||state==='upcoming')&&next&&<><Button variant="primary" disabled={busy} onClick={()=>{void startBlock(next);}}>{state==='now'?'Start focus':'Start now'}</Button>
      <Link className="v7-button v7-secondary" to={'/calendar?view=day&block='+encodeURIComponent(next.id)}><span>Details</span></Link></>}
     {state==='free'&&<><Link className="v7-button v7-primary" to="/calendar?view=day&plan=1"><span>Plan my day</span></Link>
      <Button onClick={()=>setQuick(true)}>Quick focus</Button></>}
     {state==='closed'&&<Link className="v7-button v7-secondary" to="/calendar?view=day&plan=tomorrow"><span>Plan tomorrow</span></Link>}
     {state==='first'&&<Link className="v7-button v7-primary" to="/projects/new"><span>Start a path</span></Link>}
    </div>
   </section>
   {!!actionError&&<p className="v7-alert" role="alert">{actionError} <Button small onClick={reload}>Refresh</Button></p>}
   {state==='first'?<section className="v7-card v7-today-tips" aria-label="Getting started">
    <h2>Three ways to begin</h2>
    <ol><li>Start a path for what you want to prove.</li><li>Connect your tutor and approve its plan in the Inbox.</li><li>Put a study block on today's calendar.</li></ol>
   </section>:<>
   <Link to="/calendar?view=day" className="v7-card v7-today-strip-card" aria-label={'Today: '+minutesLabel(planned)+' planned, '+minutesLabel(logged)+' done. Open Calendar Day.'}>
    <span className="v7-card-heading"><h2>Today</h2><span>{minutesLabel(planned)} planned · {minutesLabel(logged)} done<ChevronRight aria-hidden="true"/></span></span>
    <span className="v7-today-strip" aria-hidden="true">
     {blocks.map(block=>{const segment=stripSegment(localMinute(block.startsAt,zone),localMinute(block.startsAt,zone)+(Date.parse(block.endsAt)-Date.parse(block.startsAt))/60_000);
      return <span key={block.id} data-kind={block.kind} data-past={Date.parse(block.endsAt)<=now||undefined}
       className={'v7-today-strip-block '+subjectClass(subjectOf(block.projectId).subject)} style={{left:segment.left+'%',width:segment.width+'%'} as CSSProperties}/>;})}
     <span className="v7-today-now" style={{left:nowLeft+'%'}}/>
    </span>
    <span className="v7-today-hours" aria-hidden="true">{['06','09','12','15','18','21','24'].map(hour=><span key={hour}>{hour}</span>)}</span>
   </Link>
   {focusGoal>0&&<section className="v7-card" aria-label="Targets">
    <div className="v7-today-target"><span>Focus</span>
     {logged>=focusGoal?<span className="v7-notice"><Check aria-hidden="true"/>Done</span>:<span className="v7-meta">{logged} of {focusGoal} min</span>}
     <span className="v7-today-target-track" role="meter" aria-label="Focus" aria-valuemin={0} aria-valuemax={focusGoal} aria-valuenow={Math.min(logged,focusGoal)}>
      <span style={{width:Math.min(100,logged/focusGoal*100)+'%'}}/></span>
    </div>
   </section>}
   {(due>0||pending>0||(data?.overdue??0)>0)&&<section className="v7-card v7-today-needs" aria-label="Needs you">
    <h2>Needs you</h2>
    {due>0&&<div className="v7-today-need"><Layers aria-hidden="true"/><span><strong>{due} {due===1?'card':'cards'} due</strong><small>about {Math.max(1,Math.round(due*0.4))} min</small></span>
     <Link className="v7-button v7-secondary v7-small" to="/review"><span>Review</span></Link></div>}
    {(data?.overdue??0)>0&&<div className="v7-today-need"><span className="v7-badge v7-tone-warning">{data?.overdue} overdue</span><span/>
     <Link className="v7-button v7-small" to="/calendar?view=agenda"><span>Triage</span></Link></div>}
    {pending>0&&<Link className="v7-today-need" to="/proposals"><Inbox aria-hidden="true"/><span><strong>{pending} {pending===1?'proposal':'proposals'} from your tutor</strong><small>Decide in the Inbox.</small></span><ChevronRight aria-hidden="true"/></Link>}
   </section>}
   {projects.length>0&&<section className="v7-today-continue" aria-label="Continue">
    <div className="v7-card-heading"><h2>Continue</h2><Link to="/projects">All paths<ChevronRight aria-hidden="true"/></Link></div>
    <div className="v7-today-tiles">{projects.slice(0,6).map(project=>{const subject=kitSubject(project.subject.name);
     return <Link key={project.id} className={'v7-today-tile '+subjectClass(subject)} to={'/p/'+encodeURIComponent(project.slug)}>
      <span className="v7-today-tile-cover"><Emblem subject={subject} seed={project.id} size={64} animate={false}/></span>
      <strong>{project.title}</strong><small>{project.current?'Now: '+project.current.title:'Explore the next checkpoint'}</small>
      <span className="v7-today-tile-meter" role="meter" aria-label={project.title+' progress'} aria-valuemin={0} aria-valuemax={Math.max(1,project.total)} aria-valuenow={project.done}>
       <span style={{width:(project.total?Math.min(100,project.done/project.total*100):0)+'%'}}/></span>
     </Link>;})}</div>
   </section>}
   </>}
  </>}
  <Sheet open={quick} onClose={()=>setQuick(false)} title="Start a focus session" eyebrow="Quick focus"
   footer={<Button variant="primary" disabled={busy} onClick={()=>{void startQuick();}}>Start focus</Button>}>
   <label className="v7-today-field">Intention<input data-v7-autofocus="true" maxLength={200} placeholder="What will you understand?" value={intention} onChange={event=>setIntention(event.target.value)}/></label>
   {projects.length>0&&<div className="v7-today-path-chips" role="radiogroup" aria-label="Path">
    {projects.map(project=><button key={project.id} type="button" role="radio" aria-checked={pathId===project.id} className="v7-filter-chip"
     onClick={()=>setPathId(pathId===project.id?null:project.id)}><SubjectMark subject={kitSubject(project.subject.name)}/>{project.title}</button>)}
   </div>}
   {!!actionError&&<p role="alert" className="v7-alert">{actionError}</p>}
  </Sheet>
 </main>;
}
