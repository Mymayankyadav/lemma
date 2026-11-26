import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,motion,useIsPresent} from 'motion/react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {authSignedOut} from '../../../data/authBoundary';
import {calendarRangeQuery,useCalendarIdentity,useCalendarRange,useCalendarRangeCache,type CalendarRangeData} from '../../../data/study/calendarRange';
import {useSurfaceBeta} from '../../../app/surfaceBeta';
import {useMotionReduced} from '../../../ui/v7/effects';
import {distances,durations,easings} from '../../../ui/v7/motion';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {ViewMenu} from './ViewMenu';
import {useAtlasModel} from '../../../data/adaptive/atlas-api';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router';
import {CalendarDays,ChevronLeft,ChevronRight,Clock,ListTodo,RotateCcw} from 'lucide-react';
import {MoreActions} from '../../../ui/v7/ActionSheet';
import {MEANING_ICON} from '../../../ui/v7/meanings';
import {useHome,useSettings} from '../../../data/hooks';
import {getStudyApi} from '../../../data/study';
import type {CalendarBlockPatch,CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {HubHeader} from '../../../app/v7/V7Shell';
import {useMinWidth} from '../../../app/v7/useMinWidth';
import {Button,DatePicker,IconButton,Segmented,Sheet} from '../../../ui/v7/components';
import {SubjectGlyph,subjectClass} from '../../../ui/v7/Subject';
import {StatusBadge} from '../../../ui/v7/Status';
import {formatDuration,formatShortDate} from '../../../lib/format';
import {useOverdueSummary} from './overdue';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import BlockSheetActions from '../block-sheet/BlockSheetActions';
import {dueForDay,emptyCalendarDues,type CalendarDues} from '../deadlines/DueDayItems';
import {loadCalendarDues} from '../deadlines/load';
import {calendarRange,dayKey,savedSlices,shiftDay,validDayKey,weekStartDay} from '../model';
import {calendarTimeFormatter} from '../views/WeekView';
import DayGrid,{type BlockLook,type SuggestedBlock} from './DayGrid';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import AgendaList,{DueRow} from './AgendaList';
import OverdueSheetV7 from './OverdueSheetV7';
import SuggestionsBanner from './SuggestionsBanner';
import {DEFAULT_LENGTH,lengthFromParam,quickStart} from './quickAddModel';
import {adjacentPeriod,dotClasses,loadRange,parseView,viewLabel,type CalendarView} from './viewModel';
import {weekCells,monthLabel,moveToDay,movedLabel} from './dayModel';
import {useEnterMarks} from '../../../ui/v7/useEnterMarks';
import './calendar.css';
import {isFlagOn} from '../../../flags';
import {RulerSlider} from '../../../ui/v7/RulerSlider';
import {LoggedSessionSheet} from './LoggedSessionSheet';
import {EntrySheetV7} from '../../time-log/v7/EntrySheetV7';

const views=['Day','Week','Month','Agenda'] as const;
const noBlocks:CalendarBlockRecord[]=[],noEntries:StudyEntryRecord[]=[];
type Move={identity:string;block:CalendarBlockRecord;startsAt:string;endsAt:string;day?:string;origin:string};
type PageAnchor={view:CalendarView;date:string;identity:string;data:CalendarRangeData};

/** PLAN §6.5: the shape of the day, with a week strip above and a time grid below. */
export default function V7CalendarDay(){
 const atlas=useAtlasModel(),continuity=useSurfaceBeta();
 const navigate=useNavigate(),location=useLocation();
 const home=useHome(),settings=useSettings(),notify=useToast();
 const [params,setParams]=useSearchParams();
 const zone=settings.data?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC';
 const firstDay=settings.data?.weekStart??1,clock24h=settings.data?.clock24h??true;
 const desktop=useMinWidth(1100),wideControls=useMinWidth(700);
 const raw=params.get('date'),today=dayKey(new Date(),zone),date=validDayKey(raw)?raw:today,view=parseView(params.get('view')??(desktop?'week':'day'));
 const identity=useCalendarIdentity(),currentIdentity=useRef(identity);currentIdentity.current=identity;
 const client=useQueryClient(),cache=useCalendarRangeCache(identity);
 const range=useMemo(()=>loadRange(view,date,zone,firstDay),[view,date,zone,firstDay]);
 const schedule=useCalendarRange(identity,range,continuity);
 const dueQuery=useQuery({queryKey:['calendar-dues',identity],enabled:()=>!authSignedOut(),staleTime:30_000,
  queryFn:()=>loadCalendarDues().catch(()=>emptyCalendarDues)});
 const lastPage=useRef<PageAnchor|null>(null);
 const last=lastPage.current?.identity===identity?lastPage.current:null;
 const data=schedule.data??(continuity?last?.data:undefined);
 const entries=data?.entries??noEntries,dues=dueQuery.data??emptyCalendarDues;
 const [reload,setReload]=useState(0),[saving,setSaving]=useState(false),[actionError,setActionError]=useState('');
 const undoVersions=useRef(new Map<string,CalendarBlockRecord>());
 const [pendingMove,setPendingMove]=useState<Move|null>(null),[rollback,setRollback]=useState<Move|null>(null),moving=useRef(false);
 const refresh=()=>{setReload(value=>value+1);void cache.refresh();void client.invalidateQueries({queryKey:['calendar-dues',identity]});};
 const rawBlocks=data?.blocks??noBlocks;
 const blocks=useMemo(()=>{
  if(!pendingMove||pendingMove.identity!==identity)return rawBlocks;
  const {block,startsAt,endsAt}=pendingMove;
  const adjusted={...block,startsAt,endsAt};
  return rawBlocks.some(item=>item.id===block.id)?rawBlocks.map(item=>item.id===block.id?adjusted:item):[...rawBlocks,adjusted];
 },[pendingMove,rawBlocks,identity]);
 const [now,setNow]=useState(()=>Date.now()),[suggested,setSuggested]=useState<SuggestedBlock[]>([]);
 const [scrub,setScrub]=useState<{date:string;minute:number}|null>(null);
 const [pickingDate,setPickingDate]=useState(false),[browse,setBrowse]=useState(false),[collapsed,setCollapsed]=useState(false);
 const [addedSlots,setAddedSlots]=useState<ReadonlyMap<string,CalendarBlockRecord>>(new Map()),changingSlot=useRef(false);
 const opener=useRef<HTMLElement|null>(null),[overdueOpen,setOverdueOpen]=useState(false);
 const ready=!!schedule.data&&!schedule.isPlaceholderData;
 const shown=ready?{view,date}:continuity?last:null;
 const swap=useRef<'earlier'|'later'|'view'>('view');
 if(ready&&last){
  if(last.view!==view)swap.current='view';
  else if(last.date!==date)swap.current=date>last.date?'later':'earlier';
 }
 useLayoutEffect(()=>{if(ready&&schedule.data)lastPage.current={view,date,identity,data:schedule.data};},[ready,view,date,identity,schedule.data]);
 const [loadingSignal,setLoadingSignal]=useState<{key:string;at:number}|null>(null);
 const waiting=!ready&&!schedule.isError,waitKey=[identity,view,range.start,range.end].join('|');
 useEffect(()=>{
  setLoadingSignal(null);
  if(!waiting||!continuity)return;
  const timer=window.setTimeout(()=>setLoadingSignal({key:waitKey,at:Date.now()}),durations.skeletonDelay*1000);
  return ()=>window.clearTimeout(timer);
 },[waiting,waitKey,continuity]);
 const loadingAt=waiting&&loadingSignal?.key===waitKey?loadingSignal.at:null;
 const showSkeleton=continuity?loadingAt!==null&&(!shown||shown.view!==view):waiting;
 const anchor=useRef<number|null>(null),reduced=useMotionReduced();
 const paneMotion={swap:swap.current,reduced,continuity};
 const handoff=!!location.state?.calendarBlockDraft;
 const [handoffReady,setHandoffReady]=useState<string|null>(null);
 useEffect(()=>{
  if(!handoff||!ready||reduced)return;
  const timer=window.setTimeout(()=>setHandoffReady(location.key),durations.quick*1000);
  return ()=>window.clearTimeout(timer);
 },[handoff,ready,reduced,location.key]);
 const planOpen=params.get('plan')==='1';
 const blockMinutes=lengthFromParam(params.get('len'))??DEFAULT_LENGTH;
 const weekStart=weekStartDay(date,firstDay),cells=useMemo(()=>weekCells(weekStart),[weekStart]);
 const monthStart=date.slice(0,8)+'01';
 const miniMonth=useMemo(()=>{
  if(!desktop)return [];
  const start=weekStartDay(monthStart,firstDay);
  return Array.from({length:42},(_,index)=>{
   const day=shiftDay(start,index);
   return {day,label:formatShortDate(day,{zone})};
  });
 },[desktop,firstDay,monthStart,today,zone]);
 const enter=useEnterMarks(blocks.map(block=>block.id),ready,date+'|'+view);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30_000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{
  if(!continuity||!ready||authSignedOut())return;
  const prefetch=()=>{
   for(const direction of [-1,1]){
    const adjacent=loadRange(view,adjacentPeriod(view,date,direction),zone,firstDay);
    void client.prefetchQuery(calendarRangeQuery(identity,adjacent));
   }
  };
  if(typeof window.requestIdleCallback==='function'){
   const id=window.requestIdleCallback(prefetch,{timeout:400});
   return ()=>window.cancelIdleCallback(id);
  }
  const id=window.setTimeout(prefetch,0);
  return ()=>window.clearTimeout(id);
 },[continuity,ready,view,date,zone,firstDay,identity,client]);
 const projects=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system),[home.data]);
 const lookOf=useCallback((block:CalendarBlockRecord):BlockLook=>{
  const project=projects.find(candidate=>candidate.id===block.projectId);
  return project?{subjectClass:subjectClass(kitSubject(project.subject.name)),path:project.title}:{subjectClass:'',path:''};
 },[projects]);
 const clock=useMemo(()=>calendarTimeFormatter(zone,clock24h),[zone,clock24h]);
 const shownDay=shown?.date??date,shownView=shown?.view??view;
 const dayRange=useMemo(()=>calendarRange(shownDay,zone),[shownDay,zone]);
 const dayBlocks=useMemo(()=>blocks.filter(block=>block.status!=='cancelled'&&Date.parse(block.endsAt)>Date.parse(dayRange.start)&&Date.parse(block.startsAt)<Date.parse(dayRange.end)),[blocks,dayRange]);
 // B3: one shared overdue count — tasks, deadlines and practice topics together, the same number Today and Tasks show.
 const overdueCount=useOverdueSummary(zone,reload).total;
 const dueToday=dueForDay(date,date,zone,dues);
 const displayedDues=dueForDay(shownDay,date,zone,dues);
 const currentPage=useRef({date,view,params});currentPage.current={date,view,params};
 const dueRows=dueToday.map(item=><DueRow key={item.key} item={item} zone={zone} projects={projects}/>);
 function go(key:'view'|'date',value:string){
  const next=new URLSearchParams(params);next.set('view',view);next.set('date',date);next.set(key,value);setParams(next);
 }
 const chooseView=(value:string)=>go('view',value.toLowerCase());
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
 // Today's links: Triage opens the overdue sheet, Details opens a block, Plan tomorrow plans the next day.
 useEffect(()=>{
  const overdueLink=params.get('overdue')==='1',blockLink=params.get('block'),tomorrow=params.get('plan')==='tomorrow';
  const quick=params.get('quick')==='1';
  if(!overdueLink&&!blockLink&&!tomorrow&&!quick)return;
  const next=new URLSearchParams(params);
  if(quick){next.set('new','block');next.delete('quick');}
  if(overdueLink){setOverdueOpen(true);next.delete('overdue');}
  if(blockLink){next.set('edit',blockLink);next.delete('block');}
  if(tomorrow){next.set('plan','1');next.set('view','day');next.set('date',shiftDay(today,1));}
  setParams(next,{replace:true});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[params]);
 const restoreFocus=()=>{const target=opener.current;opener.current=null;if(target?.isConnected)target.focus();};
 // N168: tapping logged study opens its session; the id rides in the URL so Back closes the sheet.
 const loggedId=params.get('logged'),loggedEntry=loggedId?entries.find(entry=>entry.id===loggedId)??null:null;
 const [editingEntry,setEditingEntry]=useState<StudyEntryRecord|null>(null);
 function openEntry(entry:StudyEntryRecord){
  opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const next=new URLSearchParams(params);next.set('logged',entry.id);setParams(next);
 }
 function closeEntry(){const next=new URLSearchParams(params);next.delete('logged');setParams(next,{replace:true});restoreFocus();}
 function adjust(block:CalendarBlockRecord,patch:Pick<CalendarBlockPatch,'startsAt'|'endsAt'>,day?:string){
  if(!patch.startsAt||!patch.endsAt||Date.parse(patch.endsAt)<=Date.parse(patch.startsAt)){
   setActionError('Block must finish after it starts.');return;
  }
  if(patch.startsAt===block.startsAt&&patch.endsAt===block.endsAt)return;
  void saveMove({identity,block,startsAt:patch.startsAt,endsAt:patch.endsAt,day,origin:date});
 }
 async function saveMove(move:Move,retrying=false){
  if(moving.current||changingSlot.current||currentIdentity.current!==move.identity)return;
  moving.current=true;
  const {block,startsAt,endsAt,day,origin}=move,api=getStudyApi(),before={startsAt:block.startsAt,endsAt:block.endsAt};
  setPendingMove(move);setRollback(null);setSaving(true);setActionError('');
  const jump=(destination:string)=>{
   const next=new URLSearchParams(currentPage.current.params);next.set('view','day');next.set('date',destination);setParams(next);
  };
  if(day&&currentPage.current.date===origin&&currentPage.current.view==='day')jump(day);
  function isConflict(error:unknown){
   const reason=error as {code?:string;message?:string}|null;
   return reason?.code==='conflict'||/conflict|version|stale/i.test(reason?.message??'');
  }
  async function save(){
   try{return {moved:(await api.updateCalendarBlock(block.id,block.version,{startsAt,endsAt})).record,confirmed:true};}
   catch(error){
    // A lost response can leave a confirmed move behind. Verify the target after a conflicting retry.
    if(!retrying||!isConflict(error)||currentIdentity.current!==identity)throw error;
    const matching=(await api.listCalendarBlocks(calendarRange(dayKey(new Date(startsAt),zone),zone))).find(candidate=>
     candidate.id===block.id&&candidate.version===block.version+1&&candidate.status===block.status
      &&Date.parse(candidate.startsAt)===Date.parse(startsAt)&&Date.parse(candidate.endsAt)===Date.parse(endsAt));
    if(!matching)throw error;
    return {moved:matching,confirmed:false};
   }
  }
  try{
   const {moved,confirmed}=await save();
   if(currentIdentity.current!==identity)return;
   undoVersions.current.delete(block.id);
   await cache.changeBlock(moved);
   if(!confirmed){notify('The block is already at that time.',{tone:'success'});return;}
   notify(movedLabel(startsAt,endsAt,clock),{tone:'success',action:{label:'Undo',onClick:async()=>{
    try{
     if(currentIdentity.current!==identity)return;
     const newestUndo=undoVersions.current.get(block.id);
     const version=newestUndo&&Date.parse(newestUndo.startsAt)===Date.parse(moved.startsAt)&&Date.parse(newestUndo.endsAt)===Date.parse(moved.endsAt)?newestUndo.version:moved.version;
     const restored=await api.updateCalendarBlock(block.id,version,before);
     undoVersions.current.set(block.id,restored.record);
     await cache.changeBlock(restored.record);
    }catch{notify('Could not undo the move. Reload the calendar and try again.',{tone:'danger'});}
   }}});
  }catch(error){
   if(currentIdentity.current!==identity)return;
   const conflict=isConflict(error);
   setRollback(move);
   if(day&&currentPage.current.date===day&&currentPage.current.view==='day')jump(origin);
   notify(conflict?'This block changed elsewhere. Reload the calendar to try again.':'Could not move the block.',{
    tone:'danger',action:conflict?{label:'Reload',onClick:refresh}:{label:'Retry',onClick:()=>saveMove(move,true)},
   });
  }finally{
   moving.current=false;setPendingMove(null);setSaving(false);
  }
 }
 const dropDay=(block:CalendarBlockRecord,day:string,delta:number)=>{
  try{adjust(block,moveToDay(block,date,day,delta,zone),day);}
  catch{notify('That local time does not exist on the selected day.',{tone:'danger'});}
 };
 const monthWord=monthLabel(date);
 const movePeriod=(direction:number)=>go('date',adjacentPeriod(view,date,direction));
 useEffect(()=>setCollapsed(false),[view]);
 const rankedSlots=(atlas.data?.slots??[]).filter(({slot})=>addedSlots.has(slot.id)
  ||!blocks.some(block=>block.status!=='cancelled'&&Date.parse(block.startsAt)<Date.parse(slot.ends_at)&&Date.parse(block.endsAt)>Date.parse(slot.starts_at)));
 const slotRange=view==='week'?loadRange(view,date,zone,firstDay):dayRange;
 const visibleSlots=rankedSlots.flatMap(({slot}):SuggestedBlock[]=>{
  if(addedSlots.has(slot.id)||Date.parse(slot.starts_at)<Date.parse(slotRange.start)||Date.parse(slot.ends_at)>Date.parse(slotRange.end)
   ||suggested.some(item=>Date.parse(item.start)<Date.parse(slot.ends_at)&&Date.parse(item.end)>Date.parse(slot.starts_at)))return [];
  return [{id:slot.id,start:slot.starts_at,end:slot.ends_at,title:'Study time',busy:saving,onAccept:()=>{void acceptSlot(slot);}}];
 });
 async function acceptSlot(slot:{id:string;starts_at:string;ends_at:string}) {
  if(saving||moving.current||changingSlot.current||addedSlots.has(slot.id))return;
  changingSlot.current=true;setSaving(true);
  try{
   const receipt=await getStudyApi().createCalendarBlock({kind:'study',title:'Study block',startsAt:slot.starts_at,endsAt:slot.ends_at,timeZone:zone});
   setAddedSlots(values=>new Map(values).set(slot.id,receipt.record));await cache.changeBlock(receipt.record);
   notify('Study block added',{tone:'success',action:{label:'Undo',onClick:()=>undoSlot(slot.id,receipt.record)}});
  }catch{notify('Could not add the study block.',{tone:'danger'});}
  finally{changingSlot.current=false;setSaving(false);}
 }
 async function undoSlot(id:string,block:CalendarBlockRecord) {
  if(changingSlot.current||moving.current)return;
  changingSlot.current=true;setSaving(true);
  try{
   await getStudyApi().deleteCalendarBlock(block.id,block.version);
   setAddedSlots(values=>{const next=new Map(values);next.delete(id);return next;});
   await cache.changeBlock({...block,status:'cancelled'});
  }catch{notify('Could not undo the block.',{tone:'danger'});}
  finally{changingSlot.current=false;setSaving(false);}
 }
 const stripDots=(day:string)=>{
  const range=calendarRange(day,zone);
  return dotClasses(blocks.filter(block=>Date.parse(block.startsAt)<Date.parse(range.end)&&Date.parse(block.endsAt)>Date.parse(range.start)),block=>lookOf(block).subjectClass);
 };

 return <main id="main-content" className="v7-page v7-cal" aria-label="Calendar" data-calendar-view={view} data-calendar-continuity={continuity||undefined}>
  {/* N220 (Owner report): the same header as every hub (title, Search, Inbox, then the page's ⋯), the sections as tabs
      beneath it, and the view and the period arrows on their own toolbar row. */}
  <HubHeader title="Calendar" titleFollowsTab={false} extraAction={<MoreActions label="Calendar actions" title="Calendar" items={[
    {label:'Go to today',icon:<RotateCcw/>,onClick:()=>go('date',today)},
    {label:'Browse day',icon:<Clock/>,onClick:()=>{if(view!=='day')openDay(date);setBrowse(true);}},
    {label:'Plan study tasks',icon:<ListTodo/>,onClick:()=>{const next=new URLSearchParams(params);next.set('plan','1');setParams(next);}},
    {label:'Choose date',icon:<CalendarDays/>,onClick:()=>setPickingDate(true)},
   ]}/>}>
   <nav className="v7-hub-tabs" aria-label="Calendar sections"><Link to="/calendar" aria-current="page">Schedule</Link><Link to="/tasks">Tasks</Link></nav>
  </HubHeader>
  <div className="v7-cal-toolbar" role="group" aria-label="Calendar navigation">
   {wideControls?<Segmented label="Calendar view" options={[...views]} value={viewLabel(view)} onChange={chooseView}/>
    :<ViewMenu value={viewLabel(view)} options={views} onChange={chooseView}/>}
   {loadingAt!==null&&shown&&!showSkeleton&&<span className="v7-cal-updating v7-meta" role="status">Updating…</span>}
   <span className="v7-cal-toolbar-gap" aria-hidden="true"/>
   {view==='day'&&<IconButton label="Browse day" onClick={()=>setBrowse(true)}><Clock aria-hidden="true"/></IconButton>}
   <IconButton label={view==='month'?'Previous month':'Previous week'} onClick={()=>movePeriod(-1)}><ChevronLeft aria-hidden="true"/></IconButton>
   <IconButton label={view==='month'?'Next month':'Next week'} onClick={()=>movePeriod(1)}><ChevronRight aria-hidden="true"/></IconButton>
  </div>
  <DatePicker hideTrigger compact open={pickingDate} onOpenChange={setPickingDate} label="Calendar date" value={date} today={today} onChange={day=>go('date',day)}/>
  {desktop&&<aside className="v7-cal-desktop-panel" aria-label="Selected day">
   <h2 className="v7-headline">{monthWord}</h2>
   <div className="v7-mini-month" role="group" aria-label="Choose a date">
    {miniMonth.map(({day,label})=><button key={day} type="button" aria-pressed={day===date} aria-current={day===today?'date':undefined}
     data-outside={day.slice(0,7)!==date.slice(0,7)||undefined} aria-label={label} onClick={()=>go('date',day)}>{Number(day.slice(8))}</button>)}
   </div>
   <h3 className="v7-subhead">{formatShortDate(date,{zone})}</h3>
   {dueQuery.isPending?null:dueToday.length?<ul className="v7-mini-dues">{dueRows}</ul>:<p className="v7-meta">Nothing due on this day.</p>}
   {overdueCount>0&&<StatusBadge tone="warning" onClick={()=>setOverdueOpen(true)} label={overdueCount+' overdue. Triage'}>{overdueCount} overdue · Triage</StatusBadge>}
  </aside>}
  {view==='day'&&!collapsed&&<nav className="v7-cal-strip" aria-label="Week">
   {cells.map(cell=>{const dots=stripDots(cell.day);
    return <button key={cell.day} type="button" data-strip-day={cell.day} aria-label={cell.long+(cell.day===today?', today':'')} aria-pressed={cell.day===date}
     data-today={cell.day===today?'true':'false'} className="v7-cal-cell" onClick={()=>go('date',cell.day)}>
     <small aria-hidden="true">{cell.initial}</small><span>{cell.number}</span>
     <i aria-hidden="true">{dots.map(klass=><SubjectGlyph key={klass} klass={klass}/>)}</i>
    </button>;})}
  </nav>}
  {(view==='day'||view==='week'||view==='agenda'&&!desktop&&overdueCount>0||planOpen)&&<div className="v7-cal-grid-actions" data-view={view}>
   {ready&&overdueCount>0&&<StatusBadge tone="warning" onClick={()=>setOverdueOpen(true)} label={overdueCount+' overdue. Triage'}>{overdueCount} overdue</StatusBadge>}
   {ready&&view==='day'&&!desktop&&dueToday.length>0&&<DayDueDisclosure key={date} count={dueToday.length}>{dueRows}</DayDueDisclosure>}
   {((view==='day'||view==='week')&&date>=today||planOpen)&&<SuggestionsBanner inline date={date} zone={zone} openPlanner={planOpen}
    suggestedTimes={rankedSlots.length>0&&<Disclosure label="Suggested study times"><ul className="v7-cal-ranked-slots" aria-label="Ranked study times">
     {rankedSlots.map(({slot,evidence})=>{
      const added=addedSlots.get(slot.id);
      return <li key={slot.id}>
       <p><strong>{formatShortDate(dayKey(new Date(slot.starts_at),zone),{zone})} · {clock(slot.starts_at)}–{clock(slot.ends_at)}</strong>
        <small>{formatDuration(slot.minutes)} · {evidence}</small></p>
       {added?<span><span role="status">Added</span> <Button small disabled={saving} onClick={()=>{void undoSlot(slot.id,added);}}>Undo</Button></span>
        :<Button small disabled={saving} onClick={()=>{void acceptSlot(slot);}}>Add study block</Button>}
      </li>;
     })}
    </ul></Disclosure>}
    onSuggest={setSuggested} onChanged={refresh}
    onPlannerClosed={()=>{if(!planOpen)return;const next=new URLSearchParams(params);next.delete('plan');setParams(next,{replace:true});}}/>}
  </div>}
  {schedule.isError&&!ready&&<div role="alert" className="v7-alert"><p>Erratum: the calendar didn’t load.</p><Button small onClick={refresh}>Reload</Button></div>}
  {!!actionError&&<div role="alert" className="v7-alert"><p>{actionError}</p><Button small onClick={()=>{setActionError('');refresh();}}>Reload</Button></div>}
  <Sheet open={browse&&view==='day'&&ready} onClose={()=>setBrowse(false)} title="Browse day">
   <RulerSlider label="Time" min={0} max={Math.round((Date.parse(dayRange.end)-Date.parse(dayRange.start))/60000)-5}
    value={scrub?.date===date?scrub.minute:Math.max(0,Math.min(1435,Math.round((now-Date.parse(dayRange.start))/300000)*5))}
    onChange={minute=>setScrub({date,minute})} format={minute=>clock(new Date(Date.parse(dayRange.start)+minute*60000).toISOString())}/>
  </Sheet>
  <div className="v7-cal-content-slot" data-updating={loadingAt!==null&&shown&&!showSkeleton?true:undefined}>
   <AnimatePresence initial={false} custom={paneMotion}>
    {showSkeleton?<CalendarPane key={'loading:'+view} transition={paneMotion}><CalendarSkeleton view={view} shownAt={loadingAt} shaped={continuity}/></CalendarPane>
    :shown&&<CalendarPane key={shownView+'|'+shownDay} transition={paneMotion} busy={!ready}>
     {shownView==='week'&&<WeekGrid weekStart={weekStartDay(shownDay,firstDay)} date={shownDay} today={today} zone={zone} clock={clock} entries={entries} blocks={blocks} now={now} lookOf={lookOf}
      anchor={continuity?anchor:undefined} pendingId={pendingMove?.identity===identity?pendingMove.block.id:undefined} suggested={[...suggested,...visibleSlots]} onDay={openDay} onEdit={block=>sheetParams(undefined,block.id)} onOpenEntry={openEntry}/>}
     {shownView==='month'&&<MonthSection date={shownDay} today={today} zone={zone} firstDay={firstDay} clock={clock} entries={entries} blocks={blocks} dues={dues} lookOf={lookOf}
      onPick={day=>go('date',day)} onOpen={openDay} onEdit={block=>sheetParams(undefined,block.id)}/>}
     {shownView==='agenda'&&<AgendaList date={shownDay} today={today} zone={zone} clock={clock} clock24h={clock24h} entries={entries} blocks={blocks} dues={dues} projects={projects}
      lookOf={lookOf} onEdit={block=>sheetParams(undefined,block.id)} onOpenEntry={openEntry} onAdd={day=>{
       const next=new URLSearchParams(params);next.set('view','day');next.set('date',day);next.set('quick','1');next.delete('new');next.delete('edit');next.delete('start');setParams(next);}}/>}
     {shownView==='day'&&<div className="v7-cal-day-stack" onWheel={()=>setCollapsed(true)} onTouchMove={event=>{if(!(event.target as Element).closest('[data-grid-move],[data-grid-resize]'))setCollapsed(true);}}>
      <DayGrid scrubTo={scrub?.date===shownDay?scrub.minute:null} enterOf={enter} suggested={[...suggested,...visibleSlots]}
       draft={ready&&params.get('new')==='block'?{start:quickStart(date,zone,params.get('start')),minutes:blockMinutes}:null}
       date={shownDay} zone={zone} clock={clock} entries={entries} blocks={blocks} busy={saving} now={now} lookOf={lookOf}
       anchor={continuity?anchor:undefined} pendingId={pendingMove?.identity===identity?pendingMove.block.id:undefined} rollback={continuity&&rollback?.identity===identity?rollback:null}
       onCreate={startsAt=>sheetParams(startsAt)} onEdit={block=>sheetParams(undefined,block.id)} onOpenEntry={openEntry} onAdjust={adjust}
       onDropDay={dropDay} onSwipe={direction=>go('date',shiftDay(date,direction))}/>
      {dayBlocks.length===0&&savedSlices(entries,dayRange).length===0&&displayedDues.length===0&&!suggested.length&&!visibleSlots.length&&
       <div className="v7-cal-empty-state"><EmptyMoment art="calendar" title="Nothing planned" action={{label:'Add a block',onClick:()=>sheetParams()}}/></div>}
     </div>}
    </CalendarPane>}
   </AnimatePresence>
  </div>
  <OverdueSheetV7 open={overdueOpen} dues={dues} zone={zone} onClose={()=>setOverdueOpen(false)} onRefresh={refresh}/>
  {loggedEntry&&<LoggedSessionSheet key={loggedEntry.id+'-'+loggedEntry.version} entry={loggedEntry} look={lookOf({projectId:loggedEntry.projectId} as CalendarBlockRecord)} zone={zone} clock={clock}
   onClose={closeEntry} onChanged={refresh} onEdit={entry=>{const next=new URLSearchParams(params);next.delete('logged');setParams(next,{replace:true});setEditingEntry(entry);}}/>}
  {editingEntry&&<EntrySheetV7 key={editingEntry.id+'-'+editingEntry.version} entry={editingEntry} busy={false} onClose={()=>{setEditingEntry(null);restoreFocus();}}
   onChange={async()=>{setEditingEntry(null);refresh();notify('Session updated',{tone:'success'});}}/>}
  <BlockSheetActions v7 showLaunchers={false} blocks={blocks} date={date} zone={zone} ready={ready&&(!handoff||reduced||handoffReady===location.key)} startingMinutes={blockMinutes} onRefresh={refresh} onClosed={restoreFocus}/>
 </main>;
}

type PaneMotion={swap:'earlier'|'later'|'view';reduced:boolean;continuity:boolean};
const paneVariants={
 enter:({swap,reduced}:PaneMotion)=>({opacity:0,x:reduced||swap==='view'?0:(swap==='later'?1:-1)*distances.swapShift}),
 ready:({reduced}:PaneMotion)=>({opacity:1,x:0,transition:{duration:reduced?durations.reduced:durations.quick,ease:easings.enter}}),
 exit:({swap,reduced}:PaneMotion)=>({opacity:0,transition:{duration:reduced?durations.reduced:swap==='view'?durations.quick:durations.instant,ease:easings.exit}}),
};
function CalendarPane({children,busy=false,transition}: {children:ReactNode;busy?:boolean;transition:PaneMotion}){
 const present=useIsPresent();
 if(!transition.continuity)return present?<div className="v7-cal-pane">{children}</div>:null;
 return <motion.div className="v7-cal-pane" data-exiting={!present||undefined} inert={!present||busy}
  aria-hidden={!present||undefined} aria-busy={busy||undefined}
  custom={transition} variants={paneVariants} initial="enter" animate="ready" exit="exit">{children}</motion.div>;
}
function CalendarSkeleton({view,shownAt,shaped}:{view:CalendarView;shownAt:number|null;shaped:boolean}){
 const cells=!shaped?3:view==='month'?42:view==='week'?49:view==='day'?7:4;
 return <div className="v7-cal-skeleton" data-view={shaped?view:undefined} data-loading-surface={shaped?'section':undefined} data-shown-at={shownAt??undefined} role="status" aria-label={shaped?viewLabel(view)+' calendar loading':'Loading calendar'}>
  {Array.from({length:cells},(_,index)=><span key={index} aria-hidden="true"/>)}
 </div>;
}

function DayDueDisclosure({count,children}:{count:number;children:ReactNode}){
 const [open,setOpen]=useState(false);
 return <>
  <StatusBadge tone="info" label={'View '+count+' due '+(count===1?'item':'items')} onClick={()=>setOpen(true)}>{count} due</StatusBadge>
  <Sheet open={open} onClose={()=>setOpen(false)} title="Deadlines and practice">
   {open&&<ul className="v7-ag-list v7-cal-day-dues">{children}</ul>}
  </Sheet>
 </>;
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
   <div className="v7-mo-day-head"><h2 className="v7-subhead">{date===today?'Today':formatShortDate(date,{zone})}</h2>
    <button type="button" className="v7-button v7-secondary v7-small" onClick={()=>onOpen(date)}><span>Open day</span></button></div>
   {items.length===0&&due.length===0&&logged.length===0&&<p className="v7-cal-empty">Nothing planned.</p>}
   <ul className="v7-ag-list">{logged.map((slice,index)=><li key={slice.entry.id+':'+index} className="v7-ag-row" data-kind="logged"><span className="v7-ag-time">{clock(slice.start)}–{clock(slice.end)}</span>
     <span className="v7-ag-body"><strong>{slice.entry.intent||'Study'}</strong><small>Logged</small></span></li>)}{items.map(block=>{const look=lookOf(block);
    return <li key={block.id} className={'v7-ag-row '+look.subjectClass} data-kind={block.kind==='busy'?'busy':block.status==='done'?'done':'study'}>
     <button type="button" aria-label={'Edit block '+block.title} onClick={()=>onEdit(block)}><span className="v7-ag-time">{clock(block.startsAt)}–{clock(block.endsAt)}</span>
      <span className="v7-ag-body"><strong>{block.title}</strong><small>{block.kind==='busy'?'Busy':block.status==='done'?'Done':look.path??'Study'}</small></span></button></li>;})}
    {due.map(item=><DueRow key={item.key} item={item} zone={zone}/>)}</ul>
 </section></>;
}
