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
import {calendarRange,dayCapacity,dayKey,savedSlices,shiftDay,shiftMonth,validDayKey,weekStartDay} from '../model';
import {formatCalendarTime} from '../views/WeekView';
import {formatDuration} from '../../../lib/format';
import DayGrid,{type BlockLook} from './DayGrid';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import AgendaList from './AgendaList';
import QuickAddSheet from './QuickAddSheet';
import OverdueSheetV7 from './OverdueSheetV7';
import SuggestionsBanner from './SuggestionsBanner';
import {lengthFromParam} from './quickAddModel';
import {dotClasses,loadRange,parseView,viewLabel} from './viewModel';
import {weekCells,monthLabel,moveToDay,movedLabel} from './dayModel';
import './calendar.css';

const views=['Day','Week','Month','Agenda'] as const;
/** PLAN §6.5: the shape of the day, with a week strip above and a time grid below. */
export default function V7CalendarDay(){
 const home=useHome(),settings=useSettings(),notify=useToast();
 const [params,setParams]=useSearchParams();
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const firstDay=settings.data?.weekStart??1,clock24h=settings.data?.clock24h??true;
 const raw=params.get('date'),today=dayKey(new Date(),zone),date=validDayKey(raw)?raw:today,view=parseView(params.get('view'));
 const [entries,setEntries]=useState<StudyEntryRecord[]>([]),[blocks,setBlocks]=useState<CalendarBlockRecord[]>([]);
 const [dues,setDues]=useState<CalendarDues>(emptyCalendarDues);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[message,setMessage]=useState('');
 const [reload,setReload]=useState(0),[saving,setSaving]=useState(false),[actionError,setActionError]=useState('');
 const [now,setNow]=useState(()=>Date.now());
 const opener=useRef<HTMLElement|null>(null),[overdueOpen,setOverdueOpen]=useState(false);
 const quickOpen=params.get('quick')==='1',planOpen=params.get('plan')==='1';
 const weekStart=weekStartDay(date,firstDay),cells=useMemo(()=>weekCells(weekStart),[weekStart]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30_000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{
  let live=true;setPhase('loading');setMessage('');
  const range=loadRange(view,date,zone,firstDay),api=getStudyApi();
  void Promise.all([api.listStudyEntries(range),api.listCalendarBlocks(range),loadCalendarDues().catch(()=>emptyCalendarDues)])
   .then(([nextEntries,nextBlocks,nextDues])=>{if(!live)return;setEntries(nextEntries);setBlocks(nextBlocks);setDues(nextDues);setPhase('ready');})
   .catch(error=>{if(!live)return;setMessage((error as Error).message||'Could not load the calendar.');setPhase('error');});
  return()=>{live=false;};
 // Day and Week load the week; Month its grid; Agenda two weeks from the date.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[view,view==='day'||view==='week'?weekStart:view==='month'?date.slice(0,7):date,zone,reload]);
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
  const next=new URLSearchParams(params);next.set('view',view);next.set('date',date);next.set(key,value);setParams(next);
 }
 function openDay(day:string){
  const next=new URLSearchParams(params);next.set('view','day');next.set('date',day);next.delete('new');next.delete('edit');next.delete('start');setParams(next);
 }
 function sheetParams(startsAt?:string,edit?:string){
  const next=new URLSearchParams(params);next.set('view',view);next.set('date',date);
  if(edit){next.set('edit',edit);next.delete('new');next.delete('start');}
  else{next.set('new','block');next.delete('edit');if(startsAt)next.set('start',startsAt);else next.delete('start');}
  next.delete('quick');next.delete('task');next.delete('len');
  setParams(next);
 }
 /** Quick-add is the default way to make a block; More options hands over to the full sheet. */
 function quickParams(startsAt?:string){
  const next=new URLSearchParams(params);next.set('view',view);next.set('date',date);next.set('quick','1');next.delete('new');next.delete('edit');
  if(startsAt)next.set('start',startsAt);else next.delete('start');
  setParams(next);
 }
 function closeQuick(){const next=new URLSearchParams(params);['quick','task','len','start'].forEach(key=>next.delete(key));setParams(next,{replace:true});restoreFocus();}
 // Today's links: Triage opens the overdue sheet, Details opens a block, Plan tomorrow plans the next day.
 useEffect(()=>{
  const overdueLink=params.get('overdue')==='1',blockLink=params.get('block'),tomorrow=params.get('plan')==='tomorrow';
  if(!overdueLink&&!blockLink&&!tomorrow)return;
  const next=new URLSearchParams(params);
  if(overdueLink){setOverdueOpen(true);next.delete('overdue');}
  if(blockLink){next.set('edit',blockLink);next.delete('block');}
  if(tomorrow){next.set('plan','1');next.set('view','day');next.set('date',shiftDay(today,1));}
  setParams(next,{replace:true});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[params]);
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
  const range=calendarRange(day,zone);
  return dotClasses(blocks.filter(block=>Date.parse(block.startsAt)<Date.parse(range.end)&&Date.parse(block.endsAt)>Date.parse(range.start)),block=>lookOf(block).subjectClass);
 };
 const unit=view==='month'?'month':'week',step=(direction:1|-1)=>view==='month'?shiftMonth(date,direction):shiftDay(date,direction*7);
 return <main id="main-content" className="v7-page v7-cal" aria-label="Calendar" data-calendar-view={view}>
  <HubHeader title="Calendar" settings/>
  <nav className="v7-hub-tabs" aria-label="Calendar sections"><Link to="/calendar" aria-current="page">Schedule</Link><Link to="/tasks">Tasks</Link></nav>
  <div className="v7-cal-dateRow">
   <h2 className="v7-cal-month" aria-live="polite">{monthWord}</h2>
   <span className="v7-cal-dateActions">
    {(view==='week'||view==='month')&&<><button type="button" className="v7-icon-button" aria-label={'Previous '+unit} onClick={()=>go('date',step(-1))}>‹</button>
     <button type="button" className="v7-icon-button" aria-label={'Next '+unit} onClick={()=>go('date',step(1))}>›</button></>}
    {!isToday&&<button type="button" className="v7-button v7-secondary v7-small" onClick={()=>go('date',today)}><span>Today</span></button>}
    <button type="button" className="v7-button v7-small" aria-label="New time block" disabled={phase!=='ready'}
     onClick={event=>{opener.current=event.currentTarget;quickParams();}}><Plus aria-hidden="true"/><span>New block</span></button>
   </span>
  </div>
  {(view==='day'||view==='agenda')&&<nav className="v7-cal-strip" aria-label="Week">
   <button type="button" className="v7-icon-button" aria-label="Previous week" onClick={()=>go('date',shiftDay(date,-7))}>‹</button>
   {cells.map(cell=>{const dots=stripDots(cell.day);
    return <button key={cell.day} type="button" data-strip-day={cell.day} aria-label={cell.long+(cell.day===today?', today':'')} aria-pressed={cell.day===date}
     data-today={cell.day===today?'true':'false'} className="v7-cal-cell" onClick={()=>go('date',cell.day)}>
     <small aria-hidden="true">{cell.initial}</small><span>{cell.number}</span>
     <i aria-hidden="true">{dots.map(klass=><b key={klass} className={klass}/>)}</i>
    </button>;})}
   <button type="button" className="v7-icon-button" aria-label="Next week" onClick={()=>go('date',shiftDay(date,7))}>›</button>
  </nav>}
  <Segmented label="Calendar view" options={[...views]} value={viewLabel(view)} onChange={value=>go('view',value.toLowerCase())}/>
  {phase==='ready'&&(view==='day'||view==='agenda')&&(overdueCount>0||dueToday.length>0)&&<div className="v7-cal-lane" aria-label="All day">
   {overdueCount>0&&<button type="button" className="v7-badge v7-tone-warning v7-cal-overdue" onClick={()=>setOverdueOpen(true)}>{overdueCount} overdue</button>}
   {dueToday.map(item=><span key={item.key} className="v7-badge v7-tone-info">{item.type==='deadline'?<Flag aria-hidden="true"/>:<Target aria-hidden="true"/>}{item.value.title}</span>)}
  </div>}
  {capacity&&view==='day'&&<p className="v7-cal-capacity" aria-label="Day capacity">Logged <strong>{formatDuration(capacity.logged)}</strong>
   {capacity.busy>0&&<> · Busy <strong>{formatDuration(capacity.busy)}</strong></>} · Planned <strong>{formatDuration(capacity.planned)}</strong></p>}
  {phase==='loading'&&<div className="v7-cal-skeleton" role="status" aria-label="Loading calendar"><span/><span/><span/></div>}
  {phase==='error'&&<div role="alert" className="v7-alert"><p>{message}</p><button type="button" className="v7-button v7-secondary v7-small" onClick={()=>setReload(value=>value+1)}><span>Reload</span></button></div>}
  {!!actionError&&<div role="alert" className="v7-alert"><p>{actionError}</p><button type="button" className="v7-button v7-secondary v7-small" onClick={()=>{setActionError('');setReload(value=>value+1);}}><span>Reload</span></button></div>}
  {phase==='ready'&&view==='week'&&<WeekGrid weekStart={weekStart} date={date} today={today} zone={zone} clock={clock} entries={entries} blocks={blocks} now={now} lookOf={lookOf} onDay={openDay} onEdit={block=>sheetParams(undefined,block.id)}/>}
  {phase==='ready'&&view==='month'&&<MonthSection date={date} today={today} zone={zone} firstDay={firstDay} clock={clock} entries={entries} blocks={blocks} dues={dues} lookOf={lookOf}
   onPick={day=>go('date',day)} onOpen={openDay} onEdit={block=>sheetParams(undefined,block.id)}/>}
  {phase==='ready'&&view==='agenda'&&<AgendaList date={date} today={today} zone={zone} clock={clock} clock24h={clock24h} entries={entries} blocks={blocks} dues={dues} projects={projects}
   lookOf={lookOf} onEdit={block=>sheetParams(undefined,block.id)} onAdd={day=>{
    const next=new URLSearchParams(params);next.set('view','day');next.set('date',day);next.set('quick','1');next.delete('new');next.delete('edit');next.delete('start');setParams(next);}}/>}
  {phase==='ready'&&view==='day'&&date>=today&&<SuggestionsBanner date={date} zone={zone} openPlanner={planOpen}
   onChanged={()=>setReload(value=>value+1)} onPlannerClosed={()=>{if(!planOpen)return;const next=new URLSearchParams(params);next.delete('plan');setParams(next,{replace:true});}}/>}
  {phase==='ready'&&view==='day'&&<>
   <DayGrid date={date} zone={zone} clock={clock} entries={entries} blocks={blocks} busy={saving} now={now} lookOf={lookOf}
    onCreate={startsAt=>quickParams(startsAt)} onEdit={block=>sheetParams(undefined,block.id)} onAdjust={(block,patch)=>{void adjust(block,patch);}}
    onDropDay={dropDay} onSwipe={direction=>go('date',shiftDay(date,direction))}/>
   {dayBlocks.length===0&&entries.length===0&&dueToday.length===0&&<p className="v7-cal-empty">Nothing planned. Tap the grid to add a block.</p>}
  </>}
  <QuickAddSheet open={quickOpen} date={date} zone={zone} start={params.get('start')} taskId={params.get('task')} length={lengthFromParam(params.get('len'))} projects={projects}
   onClose={closeQuick} onSaved={()=>setReload(value=>value+1)} onMore={startsAt=>sheetParams(startsAt)}/>
  <OverdueSheetV7 open={overdueOpen} dues={dues} zone={zone} onClose={()=>setOverdueOpen(false)} onRefresh={()=>setReload(value=>value+1)}/>
  <BlockSheetActions showLaunchers={false} blocks={blocks} date={date} zone={zone} ready={phase==='ready'} onRefresh={()=>setReload(value=>value+1)} onClosed={restoreFocus}/>
 </main>;
}

/** Month's day list: the picked day's items as Agenda-style rows with an Open day button. */
function MonthSection({date,today,zone,firstDay,clock,entries,blocks,dues,lookOf,onPick,onOpen,onEdit}:{
 date:string;today:string;zone:string;firstDay:number;clock:(instant:string)=>string;entries:StudyEntryRecord[];blocks:CalendarBlockRecord[];dues:CalendarDues;
 lookOf:(block:CalendarBlockRecord)=>BlockLook;onPick:(day:string)=>void;onOpen:(day:string)=>void;onEdit:(block:CalendarBlockRecord)=>void;
}){
 const range=calendarRange(date,zone),items=blocks.filter(block=>block.status!=='cancelled'&&Date.parse(block.endsAt)>Date.parse(range.start)&&Date.parse(block.startsAt)<Date.parse(range.end))
  .sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 const due=dueForDay(date,date,zone,dues),logged=savedSlices(entries,range);
 return <>
  <MonthGrid date={date} today={today} zone={zone} firstDay={firstDay} entries={entries} blocks={blocks} dues={dues} lookOf={lookOf} onPick={onPick}/>
  <section className="v7-mo-day" aria-label="Selected day">
   <div className="v7-mo-day-head"><h2 className="v7-headline">{date===today?'Today · ':''}{new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00Z'))}</h2>
    <button type="button" className="v7-button v7-secondary v7-small" onClick={()=>onOpen(date)}><span>Open day</span></button></div>
   {items.length===0&&due.length===0&&logged.length===0&&<p className="v7-cal-empty">Nothing planned.</p>}
   <ul className="v7-ag-list">{logged.map((slice,index)=><li key={slice.entry.id+':'+index} className="v7-ag-row" data-kind="logged"><span className="v7-ag-time">{clock(slice.start)}–{clock(slice.end)}</span>
     <span className="v7-ag-body"><strong>{slice.entry.intent||'Study'}</strong><small>Logged</small></span></li>)}{items.map(block=>{const look=lookOf(block);
    return <li key={block.id} className={'v7-ag-row '+look.subjectClass} data-kind={block.kind==='busy'?'busy':block.status==='done'?'done':'study'}>
     <button type="button" aria-label={'Edit block '+block.title} onClick={()=>onEdit(block)}><span className="v7-ag-time">{clock(block.startsAt)}–{clock(block.endsAt)}</span>
      <span className="v7-ag-body"><strong>{block.title}</strong><small>{block.kind==='busy'?'Busy':block.status==='done'?'Done':'Planned study'}{look.path?' · '+look.path:''}</small></span></button></li>;})}
    {due.map(item=><li key={item.key} className="v7-ag-row" data-kind="due"><span className="v7-ag-time">Due</span><span className="v7-ag-body"><strong>{item.value.title}</strong></span></li>)}</ul>
 </section></>;
}
