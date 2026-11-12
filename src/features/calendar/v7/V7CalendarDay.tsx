import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Illustration} from '../../../ui/v7/Illustration';
import {Link,useSearchParams} from 'react-router';
import {ChevronLeft,ChevronRight,Flag,Target} from 'lucide-react';
import {useHome,useSettings} from '../../../data/hooks';
import {getStudyApi} from '../../../data/study';
import type {CalendarBlockPatch,CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {HubHeader} from '../../../app/v7/V7Shell';
import {useMinWidth} from '../../../app/v7/useMinWidth';
import {Segmented} from '../../../ui/v7/components';
import {SubjectGlyph,subjectClass} from '../../../ui/v7/Subject';
import {StatusBadge} from '../../../ui/v7/Status';
import {formatShortDate} from '../../../lib/format';
import {useOverdueSummary} from './overdue';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import BlockSheetActions from '../block-sheet/BlockSheetActions';
import {dueForDay,emptyCalendarDues,type CalendarDues} from '../deadlines/DueDayItems';
import {loadCalendarDues} from '../deadlines/load';
import {calendarRange,dayKey,savedSlices,shiftDay,shiftMonth,validDayKey,weekStartDay} from '../model';
import {formatCalendarTime} from '../views/WeekView';
import DayGrid,{type BlockLook,type SuggestedBlock} from './DayGrid';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import AgendaList,{DueRow} from './AgendaList';
import QuickAddSheet from './QuickAddSheet';
import OverdueSheetV7 from './OverdueSheetV7';
import SuggestionsBanner from './SuggestionsBanner';
import {DEFAULT_LENGTH,lengthFromParam,quickStart} from './quickAddModel';
import {dotClasses,loadRange,parseView,viewLabel} from './viewModel';
import {weekCells,monthLabel,moveToDay,movedLabel} from './dayModel';
import {useEnterMarks} from '../../../ui/v7/useEnterMarks';
import './calendar.css';

const views=['Day','Week','Month','Agenda'] as const;
/** PLAN §6.5: the shape of the day, with a week strip above and a time grid below. */
export default function V7CalendarDay(){
 const home=useHome(),settings=useSettings(),notify=useToast();
 const [params,setParams]=useSearchParams();
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const firstDay=settings.data?.weekStart??1,clock24h=settings.data?.clock24h??true;
 const desktop=useMinWidth(1100);
 const raw=params.get('date'),today=dayKey(new Date(),zone),date=validDayKey(raw)?raw:today,view=parseView(params.get('view')??(desktop?'week':'day'));
 const [entries,setEntries]=useState<StudyEntryRecord[]>([]),[blocks,setBlocks]=useState<CalendarBlockRecord[]>([]);
 const [dues,setDues]=useState<CalendarDues>(emptyCalendarDues);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[message,setMessage]=useState('');
 const [reload,setReload]=useState(0),[saving,setSaving]=useState(false),[actionError,setActionError]=useState('');
 const [now,setNow]=useState(()=>Date.now());
 const [suggested,setSuggested]=useState<SuggestedBlock[]>([]);
 const opener=useRef<HTMLElement|null>(null),[overdueOpen,setOverdueOpen]=useState(false);
 const quickOpen=params.get('quick')==='1',planOpen=params.get('plan')==='1';
 const weekStart=weekStartDay(date,firstDay),cells=useMemo(()=>weekCells(weekStart),[weekStart]);
 // A1: blocks added after this day and view loaded (an accepted suggestion, a quick add) rise in; a loaded day never animates.
 const enter=useEnterMarks(blocks.map(block=>block.id),phase==='ready',date+'|'+view);
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
 // B3: one shared overdue count — tasks, deadlines and practice topics together, the same number Today and Tasks show.
 const overdueCount=useOverdueSummary(zone,reload).total;
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
  next.delete('quick');next.delete('task');next.delete('len');next.delete('title');
  setParams(next);
 }
 /** More options keeps what was typed: title, task link and length ride along to the full sheet. */
 function moreParams(startsAt:string,carry:{title:string;taskId:string|null;minutes:number}){
  const next=new URLSearchParams(params);next.set('view',view);next.set('date',date);next.set('new','block');next.set('start',startsAt);next.delete('edit');next.delete('quick');
  if(carry.title)next.set('title',carry.title);else next.delete('title');
  if(carry.taskId)next.set('task',carry.taskId);else next.delete('task');
  next.set('len',String(carry.minutes));setParams(next);
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
  <HubHeader title="Calendar">
   <nav className="v7-hub-tabs" aria-label="Calendar sections"><Link to="/calendar" aria-current="page">Schedule</Link><Link to="/tasks">Tasks</Link></nav>
  </HubHeader>
  {desktop&&<aside className="v7-cal-desktop-panel" aria-label="Selected day">
   <h2 className="v7-headline">{monthWord}</h2>
   <div className="v7-mini-month" role="group" aria-label="Choose a date">
    {Array.from({length:42},(_,index)=>shiftDay(weekStartDay(date.slice(0,8)+'01',firstDay),index)).map(day=><button key={day} type="button" aria-pressed={day===date} aria-current={day===today?'date':undefined}
     data-outside={day.slice(0,7)!==date.slice(0,7)||undefined} aria-label={formatShortDate(day,{zone})} onClick={()=>go('date',day)}>{Number(day.slice(8))}</button>)}
   </div>
   <h3 className="v7-subhead">{formatShortDate(date,{zone})}</h3>
   {phase==='loading'?<p role="status" className="v7-meta">Loading due items…</p>:dueToday.length?<ul className="v7-mini-dues">{dueToday.map(item=><DueRow key={item.key} item={item} zone={zone} projects={projects}/>)}</ul>:<p className="v7-meta">Nothing due on this day.</p>}
   {overdueCount>0&&<StatusBadge tone="warning" onClick={()=>setOverdueOpen(true)} label={overdueCount+' overdue. Triage'}>{overdueCount} overdue · Triage</StatusBadge>}
  </aside>}
  {/* B4/CD2: one line at 320–390 px — the month label between chevrons, a Today pill only when away. New blocks come from the
      Capture button or a tap on the grid, so there is no "+ New block" in the top third. */}
  <div className="v7-cal-dateRow">
   <button type="button" className="v7-icon-button" aria-label={'Previous '+unit} onClick={()=>go('date',step(-1))}><ChevronLeft aria-hidden="true"/></button>
   <h2 className="v7-cal-month" aria-live="polite">{monthWord}</h2>
   <button type="button" className="v7-icon-button" aria-label={'Next '+unit} onClick={()=>go('date',step(1))}><ChevronRight aria-hidden="true"/></button>
   {!isToday&&<button type="button" className="v7-button v7-secondary v7-small v7-cal-today" onClick={()=>go('date',today)}><span>Today</span></button>}
  </div>
  {(view==='day'||view==='agenda')&&<nav className="v7-cal-strip" aria-label="Week">
   {cells.map(cell=>{const dots=stripDots(cell.day);
    return <button key={cell.day} type="button" data-strip-day={cell.day} aria-label={cell.long+(cell.day===today?', today':'')} aria-pressed={cell.day===date}
     data-today={cell.day===today?'true':'false'} className="v7-cal-cell" onClick={()=>go('date',cell.day)}>
     <small aria-hidden="true">{cell.initial}</small><span>{cell.number}</span>
     <i aria-hidden="true">{dots.map(klass=><SubjectGlyph key={klass} klass={klass}/>)}</i>
    </button>;})}
  </nav>}
  <Segmented label="Calendar view" options={[...views]} value={viewLabel(view)} onChange={value=>go('view',value.toLowerCase())}/>
  {phase==='ready'&&(view==='day'||view==='agenda')&&(overdueCount>0||dueToday.length>0)&&<div className="v7-cal-lane" aria-label="All day">
   {overdueCount>0&&<StatusBadge tone="warning" onClick={()=>setOverdueOpen(true)} label={overdueCount+' overdue. Triage'}>{overdueCount} overdue · Triage</StatusBadge>}
   {dueToday.map(item=><span key={item.key} className="v7-badge v7-tone-info">{item.type==='deadline'?<Flag aria-hidden="true"/>:<Target aria-hidden="true"/>}<span>{item.value.title}</span></span>)}
  </div>}
  {phase==='loading'&&<div className="v7-cal-skeleton" role="status" aria-label="Loading calendar"><span/><span/><span/></div>}
  {phase==='error'&&<div role="alert" className="v7-alert"><p>{message}</p><button type="button" className="v7-button v7-secondary v7-small" onClick={()=>setReload(value=>value+1)}><span>Reload</span></button></div>}
  {!!actionError&&<div role="alert" className="v7-alert"><p>{actionError}</p><button type="button" className="v7-button v7-secondary v7-small" onClick={()=>{setActionError('');setReload(value=>value+1);}}><span>Reload</span></button></div>}
  {phase==='ready'&&view==='week'&&<WeekGrid weekStart={weekStart} date={date} today={today} zone={zone} clock={clock} entries={entries} blocks={blocks} now={now} lookOf={lookOf} onDay={openDay} onEdit={block=>sheetParams(undefined,block.id)}/>}
  {phase==='ready'&&view==='month'&&<MonthSection date={date} today={today} zone={zone} firstDay={firstDay} clock={clock} entries={entries} blocks={blocks} dues={dues} lookOf={lookOf}
   onPick={day=>go('date',day)} onOpen={openDay} onEdit={block=>sheetParams(undefined,block.id)}/>}
  {phase==='ready'&&view==='agenda'&&<AgendaList date={date} today={today} zone={zone} clock={clock} clock24h={clock24h} entries={entries} blocks={blocks} dues={dues} projects={projects}
   lookOf={lookOf} onEdit={block=>sheetParams(undefined,block.id)} onAdd={day=>{
    const next=new URLSearchParams(params);next.set('view','day');next.set('date',day);next.set('quick','1');next.delete('new');next.delete('edit');next.delete('start');setParams(next);}}/>}
  {phase==='ready'&&view==='day'&&date>=today&&<SuggestionsBanner date={date} zone={zone} openPlanner={planOpen} onSuggest={setSuggested}
   onChanged={()=>setReload(value=>value+1)} onPlannerClosed={()=>{if(!planOpen)return;const next=new URLSearchParams(params);next.delete('plan');setParams(next,{replace:true});}}/>}
  {phase==='ready'&&view==='day'&&<>
   <DayGrid enterOf={enter} suggested={suggested} draft={quickOpen?{start:quickStart(date,zone,params.get('start')),minutes:lengthFromParam(params.get('len'))??DEFAULT_LENGTH}:null} date={date} zone={zone} clock={clock} entries={entries} blocks={blocks} busy={saving} now={now} lookOf={lookOf}
    onCreate={startsAt=>quickParams(startsAt)} onEdit={block=>sheetParams(undefined,block.id)} onAdjust={(block,patch)=>{void adjust(block,patch);}}
    onDropDay={dropDay} onSwipe={direction=>go('date',shiftDay(date,direction))}/>
   {dayBlocks.length===0&&entries.length===0&&dueToday.length===0&&<div className="v7-cal-empty-state"><Illustration name="calendar" width={140}/><p className="v7-cal-empty">Nothing planned. Tap the grid to add a block.</p></div>}
  </>}
  <QuickAddSheet open={quickOpen} date={date} zone={zone} start={params.get('start')} taskId={params.get('task')} length={lengthFromParam(params.get('len'))} projects={projects}
   onClose={closeQuick} onSaved={()=>setReload(value=>value+1)} onMore={(startsAt,carry)=>moreParams(startsAt,carry)}/>
  <OverdueSheetV7 open={overdueOpen} dues={dues} zone={zone} onClose={()=>setOverdueOpen(false)} onRefresh={()=>setReload(value=>value+1)}/>
  <BlockSheetActions v7 showLaunchers={false} blocks={blocks} date={date} zone={zone} ready={phase==='ready'} onRefresh={()=>setReload(value=>value+1)} onClosed={restoreFocus}/>
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
   <div className="v7-mo-day-head"><h2 className="v7-subhead">{date===today?'Today · ':''}{formatShortDate(date,{zone})}</h2>
    <button type="button" className="v7-button v7-secondary v7-small" onClick={()=>onOpen(date)}><span>Open day</span></button></div>
   {items.length===0&&due.length===0&&logged.length===0&&<p className="v7-cal-empty">Nothing planned.</p>}
   <ul className="v7-ag-list">{logged.map((slice,index)=><li key={slice.entry.id+':'+index} className="v7-ag-row" data-kind="logged"><span className="v7-ag-time">{clock(slice.start)}–{clock(slice.end)}</span>
     <span className="v7-ag-body"><strong>{slice.entry.intent||'Study'}</strong><small>Logged</small></span></li>)}{items.map(block=>{const look=lookOf(block);
    return <li key={block.id} className={'v7-ag-row '+look.subjectClass} data-kind={block.kind==='busy'?'busy':block.status==='done'?'done':'study'}>
     <button type="button" aria-label={'Edit block '+block.title} onClick={()=>onEdit(block)}><span className="v7-ag-time">{clock(block.startsAt)}–{clock(block.endsAt)}</span>
      <span className="v7-ag-body"><strong>{block.title}</strong><small>{block.kind==='busy'?'Busy':block.status==='done'?'Done':'Planned study'}{look.path?' · '+look.path:''}</small></span></button></li>;})}
    {due.map(item=><DueRow key={item.key} item={item} zone={zone}/>)}</ul>
 </section></>;
}
