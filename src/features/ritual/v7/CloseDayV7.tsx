import {isFlagOn} from '../../../flags';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {Check,Share2,X} from 'lucide-react';
import {getApi} from '../../../data';
import {useHome,useSettings} from '../../../data/hooks';
import {getDayPlanApi,type DayPlanRecord} from '../../../data/day-plans';
import {civilPlanDate} from '../../../data/day-plans/model';
import {getThoughtApi,type ParkedThought} from '../../../data/parked-thoughts';
import {getStudyApi,type StudyEntryRecord} from '../../../data/study';
import type {CalendarBlockRecord} from '../../../data/study/contract';
import {getTaskApi,type TaskRecord} from '../../../data/tasks';
import {ImmersiveHeader} from '../../../app/v7/V7Shell';
import {Button,Meter as MeterRow,Picker} from '../../../ui/v7/components';
import {loadSuggestions} from '../../calendar/v7/suggestions';
import {DEFAULT_PLANNING} from '../../planner/model';
import {formatClock,formatDuration,formatShortDate,ownerZone} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {calendarRange} from '../../calendar/model';
import {loadAllPracticeTopics} from '../../practice/Page';
import {practiceProgress} from '../../practice/progress';
import {ownerCivilDate,savedFocusTouchesOwnerDay} from '../model';
import {civilDay} from '../../tasks/v7/tasksModel';
import {STEPS,blockTomorrow,closeDayRecord,focusMinutes,looseEnds,meters,nextDay,type CloseStep,type LooseEnd} from './closeModel';
import {LottieMoment,warmMoment} from '../../../ui/v7/LottieMoment';
import {playSound,soundsOn} from '../../../ui/v7/sounds';
import './close.css';
import {Loader} from '../../../ui/v7/Loader';

/** LT3 (v7 UX audit r3, Owner decision E20): how long Day closed stays before Today, unless Done is pressed first. The
 *  same with or without motion: reduced motion means less movement, not less time to read the day's ending. */
export const DAY_CLOSED_MS=5000;

interface DayData{plan:DayPlanRecord|null;tasks:TaskRecord[];thoughts:ParkedThought[];saved:StudyEntryRecord[];blocks:CalendarBlockRecord[];
 tomorrow:{title:string;startsAt:string;endsAt:string;suggested:boolean}|null;reviewsDone:number|null;practice:{done:number;due:number}|null}
async function collect<T>(fetch:(cursor:string|null)=>Promise<{items:T[];nextCursor:string|null}>,pages=20):Promise<T[]>{
 const out:T[]=[],seen=new Set<string>();let cursor:string|null=null;
 for(let page=0;page<pages;page++){
  const batch=await fetch(cursor);
  out.push(...batch.items);
  if(!batch.nextCursor)return out;
  if(seen.has(batch.nextCursor)||!batch.items.length)throw new Error('A list did not advance; reload');
  seen.add(batch.nextCursor);cursor=batch.nextCursor;
 }
 throw new Error('A list is too long for this screen');
}

/** PLAN §6.7: Close the day as three steps over the same records as the existing ritual. */
export default function CloseDayV7(){
 const navigate=useNavigate(),notify=useToast(),settings=useSettings(),home=useHome(),[params]=useSearchParams();
 const zone=ownerZone(settings.data),today=useMemo(()=>ownerCivilDate(new Date(),zone),[zone]);
 const given=params.get('date');
 const {date,invalid}=useMemo(()=>{if(given===null)return {date:today,invalid:false};try{return {date:civilPlanDate(given),invalid:false};}catch{return {date:today,invalid:true};}},[given,today]);
 // N157 · U4 S3 / V25 (flag v7Qed): Close the day as one page written like a proof: Given and shown, Left open, Tomorrow
 // opens with, and one button "Close the day ∎". Without the flag, the three steps as before.
 const page=isFlagOn('v7Qed');
 const [step,setStep]=useState<CloseStep>(0),[data,setData]=useState<DayData|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [busy,setBusy]=useState(false),[closed,setClosed]=useState(false),[aim,setAim]=useState(''),[first,setFirst]=useState('');
 const timer=useRef<number|null>(null);
 useEffect(()=>()=>{if(timer.current)window.clearTimeout(timer.current);},[]);
 // LT7: Day closed is one tap away on this page: fetch its player in idle time.
 useEffect(()=>{warmMoment('day-closed');},[]);
 useEffect(()=>{
  if(invalid||settings.isPending)return;
  let live=true;
  void (async()=>{
   const planZone=zone;
   const plans=await getDayPlanApi().listPlans({from:date,through:date,limit:1});
   const plan=plans.items[0]??null,tz=plan?.timeZone??planZone;
   const [tasks,thoughts]=await Promise.all([
    collect(cursor=>getTaskApi().listTasks({status:['backlog','in_progress'],limit:50,cursor})),
    collect(cursor=>getThoughtApi().listThoughts({status:['open'],limit:50,cursor}),10)]);
   const range=calendarRange(date,tz),baseline=Date.parse(date+'T00:00:00Z');
   const [entries,blocks]=await Promise.all([
    getStudyApi().listStudyEntries({start:new Date(baseline-86_400_000).toISOString(),end:new Date(baseline+2*86_400_000).toISOString()}),
    getStudyApi().listCalendarBlocks(range)]);
   const firstStudy=await getStudyApi().listCalendarBlocks(calendarRange(nextDay(date),tz)).then(list=>list.filter(block=>block.status==='planned'&&block.kind==='study').sort((a,b)=>a.startsAt.localeCompare(b.startsAt))[0]??null).catch(()=>null);
   const tomorrow=firstStudy?{title:firstStudy.title,startsAt:firstStudy.startsAt,endsAt:firstStudy.endsAt,suggested:false}
    :await loadSuggestions(nextDay(date),tz).then(next=>{const place=next.result.placements[0];return place?{title:next.tasks.find(task=>task.id===place.taskId)?.title??'Study task',startsAt:place.start,endsAt:place.end,suggested:true}:null;}).catch(()=>null);
   const reviewsDone=await getApi().getInsightData(7).then(insight=>insight.reviews.filter(review=>civilDay(review.reviewedAt,tz)===date).length).catch(()=>null);
   // V03: the same definition as Today's Practice target.
   const practice=await loadAllPracticeTopics('active').then(topics=>practiceProgress(topics,date,tz)).catch(()=>null);
   if(!live)return;
   const ritual=plan?.ritual??{};
   setFirst(typeof ritual.tomorrowFirstTaskId==='string'?ritual.tomorrowFirstTaskId:plan?.tomorrowFirstTaskId??'');
   setAim(typeof ritual.tomorrowAim==='string'?ritual.tomorrowAim:'');
   setData({plan,tasks,thoughts,saved:entries.filter(entry=>savedFocusTouchesOwnerDay(entry,date,tz)),blocks,tomorrow,reviewsDone,practice});
   setError('');
  })().catch(failure=>{if(live)setError(failure instanceof Error?failure.message:'Erratum: the day didn’t load. Try again.');});
  return()=>{live=false;};
 },[date,zone,invalid,settings.isPending,reload]);
 const tz=data?.plan?.timeZone??zone;
 const studied=useMemo(()=>(data?.saved??[]).reduce((sum,entry)=>sum+focusMinutes(entry),0),[data]);
 const focusGoal=Math.max(0,Number((settings.data?.planning??DEFAULT_PLANNING).daily_minimum_minutes)||0);
 const rows=useMemo(()=>meters({focus:studied,focusGoal,reviewsDone:data?.reviewsDone??null,reviewsDue:home.data?.due??0,practiceDone:data?.practice?.done??null,practiceDue:data?.practice?.due??0}),[studied,focusGoal,data,home.data]);
 const ends=useMemo(()=>data?looseEnds({date,zone:tz,blocks:data.blocks,tasks:data.tasks,thoughts:data.thoughts}):[],[data,date,tz]);
 const act=useCallback(async(work:()=>Promise<unknown>)=>{
  if(busy)return;
  setBusy(true);setError('');
  try{await work();setReload(value=>value+1);}catch(failure){setError(failure instanceof Error?failure.message:'Could not save this change.');}
  finally{setBusy(false);}
 },[busy]);
 const tomorrowDate=nextDay(date),study=getStudyApi();
 const settle=(end:LooseEnd,choice:'tomorrow'|'drop'|'task'|'dismiss')=>act(async()=>{
  if(end.kind==='block'){
   if(choice==='tomorrow')await study.updateCalendarBlock(end.block.id,end.block.version,blockTomorrow(end.block,tz));
   else await study.updateCalendarBlock(end.block.id,end.block.version,{status:'cancelled'});
  }else if(end.kind==='task'){
   await getTaskApi().updateTask(end.task.id,end.task.version,{due:choice==='tomorrow'?{kind:'date',date:tomorrowDate}:{kind:'none'}});
  }else if(choice==='task')await getThoughtApi().convertToTask(end.thought.id,end.thought.version,{title:end.thought.text.slice(0,120),body:end.thought.text});
  else await getThoughtApi().dismissThought(end.thought.id,end.thought.version);
 });
 const moveAll=()=>act(async()=>{
  for(const end of ends){
   if(end.kind==='block')await study.updateCalendarBlock(end.block.id,end.block.version,blockTomorrow(end.block,tz));
   else if(end.kind==='task')await getTaskApi().updateTask(end.task.id,end.task.version,{due:{kind:'date',date:tomorrowDate}});
  }
 });
 async function finish(){
  if(!data||busy)return;
  setBusy(true);setError('');
  try{
   await closeDayRecord(getDayPlanApi(),{plan:data.plan,date,zone:tz,aim,first,taskIds:data.tasks.map(task=>task.id)},plan=>setData(previous=>previous?{...previous,plan}:previous));
   setClosed(true);
   // N131 · A5: the low chime, when Sounds is on.
   void playSound('chime',soundsOn(settings.data?.ui));
   // LT3 (E20): Day closed stays until Done, or DAY_CLOSED_MS, the same with or without motion.
   timer.current=window.setTimeout(()=>navigate('/'),DAY_CLOSED_MS);
  }catch(failure){setError(failure instanceof Error?failure.message:'Could not close the day.');setReload(value=>value+1);}
  finally{setBusy(false);}
 }
 const dayName=invalid?'':formatShortDate(date,{zone});
 // CL2/PA8: when no focus was saved, lead with the day's best real figure instead of "0 min".
 const lead=studied>0?{value:String(Math.round(studied)),unit:'min',line:'of focus saved'}
  :(data?.reviewsDone??0)>0?{value:String(data!.reviewsDone),unit:data!.reviewsDone===1?'review':'reviews',line:'answered today'}
  :(data?.practice?.done??0)>0?{value:String(data!.practice!.done),unit:data!.practice!.done===1?'topic':'topics',line:'practised today'}
  :{value:'0',unit:'min',line:'of focus saved — a rest day counts too'};
 /** N131 · A5′ "Share the page": the closed day as a 1200 × 630 notebook page (the drawing module loads only now). Sharing
  *  stops the walk back to Today, since the learner is still here. */
 async function shareDay(){
  if(timer.current){window.clearTimeout(timer.current);timer.current=0;}
  try{
   const {shareCard}=await import('../../../ui/v7/shareImage');
   if(await shareCard({kind:'day',date:dayName||date,figure:lead.value+' '+lead.unit,line:lead.line,aim})==='saved')notify('Image saved',{tone:'success'});
  }catch{notify('Could not make the image',{tone:'danger'});}
 }
 const leave=<Link className="v7-icon-button" to="/" aria-label="Close"><X aria-hidden="true"/></Link>;
 const dots=<ol className="v7-cd-dots" aria-label={'Step '+(step+1)+' of 3: '+STEPS[step]}>{STEPS.map((name,index)=><li key={name} data-state={index<step?'done':index===step?'now':'next'}><span className="v7-sr-only">{name}</span></li>)}</ol>;
 if(closed)return <main id="main-content" className="v7-cd v7-cd-closed" aria-label="Day closed"><ImmersiveHeader leave={leave} center={dots}/>
  <LottieMoment name="closed" animation="day-closed" width={160} className="v7-cd-art" feel/><h1 className="v7-hub-title">Day closed</h1><p className="v7-meta" role="status">See you tomorrow.</p>
  <Button variant="ghost" className="v7-cd-share" onClick={()=>{void shareDay();}}><Share2 aria-hidden="true"/>Share the page</Button>
  <Button variant="primary" className="v7-cd-done" onClick={()=>{if(timer.current)window.clearTimeout(timer.current);navigate('/');}}>Done</Button></main>;
 const already=data?.plan?.status==='closed';
 return <main id="main-content" className="v7-cd" aria-label="Close the day">
  <ImmersiveHeader leave={leave} center={page?<span className="v7-meta">{dayName}</span>:dots}/>
  {page&&data&&<h1 className="v7-hub-title v7-cd-page-title">Close the day</h1>}
  {invalid&&<p role="alert" className="v7-alert">Choose a real YYYY-MM-DD date.</p>}
  {!!error&&<p role="alert" className="v7-alert">{error}</p>}
  {!invalid&&!data&&!error&&<Loader className="v7-meta" label="Loading your day…"/>}
  {data&&(page||step===0)&&<section className="v7-cd-step" aria-label={page?'Given and shown':'Today'}>
   <p className="v7-eyebrow">{date===today?'Today · ':''}{dayName}</p>
   {page?<h2 className="v7-subhead">Given and shown</h2>:<h1 className="v7-hub-title">Today</h1>}
   <p className="v7-cd-figure" aria-label={lead.value+' '+lead.unit+' '+lead.line}>{lead.value}<small>{'\u00a0'+lead.unit}</small></p>
   <p className="v7-meta">{lead.line}</p>
   {rows.length>0&&<div className="v7-cd-meters">{rows.map(row=><MeterRow key={row.key} label={row.label} value={row.value} max={row.max}/>)}</div>}
   {data.saved.length>0&&<ul className="v7-cd-sessions" aria-label="Sessions">{data.saved.map(entry=><li key={entry.id}><span>{entry.intent||'Study session'}</span><span className="v7-meta">{formatDuration(focusMinutes(entry))}</span></li>)}</ul>}
  </section>}
  {data&&(page||step===1)&&<section className="v7-cd-step" aria-label={page?'Left open':'Loose ends'}>
   {page?<h2 className="v7-subhead">Left open</h2>:<h1 className="v7-hub-title">Loose ends</h1>}
   {ends.length===0?<p className="v7-cd-clear"><span className="v7-qed" aria-hidden="true">∎</span>Nothing left open</p>:<>
    {ends.some(end=>end.kind!=='thought')&&<div className="v7-cd-row-actions"><Button variant="ghost" small disabled={busy} onClick={()=>{void moveAll();}}>Move all to tomorrow</Button></div>}
    <ul className="v7-cd-ends" aria-label="Loose ends">{ends.map(end=><li key={end.kind+end.id}>
     <div><p className="v7-cd-title">{end.title}</p><p className="v7-meta">{end.meta}</p></div>
     <div className="v7-cd-pair">{end.kind==='thought'?<>
      <Button small disabled={busy} aria-label={'Make a task from '+end.title} onClick={()=>{void settle(end,'task');}}>Make a task</Button>
      <Button small variant="ghost" disabled={busy} aria-label={'Dismiss '+end.title} onClick={()=>{void settle(end,'dismiss');}}>Dismiss</Button></>:<>
      <Button small disabled={busy} aria-label={'Move '+end.title+' to tomorrow'} onClick={()=>{void settle(end,'tomorrow');}}>Tomorrow</Button>
      <Button small variant="ghost" disabled={busy} aria-label={'Drop '+end.title} onClick={()=>{void settle(end,'drop');}}>Drop</Button></>}</div></li>)}</ul></>}
  </section>}
  {data&&(page||step===2)&&<section className="v7-cd-step" aria-label={page?'Tomorrow opens with':'Tomorrow'}>
   {page?<h2 className="v7-subhead">Tomorrow opens with</h2>:<h1 className="v7-hub-title">Tomorrow</h1>}
   <div className="v7-cd-hero">{data.tomorrow?<><p className="v7-eyebrow">{data.tomorrow.suggested?'Suggested first block':'First block'}</p><p className="v7-cd-title">{data.tomorrow.title}</p>
     <p className="v7-meta">{formatClock(data.tomorrow.startsAt,{zone:tz})}–{formatClock(data.tomorrow.endsAt,{zone:tz})}</p></>:
     <><p className="v7-cd-title">Nothing planned yet</p><Link className="v7-button v7-secondary v7-small" to={'/calendar?view=day&date='+tomorrowDate}><span>Start a plan for tomorrow</span></Link></>}</div>
   <label className="v7-cd-field">Aim for tomorrow<input maxLength={200} placeholder="What will you understand?" value={aim} onChange={event=>setAim(event.target.value)}/></label>
   {data.tasks.length>0&&<Picker label="First task tomorrow" value={data.tasks.find(task=>task.id===first)?.title??'Not chosen yet'}
    options={['Not chosen yet',...data.tasks.map(task=>task.title)]} onChange={title=>setFirst(data.tasks.find(task=>task.title===title)?.id??'')}/>}
   {already&&<p className="v7-meta" role="status"><Check aria-hidden="true"/> This day is closed.</p>}
  </section>}
  {data&&page&&<footer className="v7-cd-footer v7-cd-footer-page">
   <Button variant="primary" loading={busy} disabled={already} onClick={()=>{void finish();}}>{already?'Day already closed':<>Close the day<span className="v7-qed-mark" aria-hidden="true"> ∎</span></>}</Button>
  </footer>}
  {data&&!page&&<footer className="v7-cd-footer">
   {step>0?<Button variant="ghost" onClick={()=>setStep((step-1) as CloseStep)}>Back</Button>:<span/>}
   {step<2?<Button variant="primary" onClick={()=>setStep((step+1) as CloseStep)}>Next</Button>
    :<Button variant="primary" loading={busy} disabled={already} onClick={()=>{void finish();}}>{already?'Day already closed':'Close the day'}</Button>}
  </footer>}
 </main>;
}
