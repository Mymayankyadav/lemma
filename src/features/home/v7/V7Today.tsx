import {Disclosure} from '../../../ui/v7/Disclosure';
import {formatShortDate} from '../../../lib/format';
import {NextStep,TodayFirstRun} from './NextStep';
import {lazy,Suspense,useEffect,useMemo,useState,type CSSProperties} from 'react';
import {haptic} from '../../../ui/v7/haptics';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {Check,ChevronRight,Pause,Play} from 'lucide-react';
import {MEANING_ICON} from '../../../ui/v7/meanings';
import {readWeekdayMinutes,weekdayOwner} from '../../../data/study-weekdays';
import {useQuery} from '@tanstack/react-query';
import {useHome,useSettings} from '../../../data/hooks';
import {getMode} from '../../../data/mode';
import {getStudyApi} from '../../../data/study';
import {getTaskApi,type TaskRecord} from '../../../data/tasks';
import type {PresetRecord} from '../../../data/presets/contract';
import {useToast} from '../../../ui/Toast';
import {loadActiveFocusPresets} from '../../focus/PresetPicker';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {Button,Sheet} from '../../../ui/v7/components';
import {LiveChip,MetaChip,StatusBadge} from '../../../ui/v7/Status';
import {AsOf} from '../../../ui/v7/AsOf';
import {useOnline,useSavedCopyAt} from '../../../ui/v7/savedCopy';
import {DEFAULT_PLANNING} from '../../planner/model';
import {Emblem} from '../../../ui/v7/Emblem';
import {SubjectMark,subjectClass,type Subject} from '../../../ui/v7/Subject';
import {HubHeader} from '../../../app/v7/V7Shell';
import {useReadingIntent} from '../../../app/v7/readingIntent';
import {useMinWidth} from '../../../app/v7/useMinWidth';
import {announceFocusChange,focusClock,focusWord,useActiveFocus,useNow} from '../../../app/v7/focus';
import {kitSubject} from '../../atlas/v7/model';
import {practiceProgress} from '../../practice/progress';
import {useReviewEstimate} from '../../review/v6/estimate';
import {QUICK_NO_TIMER,needsRows,offerClose,practiceToday,presetLine,targetDone,targetRows,tasksDueToday} from './needsModel';
import {isFlagOn} from '../../../flags';
import {Ruler} from './Ruler';
import {clockTime,heroState,localDay,localMinute,minutesLabel,nextStudyBlock,startsIn,stripSegment,stripTicks,stripWindow,todayBriefing,todayGreeting,type HeroState} from './todayModel';
import {useTodayDay} from './useTodayDay';
import './today.css';

const StudyDetails=lazy(()=>import('../../adaptive/panels/LearningDetails').then(module=>({default:module.StudyModelDetailsContent})));
const TodayExams=lazy(()=>import('../../exam/TodayExams').then(module=>({default:module.TodayExams})));
const DesktopDayGrid=lazy(()=>import('../../calendar/v7/DayGrid'));
function SubjectChip({subject,name}:{subject:Subject;name:string}){
 return <span className={'v7-tag '+subjectClass(subject)}><SubjectMark subject={subject}/><span>{name}</span></span>;
}
/** PLAN §6.2: Today decides what to do now, in one glance. */
export default function V7Today(){
 const home=useHome(),settings=useSettings(),navigate=useNavigate(),notify=useToast();
 const readingIntent=useReadingIntent();
 const online=useOnline(),canLoad=online||getMode()==='demo';
 const desktop=useMinWidth(1100),nextStepEnabled=isFlagOn('todayNextStep');
 const {entry}=useActiveFocus();
 const now=useNow(30_000),date=new Date(now);
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const day=localDay(zone,date);
 const [busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[quick,setQuick]=useState(false);
 const [intention,setIntention]=useState(''),[pathId,setPathId]=useState<string|null>(null);
 const [presets,setPresets]=useState<PresetRecord[]>([]),[presetId,setPresetId]=useState<string|null>(null),[showAll,setShowAll]=useState(false);
 const [params,setParams]=useSearchParams();
 useEffect(()=>{if(params.get('quick')!=='1')return;setQuick(true);const next=new URLSearchParams(params);next.delete('quick');setParams(next,{replace:true});},[params,setParams]);
 useEffect(()=>{if(!quick)return;let live=true;void loadActiveFocusPresets().then(rows=>{if(live)setPresets(rows);}).catch(()=>{});return()=>{live=false;};},[quick]);
 const dayQuery=useTodayDay(day,zone,canLoad);
 const {data,isError:error,refetch:reload}=dayQuery;
 const projects=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system&&project.status!=='archived'),[home.data]);
 const projectOf=(id:string|null|undefined)=>projects.find(project=>project.id===id);
 const subjectOf=(id:string|null|undefined)=>{const project=projectOf(id);return {subject:kitSubject(project?.subject.name??''),name:project?.subject.name??''};};
 const blocks=(data?.blocks??[]).slice().sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
 const next=nextStudyBlock(blocks,now);
 const left=blocks.filter(block=>block.kind==='study'&&block.status==='planned'&&Date.parse(block.endsAt)>now).length;
 const due=home.data?.due??0,pending=home.data?.pendingProposals??0;
 const ready=!!home.data&&!!data;
 // N151 · AN3: "as of HH:MM" beside the briefing when any of its numbers come from the saved copy, not the server.
 const asOf=useSavedCopyAt([home,settings,dayQuery]);
 // V03: the same estimate the Review hub prints ("About n min at your pace"); asked for after first paint.
 const reviewMinutes=useReviewEstimate(due,ready);
 const state:HeroState=heroState({session:!!entry,next,now,closed:!!data?.closed,hasPaths:projects.length>0});
 const word=entry?focusWord(entry):null;
 // TD5: the owner's daily focus minimum, or the deployed default (20 min) until it is changed in Settings.
 const planning=settings.data?.planning??DEFAULT_PLANNING;
 const focusGoal=Math.max(0,Number(planning.daily_minimum_minutes)||0);
 const logged=Math.round(data?.logged??0);
 const planned=blocks.filter(block=>block.kind==='study').reduce((sum,block)=>sum+Math.max(0,(Date.parse(block.endsAt)-Date.parse(block.startsAt))/60_000),0);
 const heroLink=entry?.projectId??next?.projectId??null,hero=subjectOf(heroLink);
 async function act(action:()=>Promise<unknown>,after?:()=>void){
  if(busy)return;setBusy(true);setActionError('');
  try{await action();announceFocusChange();void reload();after?.();}
  catch(reason){setActionError(reason instanceof Error?reason.message:'That did not work. Try again.');void reload();}
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
  const preset=presets.find(item=>item.id===presetId);
  await study.startStudyEntry({source:'timer',intent:intention.trim()||preset?.label||'Focused study',projectId:project?.id??preset?.projectId??null,subjectId:project?.subject.id??preset?.subjectId??null,...(preset?{presetId:preset.id}:{})});
 },()=>{setQuick(false);setIntention('');setPresetId(null);navigate('/focus');});
 const toggle=(active:StudyEntryRecord)=>act(async()=>{
  const study=getStudyApi(),fresh=await study.activeStudyEntry();
  if(!fresh||fresh.id!==active.id)throw Error('The session changed on another device.');
  if(fresh.status==='paused')await study.resumeStudyEntry(fresh.id,fresh.version);else await study.pauseStudyEntry(fresh.id,fresh.version);
 });
 const needTasks=useMemo(()=>tasksDueToday(data?.tasks??[],day,zone),[data?.tasks,day,zone]);
 const practice=useMemo(()=>practiceToday(data?.topics??[],day,zone),[data?.topics,day,zone]);
 // V03: the Practice target counts as Close the day does (overdue topics are still owed today).
 const owed=useMemo(()=>practiceProgress(data?.topics??[],day,zone),[data?.topics,day,zone]);
 const targets=targetRows({focus:logged,focusGoal,answered:data?.answered??0,reviewsDue:due,practiceDone:owed.done,practiceDue:owed.due});
 const needs=needsRows({due,tasks:needTasks,topics:practice.due,overdue:data?.overdue??0},4,showAll);
 const hourNow=Math.floor(localMinute(date,zone)/60);
 async function completeTask(task:TaskRecord){
  if(busy)return;setBusy(true);
  try{
   const receipt=await getTaskApi().updateTask(task.id,task.version,{status:'completed'});void reload();
   haptic('check');
   notify('Task completed',{tone:'success',action:{label:'Undo',onClick:()=>{void getTaskApi().updateTask(task.id,receipt.record.version,{status:task.status}).then(()=>reload()).catch(()=>notify('Could not undo that',{tone:'danger'}));}}});
  }catch{notify('Could not complete that task. Try again.',{tone:'danger'});void reload();}finally{setBusy(false);}
 }
 const clock=entry?focusClock(entry,Date.now()):null;
 const briefing=todayBriefing({session:word,nextIn:next&&state==='upcoming'?startsIn(next.startsAt,now):null,studyBlocksLeft:left,due,overdue:data?.overdue??0});
 // PA10/TD6: the strip shows the owner's planning window (widened to fit the day's blocks and now), not 06:00–24:00.
 const windowMinutes=stripWindow({start:planning.window_start,end:planning.window_end,
  blocks:blocks.map(block=>[localMinute(block.startsAt,zone),localMinute(block.startsAt,zone)+(Date.parse(block.endsAt)-Date.parse(block.startsAt))/60_000] as [number,number]),now:localMinute(date,zone)});
 const heroCopy:Record<HeroState,{chip:string;title:string;line:string}>={
  session:{chip:word??'Focus',title:entry?.intent??'',line:clock?(clock.mode==='remaining'?clock.label+' left':clock.label+' focused'):''},
  now:{chip:next?'Now · until '+clockTime(next.endsAt,zone):'',title:next?.title??'',line:next?clockTime(next.startsAt,zone)+'–'+clockTime(next.endsAt,zone)+' · '+minutesLabel((Date.parse(next.endsAt)-Date.parse(next.startsAt))/60_000):''},
  upcoming:{chip:next?startsIn(next.startsAt,now):'',title:next?.title??'',line:next?clockTime(next.startsAt,zone)+'–'+clockTime(next.endsAt,zone)+' · '+minutesLabel((Date.parse(next.endsAt)-Date.parse(next.startsAt))/60_000):''},
  closed:{chip:'Day closed',title:minutesLabel(logged)+' studied today',line:'Rest well. Tomorrow starts from your plan.'},
  free:{chip:'Free '+(localMinute(date,zone)>=1020?'evening':localMinute(date,zone)>=720?'afternoon':'morning'),title:'Nothing planned for the rest of today',line:'A little room to think is a good thing.'},
  first:{chip:'First path',title:'Start your first path',line:'A path gives your ideas a place to grow.'},
 };
 const copy=heroCopy[state];
 const weekday=useQuery({queryKey:['study-weekdays',weekdayOwner()],queryFn:readWeekdayMinutes,enabled:nextStepEnabled&&!!weekdayOwner()});
 const firstRun=nextStepEnabled&&state==='first'&&!!home.data&&canLoad;
 const nextCommitment=blocks.find(block=>block.status==='planned'&&Date.parse(block.startsAt)>now);
 const todayLabel=new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'long',day:'numeric',month:'long'}).format(date);
 const nowLeft=stripSegment(localMinute(date,zone),localMinute(date,zone),windowMinutes).left;
 const continuePaths=projects.length>0&&<section className="v7-today-continue" aria-label="Continue">
  <div className="v7-card-heading"><h2>Continue</h2><Link to="/projects">All paths<ChevronRight aria-hidden="true"/></Link></div>
  <div className="v7-today-tiles">{projects.slice(0,nextStepEnabled?3:6).map(project=>{const subject=kitSubject(project.subject.name);
   return <Link key={project.id} className={'v7-today-tile '+subjectClass(subject)} to={'/p/'+encodeURIComponent(project.slug)} {...readingIntent(project.slug)}>
    <span className="v7-today-tile-cover"><Emblem subject={subject} seed={project.id} size={96} tier="tile" animate={false}/></span>
    <strong>{project.title}</strong><small>{project.current?'Now: '+project.current.title:'Explore the next checkpoint'}</small>
    <span className="v7-today-tile-meter" role="meter" aria-label={project.title+' progress'} aria-valuemin={0} aria-valuemax={Math.max(1,project.total)} aria-valuenow={project.done}>
     <span style={{width:(project.total?Math.min(100,project.done/project.total*100):0)+'%'}}/></span>
   </Link>;})}</div>
 </section>;
 return <main id="main-content" className="v7-page v7-today" aria-label="Today">
  <HubHeader title={firstRun?'Welcome to Lemma':nextStepEnabled&&localMinute(date,zone)<240?'Still up?':todayGreeting(date,zone)} date={nextStepEnabled?formatShortDate(day,{zone}):todayLabel} settings display>
   {!nextStepEnabled&&<p className="v7-today-briefing">{ready?briefing:' '}{ready&&asOf!==null&&<> <AsOf at={asOf} zone={zone}/></>}</p>}
  </HubHeader>
  {isFlagOn('examMode')&&!!home.data?.exam?.sittings.length&&<Suspense fallback={<p role="status">Loading exams…</p>}><TodayExams home={home.data} now={now}/></Suspense>}
  {!ready?<>
   {home.data&&<>
    <p className="v7-today-briefing">{home.data.due} {home.data.due===1?'card':'cards'} due{home.dataUpdatedAt>0&&<> <AsOf at={home.dataUpdatedAt} zone={zone}/></>}</p>
    {continuePaths}
   </>}
   {!canLoad?<p className="v7-subhead">{home.data?'Connect to load today’s schedule.':'Connect once to save Today on this device.'}</p>
    :error||home.error?<div className="v7-alert" role="alert">Couldn't load Today. Your study data is safe.
     <Button small onClick={()=>{void home.refetch();void reload();}}>Retry</Button></div>
    :!home.data&&<div className="v7-today-skeleton" role="status" aria-label="Today loading"><span/><span/><span/></div>}
  </>:<>
   {nextStepEnabled?firstRun?<TodayFirstRun configured={Boolean(typeof weekday.data==='number'?weekday.data:weekday.data?.some(value=>value>0))} tutor={Boolean(settings.data?.connectorLastSeenAt)} onFocus={()=>setQuick(true)}/>
    :<NextStep now={now} day={day} zone={zone} localMinute={localMinute(date,zone)} logged={logged} focusMinutes={settings.data?.focusDefaults?.focus_minutes??25}
      due={due} reviewMinutes={reviewMinutes??10} pending={!!entry} closed={!!data?.closed}
      projects={projects} tasks={data?.tasks??[]} commitment={nextCommitment}
      onFocus={()=>setQuick(true)} onStartFocus={(title,links)=>{void act(async()=>{
        const study=getStudyApi();
        if(await study.activeStudyEntry())throw Error('A focus session is already running.');
        await study.startStudyEntry({source:'timer',intent:title,...links});
      },()=>navigate('/focus'));}}/>
    :<section className={'v7-today-hero v7-starfield '+subjectClass(hero.subject)} aria-label="Your next step" data-state={state}>
    <div className="v7-today-hero-emblem" aria-hidden="true"><Emblem subject={hero.subject} seed={heroLink??'today'} size={164} animate={false}/></div>
    <div className="v7-today-hero-labels">
     {hero.subject!=='Other'&&(state==='session'||state==='now'||state==='upcoming')&&<SubjectChip subject={hero.subject} name={hero.name}/>}
     {state==='upcoming'||state==='now'||state==='session'?<LiveChip>{copy.chip}</LiveChip>
      :state==='closed'?<span className="v7-badge v7-proof-demonstrated"><span className="v7-proof-symbol" aria-hidden="true">∎</span>{copy.chip}</span>:<MetaChip kind="date">{copy.chip}</MetaChip>}
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
     {state!=='free'&&<Button variant="ghost" className="v7-today-quick" onClick={()=>setQuick(true)}>Quick focus</Button>}
     {state==='first'&&<Link className="v7-button v7-primary" to="/projects/new"><span>Start a path</span></Link>}
    </div>
   </section>}
   {!!actionError&&<p className="v7-alert" role="alert">{actionError} <Button small onClick={()=>{void reload();}}>Refresh</Button></p>}
  {state==='first'?!firstRun&&<section className="v7-card v7-today-tips" aria-label="Getting started">
    <h2>Three ways to begin</h2>
    <ol><li>Start a path for what you want to prove.</li><li>Connect your tutor and approve its plan in the Inbox.</li><li>Put a study block on today's calendar.</li></ol>
   </section>:<>
   {(nextStepEnabled||isFlagOn('v7Ruler'))?<Ruler window={windowMinutes} now={localMinute(date,zone)} summary={minutesLabel(planned)+' planned · '+minutesLabel(logged)+' done'}
    blocks={blocks.map(block=>{const start=localMinute(block.startsAt,zone);return {id:block.id,start,end:start+(Date.parse(block.endsAt)-Date.parse(block.startsAt))/60_000,
     klass:subjectClass(subjectOf(block.projectId).subject),past:Date.parse(block.endsAt)<=now,title:block.title};})}/>:
   <Link to="/calendar?view=day" className="v7-card v7-today-strip-card" aria-label={'Today: '+minutesLabel(planned)+' planned, '+minutesLabel(logged)+' done. Open Calendar Day.'}>
    <span className="v7-card-heading"><h2>Today</h2><span>{minutesLabel(planned)} planned · {minutesLabel(logged)} done<ChevronRight aria-hidden="true"/></span></span>
    <span className="v7-today-strip" aria-hidden="true">
     {blocks.map(block=>{const segment=stripSegment(localMinute(block.startsAt,zone),localMinute(block.startsAt,zone)+(Date.parse(block.endsAt)-Date.parse(block.startsAt))/60_000,windowMinutes);
      return <span key={block.id} data-kind={block.kind} data-past={Date.parse(block.endsAt)<=now||undefined}
       className={'v7-today-strip-block '+subjectClass(subjectOf(block.projectId).subject)} style={{left:segment.left+'%',width:segment.width+'%'} as CSSProperties}/>;})}
     <span className="v7-today-now" style={{left:nowLeft+'%'}}/>
    </span>
    <span className="v7-today-hours" aria-hidden="true">{stripTicks(windowMinutes).map(tick=><span key={tick.label} style={{left:tick.left+'%'}}>{tick.label}</span>)}</span>
   </Link>}
   {nextStepEnabled&&<nav className="v7-today-glance" aria-label="Needs you">
    {(data?.overdue??0)>0&&<Link className="v7-meta-chip" to="/calendar?view=day&overdue=1">{data?.overdue} overdue</Link>}
    {needTasks.length>0&&<Link className="v7-meta-chip" to="/tasks">Tasks due</Link>}
    {practice.due.length>0&&<Link className="v7-meta-chip" to="/practice">Practice due</Link>}
    {due>0&&<Link className="v7-meta-chip" to="/review">{due} due</Link>}
    {pending>0&&<Link className="v7-meta-chip" to="/proposals">{pending} to approve</Link>}
   </nav>}
   {targets.length>0&&<Disclosure label="Daily targets" defaultOpen={!nextStepEnabled}><section className="v7-card" aria-label="Targets">
    {targets.map(row=><div key={row.key} className="v7-today-target"><span>{row.label}</span>
     {targetDone(row)?<span className="v7-notice"><Check aria-hidden="true"/>Done</span>:<span className="v7-meta">{row.value} of {row.max}{row.key==='focus'?' min':''}{row.key==='reviews'&&row.max>row.value?' · '+(row.max-row.value)+' left':''}</span>}
     <span className="v7-today-target-track" data-complete={targetDone(row)?'true':undefined} role="meter" aria-label={row.label} aria-valuemin={0} aria-valuemax={row.max} aria-valuenow={Math.min(row.value,row.max)}>
      <span style={{width:Math.min(100,row.value/row.max*100)+'%'}}/></span>
    </div>)}
   </section></Disclosure>}
   {!nextStepEnabled&&(needs.total>0||pending>0)&&<section className="v7-card v7-today-needs" aria-label="Needs you">
    <h2>Needs you</h2>
    {needs.rows.map(row=>row.kind==='overdue'?<div key="overdue" className="v7-today-need"><StatusBadge tone="warning">{row.count} overdue</StatusBadge><span/>
      <Link className="v7-button v7-ghost v7-small" to="/calendar?view=day&overdue=1"><span>Triage</span></Link></div>
     :row.kind==='review'?<div key="review" className="v7-today-need"><MEANING_ICON.review aria-hidden="true"/><span><strong>{row.count} {row.count===1?'card':'cards'} due</strong>{reviewMinutes!==null&&reviewMinutes>0&&<small>about {reviewMinutes} min</small>}</span>
      <Link className="v7-button v7-secondary v7-small" to="/review"><span>Review</span></Link></div>
     :row.kind==='task'?<div key={row.task.id} className="v7-today-need"><span className="v7-check-choice v7-today-check"><input type="checkbox" aria-label={'Complete '+row.task.title} disabled={busy} checked={false} onChange={()=>{void completeTask(row.task);}}/></span>
      <span><strong>{row.task.title}</strong><small>{row.task.priority==='high'?'High · ':row.task.priority==='low'?'Low · ':''}due today{row.task.estimateMinutes?' · '+minutesLabel(row.task.estimateMinutes):''}</small></span><span/></div>
     :<div key={row.topic.id} className="v7-today-need"><MEANING_ICON.practice aria-hidden="true"/><span><strong>{row.topic.title}</strong><small>Practice due today</small></span>
      <Link className="v7-button v7-secondary v7-small" to={'/practice#topic-'+row.topic.id}><span>Practice</span></Link></div>)}
    {needs.hidden>0&&<Button variant="ghost" small onClick={()=>setShowAll(true)}>{'Show all ('+needs.total+')'}</Button>}
    {pending>0&&<Link className="v7-today-need" to="/proposals"><span className="v7-today-fan" aria-hidden="true"><i/><i/><i/></span><span><strong>{pending} {pending===1?'proposal':'proposals'} from your tutor</strong><small>Decide in the Inbox.</small></span><ChevronRight aria-hidden="true"/></Link>}
   </section>}
   {continuePaths}
   <Disclosure label="Study details" mountWhenOpen>
    <Suspense fallback={<p role="status">Loading study details…</p>}><StudyDetails/></Suspense>
   </Disclosure>
   {!nextStepEnabled&&offerClose(hourNow,!!data?.closed)&&<section className="v7-card v7-today-close" aria-label="Close the day">
    <span><strong>{minutesLabel(logged)} studied today</strong><small>Look back and set up tomorrow.</small></span>
    <Link className="v7-button v7-secondary" to="/today/close"><span>Close the day</span></Link></section>}
   </>}
  </>}
  {desktop&&data&&<aside className="v7-today-desktop-grid" aria-label="Today's calendar">
   <div className="v7-card-heading"><h2 className="v7-headline">Today</h2><Link to="/calendar?view=day">Open calendar</Link></div>
   <Suspense fallback={<p role="status">Loading today's grid…</p>}><DesktopDayGrid date={day} zone={zone} clock={instant=>clockTime(instant,zone)} entries={data.entries} blocks={data.blocks} now={now} busy={busy}
    lookOf={block=>({subjectClass:subjectClass(subjectOf(block.projectId).subject),path:projectOf(block.projectId)?.title??''})}
    onCreate={startsAt=>navigate('/calendar?view=day&date='+day+'&quick=1&start='+encodeURIComponent(startsAt))}
    onEdit={block=>navigate('/calendar?view=day&date='+day+'&block='+encodeURIComponent(block.id))}
    onAdjust={(block,patch)=>{void act(()=>getStudyApi().updateCalendarBlock(block.id,block.version,patch));}}
    onDropDay={()=>{}} onSwipe={()=>navigate('/calendar?view=day&date='+day)}/></Suspense>
  </aside>}
  <Sheet open={quick} onClose={()=>setQuick(false)} title="Start a focus session" eyebrow="Quick focus"
   footer={<Button variant="primary" disabled={busy||!!entry} onClick={()=>{void startQuick();}}>Start focus</Button>}>
   {entry&&<p role="status" className="v7-disabled-reason">Unavailable · Finish or resume your running session first.</p>}
   <label className="v7-today-field">Intention<input data-v7-autofocus="true" maxLength={200} placeholder="What will you understand?" value={intention} onChange={event=>setIntention(event.target.value)}/></label>
   <div className="v7-today-presets" role="radiogroup" aria-label="Session style">
    {[{id:null as string|null,line:QUICK_NO_TIMER.line,label:QUICK_NO_TIMER.label},...presets.map(preset=>({id:preset.id as string|null,line:presetLine(preset),label:preset.label}))].map(card=>
     <button key={card.id??'open'} type="button" role="radio" aria-checked={presetId===card.id} className="v7-today-preset" onClick={()=>setPresetId(card.id)}>
      <strong>{card.line}</strong><small>{card.label}</small></button>)}
   </div>
   {projects.length>0&&<div className="v7-today-path-chips" role="radiogroup" aria-label="Path">
    {projects.map(project=><button key={project.id} type="button" role="radio" aria-checked={pathId===project.id} className="v7-filter-chip"
     onClick={()=>setPathId(pathId===project.id?null:project.id)}><SubjectMark subject={kitSubject(project.subject.name)}/>{project.title}</button>)}
   </div>}
   {!!actionError&&<p role="alert" className="v7-alert">{actionError}</p>}
  </Sheet>
 </main>;
}
