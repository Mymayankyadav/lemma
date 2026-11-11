import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {Flag,Plus,Target} from 'lucide-react';
import {useHome,useSettings} from '../../../data/hooks';
import {getStudyApi} from '../../../data/study';
import type {CalendarBlockPatch,CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {HubHeader} from '../../../app/v7/V7Shell';
import {Segmented} from '../../../ui/v7/components';
import {subjectClass} from '../../../ui/v7/Subject';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import BlockSheetActions from '../block-sheet/BlockSheetActions';
import {dueForDay,emptyCalendarDues,type CalendarDues} from '../deadlines/DueDayItems';
import {overdueItems} from '../deadlines/OverdueBanner';
import {loadCalendarDues} from '../deadlines/load';
import {calendarRange,dayCapacity,dayKey,shiftDay,validDayKey,weekStartDay} from '../model';
import {formatCalendarTime} from '../views/WeekView';
import {formatDuration} from '../../../lib/format';
import DayGrid,{type BlockLook} from './DayGrid';
import {weekCells,monthLabel,moveToDay,movedLabel} from './dayModel';
import './calendar.css';

const views=['Day','Week','Month','Agenda'] as const;
/** PLAN §6.5: the shape of the day, with a week strip above and a time grid below. */
export default function V7CalendarDay(){
 const home=useHome(),settings=useSettings(),notify=useToast();
 const [params,setParams]=useSearchParams();
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const firstDay=settings.data?.weekStart??1,clock24h=settings.data?.clock24h??true;
 const raw=params.get('date'),today=dayKey(new Date(),zone),date=validDayKey(raw)?raw:today;
 const [entries,setEntries]=useState<StudyEntryRecord[]>([]),[blocks,setBlocks]=useState<CalendarBlockRecord[]>([]);
 const [dues,setDues]=useState<CalendarDues>(emptyCalendarDues);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[message,setMessage]=useState('');
 const [reload,setReload]=useState(0),[saving,setSaving]=useState(false),[actionError,setActionError]=useState('');
 const [now,setNow]=useState(()=>Date.now());
 const opener=useRef<HTMLElement|null>(null);
 const weekStart=weekStartDay(date,firstDay),cells=useMemo(()=>weekCells(weekStart),[weekStart]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30_000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{
  let live=true;setPhase('loading');setMessage('');
  const range=calendarRange(weekStart,zone,7),api=getStudyApi();
  void Promise.all([api.listStudyEntries(range),api.listCalendarBlocks(range),loadCalendarDues().catch(()=>emptyCalendarDues)])
   .then(([nextEntries,nextBlocks,nextDues])=>{if(!live)return;setEntries(nextEntries);setBlocks(nextBlocks);setDues(nextDues);setPhase('ready');})
   .catch(error=>{if(!live)return;setMessage((error as Error).message||'Could not load the calendar.');setPhase('error');});
  return()=>{live=false;};
 },[weekStart,zone,reload]);
 useEffect(()=>{
  const refetch=()=>setReload(value=>value+1),visible=()=>{if(document.visibilityState==='visible')refetch();};
  window.addEventListener('focus',refetch);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('focus',refetch);document.removeEventListener('visibilitychange',visible);};
 },[]);
 const projects=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system),[home.data]);
 const lookOf=useCallback((block:CalendarBlockRecord):BlockLook=>{
  const project=projects.find(candidate=>candidate.id===block.projectId);
  return project?{subjectClass:subjectClass(kitSubject(project.subject.name)),path:project.title}:{subjectClass:'',path:''};
 },[projects]);
 const clock=useCallback((instant:string)=>formatCalendarTime(instant,zone,clock24h),[zone,clock24h]);
 const dayRange=useMemo(()=>calendarRange(date,zone),[date,zone]);
 const dayBlocks=useMemo(()=>blocks.filter(block=>block.status!=='cancelled'&&Date.parse(block.endsAt)>Date.parse(dayRange.start)&&Date.parse(block.startsAt)<Date.parse(dayRange.end)),[blocks,dayRange]);
 const capacity=phase==='ready'?dayCapacity(date,zone,entries,blocks):null;
 const overdue=overdueItems(dues,zone),overdueCount=overdue.deadlines.length+overdue.topics.length;
 const dueToday=dueForDay(date,date,zone,dues);
 function go(key:'view'|'date',value:string){
  const next=new URLSearchParams(params);next.set('view','day');next.set('date',date);next.set(key,value);setParams(next);
 }
 function sheetParams(startsAt?:string,edit?:string){
  const next=new URLSearchParams(params);next.set('view','day');next.set('date',date);
  if(edit){next.set('edit',edit);next.delete('new');next.delete('start');}
  else{next.set('new','block');next.delete('edit');if(startsAt)next.set('start',startsAt);else next.delete('start');}
  setParams(next);
 }
 const restoreFocus=()=>{const target=opener.current;opener.current=null;if(target?.isConnected)target.focus();};
 async function adjust(block:CalendarBlockRecord,patch:Pick<CalendarBlockPatch,'startsAt'|'endsAt'>){
  if(saving)return;
  if(!patch.startsAt||!patch.endsAt||Date.parse(patch.endsAt)<=Date.parse(patch.startsAt)){setActionError('Block must finish after it starts.');return;}
  const before={startsAt:block.startsAt,endsAt:block.endsAt},api=getStudyApi();
  setSaving(true);setActionError('');
  try{
   const receipt=await api.updateCalendarBlock(block.id,block.version,patch);
   setBlocks(old=>old.map(item=>item.id===block.id?receipt.record:item));
   notify(movedLabel(patch.startsAt,patch.endsAt,clock),{tone:'success',action:{label:'Undo',onClick:()=>{
    void api.updateCalendarBlock(block.id,receipt.record.version,before).then(()=>{setReload(value=>value+1);notify('Calendar change undone',{tone:'success'});})
     .catch(error=>{setActionError((error as Error).message||'Could not undo.');setReload(value=>value+1);});
   }}});
  }catch(error){
   const text=(error as {code?:string;message?:string}|null);
   setActionError(text?.code==='conflict'||/conflict|version|stale/i.test(text?.message??'')?'Changed elsewhere, reload to see the latest changes.':text?.message||'Could not save the block. Try again.');
  }finally{setSaving(false);}
 }
 const dropDay=(block:CalendarBlockRecord,day:string,delta:number)=>{
  const patch=moveToDay(block,date,day,delta,zone);
  void adjust(block,patch).then(()=>go('date',day));
 };
 const monthWord=monthLabel(date),isToday=date===today;
 const stripDots=(day:string)=>{
  const seen=new Set<string>(),out:string[]=[];
  for(const block of blocks){
   if(block.kind!=='study'||block.status==='cancelled')continue;
   const range=calendarRange(day,zone);
   if(!(Date.parse(block.startsAt)<Date.parse(range.end)&&Date.parse(block.endsAt)>Date.parse(range.start)))continue;
   const klass=lookOf(block).subjectClass||'v7-subject-none';
   if(!seen.has(klass)){seen.add(klass);out.push(klass);}
  }
  return out.slice(0,3);
 };
 return <main id="main-content" className="v7-page v7-cal" aria-label="Calendar" data-calendar-view="day">
  <HubHeader title="Calendar" settings/>
  <div className="v7-cal-dateRow">
   <h2 className="v7-cal-month" aria-live="polite">{monthWord}</h2>
   <span className="v7-cal-dateActions">
    {!isToday&&<button type="button" className="v7-button v7-secondary v7-small" onClick={()=>go('date',today)}><span>Today</span></button>}
    <button type="button" className="v7-button v7-small" aria-label="New time block" disabled={phase!=='ready'}
     onClick={event=>{opener.current=event.currentTarget;sheetParams();}}><Plus aria-hidden="true"/><span>New block</span></button>
   </span>
  </div>
  <nav className="v7-cal-strip" aria-label="Week">
   <button type="button" className="v7-icon-button" aria-label="Previous week" onClick={()=>go('date',shiftDay(date,-7))}>‹</button>
   {cells.map(cell=>{const dots=stripDots(cell.day);
    return <button key={cell.day} type="button" data-strip-day={cell.day} aria-label={cell.long+(cell.day===today?', today':'')} aria-pressed={cell.day===date}
     data-today={cell.day===today?'true':'false'} className="v7-cal-cell" onClick={()=>go('date',cell.day)}>
     <small aria-hidden="true">{cell.initial}</small><span>{cell.number}</span>
     <i aria-hidden="true">{dots.map(klass=><b key={klass} className={klass}/>)}</i>
    </button>;})}
   <button type="button" className="v7-icon-button" aria-label="Next week" onClick={()=>go('date',shiftDay(date,7))}>›</button>
  </nav>
  <Segmented label="Calendar view" options={[...views]} value="Day" onChange={value=>go('view',value.toLowerCase())}/>
  {phase==='ready'&&(overdueCount>0||dueToday.length>0)&&<div className="v7-cal-lane" aria-label="All day">
   {overdueCount>0&&<Link className="v7-badge v7-tone-warning" to="/calendar?view=agenda">{overdueCount} overdue</Link>}
   {dueToday.map(item=><span key={item.key} className="v7-badge v7-tone-info">{item.type==='deadline'?<Flag aria-hidden="true"/>:<Target aria-hidden="true"/>}{item.value.title}</span>)}
  </div>}
  {capacity&&<p className="v7-cal-capacity" aria-label="Day capacity">Logged <strong>{formatDuration(capacity.logged)}</strong>
   {capacity.busy>0&&<> · Busy <strong>{formatDuration(capacity.busy)}</strong></>} · Planned <strong>{formatDuration(capacity.planned)}</strong></p>}
  {phase==='loading'&&<div className="v7-cal-skeleton" role="status" aria-label="Loading calendar"><span/><span/><span/></div>}
  {phase==='error'&&<div role="alert" className="v7-alert"><p>{message}</p><button type="button" className="v7-button v7-secondary v7-small" onClick={()=>setReload(value=>value+1)}><span>Reload</span></button></div>}
  {!!actionError&&<div role="alert" className="v7-alert"><p>{actionError}</p><button type="button" className="v7-button v7-secondary v7-small" onClick={()=>{setActionError('');setReload(value=>value+1);}}><span>Reload</span></button></div>}
  {phase==='ready'&&<>
   <DayGrid date={date} zone={zone} clock={clock} entries={entries} blocks={blocks} busy={saving} now={now} lookOf={lookOf}
    onCreate={startsAt=>sheetParams(startsAt)} onEdit={block=>sheetParams(undefined,block.id)} onAdjust={(block,patch)=>{void adjust(block,patch);}}
    onDropDay={dropDay} onSwipe={direction=>go('date',shiftDay(date,direction))}/>
   {dayBlocks.length===0&&entries.length===0&&dueToday.length===0&&<p className="v7-cal-empty">Nothing planned. Tap the grid to add a block.</p>}
  </>}
  <BlockSheetActions showLaunchers={false} blocks={blocks} date={date} zone={zone} ready={phase==='ready'} onRefresh={()=>setReload(value=>value+1)} onClosed={restoreFocus}/>
 </main>;
}
