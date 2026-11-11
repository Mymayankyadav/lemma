import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {Check,X} from 'lucide-react';
import {getApi} from '../../../data';
import {useHome,useSettings} from '../../../data/hooks';
import {getDayPlanApi,type DayPlanRecord} from '../../../data/day-plans';
import {civilPlanDate} from '../../../data/day-plans/model';
import {getThoughtApi,type ParkedThought} from '../../../data/parked-thoughts';
import {getStudyApi,type StudyEntryRecord} from '../../../data/study';
import type {CalendarBlockRecord} from '../../../data/study/contract';
import {getTaskApi,type TaskRecord} from '../../../data/tasks';
import {ImmersiveHeader} from '../../../app/v7/V7Shell';
import {Button,Meter as MeterRow} from '../../../ui/v7/components';
import {formatDuration,formatTimeRange,ownerZone} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {calendarRange} from '../../calendar/model';
import {civilDayLabel} from '../../calendar/views/labels';
import {loadAllPracticeTopics} from '../../practice/Page';
import {canCloseOwnerDay,normalizeCarryOverChoices,ownerCivilDate,savedFocusTouchesOwnerDay} from '../model';
import {civilDay} from '../../tasks/v7/tasksModel';
import {STEPS,blockTomorrow,focusMinutes,looseEnds,meters,nextDay,type CloseStep,type LooseEnd} from './closeModel';
import './close.css';

interface DayData{plan:DayPlanRecord|null;tasks:TaskRecord[];thoughts:ParkedThought[];saved:StudyEntryRecord[];blocks:CalendarBlockRecord[];
 tomorrow:CalendarBlockRecord|null;reviewsDone:number|null;practice:{done:number;due:number}|null}
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
 const [step,setStep]=useState<CloseStep>(0),[data,setData]=useState<DayData|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [busy,setBusy]=useState(false),[closed,setClosed]=useState(false),[aim,setAim]=useState(''),[first,setFirst]=useState('');
 const timer=useRef<number|null>(null);
 useEffect(()=>()=>{if(timer.current)window.clearTimeout(timer.current);},[]);
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
   const tomorrow=await getStudyApi().listCalendarBlocks(calendarRange(nextDay(date),tz)).then(list=>list.filter(block=>block.status==='planned').sort((a,b)=>a.startsAt.localeCompare(b.startsAt))[0]??null).catch(()=>null);
   const reviewsDone=await getApi().getInsightData(7).then(insight=>insight.reviews.filter(review=>civilDay(review.reviewedAt,tz)===date).length).catch(()=>null);
   const practice=await loadAllPracticeTopics('active').then(topics=>({
    done:topics.filter(topic=>topic.lastPracticedAt&&civilDay(topic.lastPracticedAt,tz)===date).length,
    due:topics.filter(topic=>topic.nextDueDate&&topic.nextDueDate<=date&&!(topic.lastPracticedAt&&civilDay(topic.lastPracticedAt,tz)===date)).length})).catch(()=>null);
   if(!live)return;
   const ritual=plan?.ritual??{};
   setFirst(typeof ritual.tomorrowFirstTaskId==='string'?ritual.tomorrowFirstTaskId:plan?.tomorrowFirstTaskId??'');
   setAim(typeof ritual.tomorrowAim==='string'?ritual.tomorrowAim:'');
   setData({plan,tasks,thoughts,saved:entries.filter(entry=>savedFocusTouchesOwnerDay(entry,date,tz)),blocks,tomorrow,reviewsDone,practice});
   setError('');
  })().catch(failure=>{if(live)setError(failure instanceof Error?failure.message:'Could not load the day.');});
  return()=>{live=false;};
 },[date,zone,invalid,settings.isPending,reload]);
 const tz=data?.plan?.timeZone??zone;
 const studied=useMemo(()=>(data?.saved??[]).reduce((sum,entry)=>sum+focusMinutes(entry),0),[data]);
 const focusGoal=Math.max(0,Number(settings.data?.planning?.daily_minimum_minutes)||0);
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
   if(choice==='tomorrow')await study.updateCalendarBlock(end.block.id,end.block.version,blockTomorrow(end.block));
   else await study.updateCalendarBlock(end.block.id,end.block.version,{status:'cancelled'});
  }else if(end.kind==='task'){
   await getTaskApi().updateTask(end.task.id,end.task.version,{due:choice==='tomorrow'?{kind:'date',date:tomorrowDate}:{kind:'none'}});
  }else if(choice==='task')await getThoughtApi().convertToTask(end.thought.id,end.thought.version,{title:end.thought.text.slice(0,120),body:end.thought.text});
  else await getThoughtApi().dismissThought(end.thought.id,end.thought.version);
 });
 const moveAll=()=>act(async()=>{
  for(const end of ends){
   if(end.kind==='block')await study.updateCalendarBlock(end.block.id,end.block.version,blockTomorrow(end.block));
   else if(end.kind==='task')await getTaskApi().updateTask(end.task.id,end.task.version,{due:{kind:'date',date:tomorrowDate}});
  }
 });
 async function finish(){
  if(!data||busy)return;
  setBusy(true);setError('');
  try{
   let plan=data.plan;
   if(plan&&plan.status!=='closed'){
    if(!canCloseOwnerDay(date,new Date(),tz))throw new Error('You can close a day once it has started.');
    if(plan.status==='previewed')plan=(await getDayPlanApi().commitPlan(plan.id,plan.version)).record;
    if(plan.status!=='committed')throw new Error('Confirm the day plan before closing.');
    const choice=normalizeCarryOverChoices(data.tasks.map(task=>task.id),new Set(),first);
    await getDayPlanApi().closePlan(plan.id,plan.version,{...plan.ritual,...choice,tomorrowAim:aim.trim()||null});
   }
   setClosed(true);
   const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
   timer.current=window.setTimeout(()=>navigate('/'),reduced?400:1600);
  }catch(failure){setError(failure instanceof Error?failure.message:'Could not close the day.');}
  finally{setBusy(false);}
 }
 const dayName=invalid?'':civilDayLabel(date);
 const leave=<Link className="v7-icon-button" to="/" aria-label="Close"><X aria-hidden="true"/></Link>;
 const dots=<ol className="v7-cd-dots" aria-label={'Step '+(step+1)+' of 3: '+STEPS[step]}>{STEPS.map((name,index)=><li key={name} data-state={index<step?'done':index===step?'now':'next'}><span className="v7-sr-only">{name}</span></li>)}</ol>;
 if(closed)return <main id="main-content" className="v7-cd v7-cd-closed" aria-label="Day closed"><ImmersiveHeader leave={leave} center={dots}/>
  <span className="v7-qed" aria-hidden="true">∎</span><h1 className="v7-hub-title">Day closed</h1><p className="v7-meta" role="status">See you tomorrow.</p></main>;
 const hasPlan=!!data?.plan,already=data?.plan?.status==='closed';
 return <main id="main-content" className="v7-cd" aria-label="Close the day">
  <ImmersiveHeader leave={leave} center={dots}/>
  {invalid&&<p role="alert" className="v7-alert">Choose a real YYYY-MM-DD date.</p>}
  {!!error&&<p role="alert" className="v7-alert">{error}</p>}
  {!invalid&&!data&&!error&&<p role="status" className="v7-meta">Loading your day…</p>}
  {data&&step===0&&<section className="v7-cd-step" aria-label="Today">
   <p className="v7-eyebrow">{date===today?'Today · ':''}{dayName}</p>
   <p className="v7-cd-figure" aria-label={'Studied '+formatDuration(studied)}>{formatDuration(studied)}</p>
   <p className="v7-meta">of focus saved</p>
   {rows.length>0&&<div className="v7-cd-meters">{rows.map(row=><MeterRow key={row.key} label={row.label} value={row.value} max={row.max}/>)}</div>}
   {data.saved.length>0&&<ul className="v7-cd-sessions" aria-label="Sessions">{data.saved.map(entry=><li key={entry.id}><span>{entry.intent||'Study session'}</span><span className="v7-meta">{formatDuration(focusMinutes(entry))}</span></li>)}</ul>}
   <div className="v7-cd-actions"><Button variant="primary" onClick={()=>setStep(1)}>Next</Button></div>
  </section>}
  {data&&step===1&&<section className="v7-cd-step" aria-label="Loose ends">
   <h1 className="v7-hub-title">Loose ends</h1>
   {ends.length===0?<p className="v7-cd-clear"><span className="v7-qed" aria-hidden="true">∎</span>Nothing left open</p>:<>
    {ends.some(end=>end.kind!=='thought')&&<Button variant="ghost" small disabled={busy} onClick={()=>{void moveAll();}}>Move all to tomorrow</Button>}
    <ul className="v7-cd-ends" aria-label="Loose ends">{ends.map(end=><li key={end.kind+end.id}>
     <div><p className="v7-cd-title">{end.title}</p><p className="v7-meta">{end.meta}</p></div>
     <div className="v7-cd-pair">{end.kind==='thought'?<>
      <Button small disabled={busy} aria-label={'Make a task from '+end.title} onClick={()=>{void settle(end,'task');}}>Make a task</Button>
      <Button small variant="ghost" disabled={busy} aria-label={'Dismiss '+end.title} onClick={()=>{void settle(end,'dismiss');}}>Dismiss</Button></>:<>
      <Button small disabled={busy} aria-label={'Move '+end.title+' to tomorrow'} onClick={()=>{void settle(end,'tomorrow');}}>Tomorrow</Button>
      <Button small variant="ghost" disabled={busy} aria-label={'Drop '+end.title} onClick={()=>{void settle(end,'drop');}}>Drop</Button></>}</div></li>)}</ul></>}
   <div className="v7-cd-actions"><Button variant="ghost" onClick={()=>setStep(0)}>Back</Button><Button variant="primary" onClick={()=>setStep(2)}>Next</Button></div>
  </section>}
  {data&&step===2&&<section className="v7-cd-step" aria-label="Tomorrow">
   <h1 className="v7-hub-title">Tomorrow</h1>
   <div className="v7-cd-hero">{data.tomorrow?<><p className="v7-eyebrow">First block</p><p className="v7-cd-title">{data.tomorrow.title}</p>
     <p className="v7-meta">{formatTimeRange(data.tomorrow.startsAt,data.tomorrow.endsAt,{zone:tz,clock24h:true})}</p></>:
     <><p className="v7-cd-title">Nothing planned yet</p><Link className="v7-button v7-secondary v7-small" to={'/calendar?view=day&date='+tomorrowDate}><span>Start a plan for tomorrow</span></Link></>}</div>
   <label className="v7-cd-field">Aim for tomorrow<input maxLength={200} placeholder="What will you understand?" value={aim} onChange={event=>setAim(event.target.value)}/></label>
   {data.tasks.length>0&&<label className="v7-cd-field">First task tomorrow<select value={first} onChange={event=>setFirst(event.target.value)}><option value="">Not chosen yet</option>
    {data.tasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>}
   {!hasPlan&&<p className="v7-meta">You didn't make a day plan for this date, so there is no record to close. Your loose-end choices are already saved.</p>}
   <div className="v7-cd-actions"><Button variant="ghost" onClick={()=>setStep(1)}>Back</Button>
    <Button variant="primary" loading={busy} disabled={already} onClick={()=>{void finish();}}>{hasPlan?(already?'Day already closed':'Close the day'):'Finish'}</Button></div>
   {already&&<p className="v7-meta" role="status"><Check aria-hidden="true"/> This day is closed.</p>}
  </section>}
 </main>;
}
