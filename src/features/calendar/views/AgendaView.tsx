import {useMemo,useState,type MouseEvent} from 'react';
import type {CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import type {ProjectSummary} from '../../../data/types';
import {getStudyApi} from '../../../data/study';
import Dialog from '../../../ui/v6/Dialog';
import {useToast} from '../../../ui/Toast';
import {formatDuration} from '../../../lib/format';
import {agendaGroups,calendarRange,dayKey,type LoggedSlice} from '../model';
import {DueDayItems,dueForDay,type CalendarDues} from '../deadlines/DueDayItems';
import {useCalendarOverlaps} from '../overlaps/OverlapMarkers';
import {matchingAcknowledgement,overlapWindows,type CalendarOverlap} from '../overlaps/model';
import {formatCalendarTime} from './WeekView';
import {civilDayLabel,subjectStripe} from './labels';

const action='min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-label text-ink';

/** N116 (mockup `calendar.css`) kept: planned study has a dashed rule, busy time a double one. N121 adds the subject stripe. */
export function blockCardClass(block:CalendarBlockRecord):string{
 return 'cr-agenda-block relative w-full min-w-0 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3 text-left text-body '+
  (block.kind==='busy'?'border-l-[3px] border-l-[var(--edge)] [border-left-style:double]':'border-l-[3px] border-l-[var(--accent)] [border-left-style:dashed]');
}
export function BlockLines({block,zone,clock24h}:{block:CalendarBlockRecord;zone:string;clock24h:boolean}){
 const minutes=Math.max(0,Math.round((Date.parse(block.endsAt)-Date.parse(block.startsAt))/60000));
 const icon=block.kind==='busy'?'◷':block.status==='done'?'✓':'▱';
 const state=block.kind==='busy'?'Busy':block.status==='done'?'Done':'Planned study';
 return <>
  <span className="block text-label tabular-nums text-ink-2">{formatCalendarTime(block.startsAt,zone,clock24h)}–{formatCalendarTime(block.endsAt,zone,clock24h)}</span>
  <strong className="mt-1 block break-words text-body font-medium text-ink">{block.title}</strong>
  <span className="text-label text-ink-2"><span aria-hidden="true">{icon} </span>{state} · {formatDuration(minutes)}</span>
 </>;
}
function SavedCard({slice,zone,clock24h}:{slice:LoggedSlice;zone:string;clock24h:boolean}){
 const minutes=Math.round((Date.parse(slice.end)-Date.parse(slice.start))/60000);
 return <article className="cr-agenda-saved min-w-0 rounded-[12px] border border-[var(--hair)] border-l-[3px] border-l-[var(--good,var(--accent))] bg-[var(--paper)] p-3 text-body">
  <span className="block text-label tabular-nums text-ink-2">{formatCalendarTime(slice.start,zone,clock24h)}–{formatCalendarTime(slice.end,zone,clock24h)}</span>
  <strong className="mt-1 block break-words text-body font-medium text-ink">{slice.entry.intent||'Study'}</strong>
  <span className="text-label text-ink-2"><span aria-hidden="true">✓ </span>Logged · {formatDuration(minutes)}</span>
 </article>;
}

/** N121 B6: seven days, every day headed, overlaps named and resolvable, cards tappable. */
export default function AgendaView({date,zone,clock24h,entries,blocks,dues,projects,onEdit,onRefresh}:{
 date:string;zone:string;clock24h:boolean;entries:StudyEntryRecord[];blocks:CalendarBlockRecord[];
 dues:CalendarDues;projects:readonly ProjectSummary[];
 onEdit:(block:CalendarBlockRecord,event?:MouseEvent<HTMLElement>)=>void;onRefresh:()=>void;
}){
 const notify=useToast();
 const range=useMemo(()=>calendarRange(date,zone,7),[date,zone]);
 const controls=useCalendarOverlaps(range);
 const [resolving,setResolving]=useState<CalendarOverlap|null>(null);
 const [busy,setBusy]=useState(false);
 const groups=agendaGroups(date,zone,entries,blocks);
 const today=dayKey(new Date(),zone);
 const dueToday=dueForDay(today,date,zone,dues);
 const byId=new Map(blocks.map(block=>[block.id,block]));
 const pairOf=(row:CalendarOverlap)=>{
  const pair=row.participants.map(p=>byId.get(p.id)??blocks.find(b=>b.id.toLowerCase()===p.id)).filter((b):b is CalendarBlockRecord=>!!b);
  return pair.sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 };
 async function shorten(row:CalendarOverlap){
  const [first,second]=pairOf(row);
  if(!first||!second||busy||Date.parse(second.startsAt)<=Date.parse(first.startsAt))return;
  setBusy(true);
  const api=getStudyApi();
  try{
   const receipt=await api.updateCalendarBlock(first.id,first.version,{startsAt:first.startsAt,endsAt:second.startsAt});
   setResolving(null);onRefresh();
   notify(first.title+' now ends at '+formatCalendarTime(second.startsAt,zone,clock24h),{tone:'success',action:{label:'Undo',onClick:()=>{
    void api.updateCalendarBlock(first.id,receipt.record.version,{startsAt:first.startsAt,endsAt:first.endsAt}).then(onRefresh)
     .catch(()=>{notify('Could not undo. Reload the calendar.',{tone:'danger'});onRefresh();});
   }}});
  }catch{notify('Could not shorten the block. Reload and try again.',{tone:'danger'});onRefresh();}
  finally{setBusy(false)}
 }
 async function keepBoth(row:CalendarOverlap){
  if(busy)return;setBusy(true);
  try{await controls.acknowledge(row,'keep_both');setResolving(null);notify('Kept both blocks',{tone:'success'});}
  finally{setBusy(false)}
 }
 const resolvingPair=resolving?pairOf(resolving):[];
 return <div aria-label="Next seven days" className="flex flex-col gap-1">
  {dueToday.length>0&&date<=today&&today<=groups[groups.length-1].day&&<p className="self-start rounded-[8px] border border-[var(--hair)] bg-[var(--paper-2)] px-3 py-2 text-label text-ink">
   Due today: {dueToday.map(item=>item.value.title).join(', ')}</p>}
  {groups.map(group=>{
   const dayRange=calendarRange(group.day,zone);
   const open=overlapWindows([],group.blocks,dayRange).filter(row=>!matchingAcknowledgement(row,controls.records));
   const nothing=group.entries.length===0&&group.blocks.length===0&&!dueForDay(group.day,date,zone,dues).length;
   return <section key={group.day} aria-labelledby={'agenda-'+group.day} className="cr-agenda-day flex min-w-0 flex-col gap-3 border-b border-[var(--hair)] pb-4">
    <h2 id={'agenda-'+group.day} className="sticky top-0 z-[2] -mx-1 bg-[var(--paper)] px-1 py-2 text-label font-medium text-ink-2">
     {group.day===today?'Today · ':''}{civilDayLabel(group.day)}</h2>
    {open.map(row=>{
     const names=pairOf(row).map(b=>b.title);
     return <button key={row.key} type="button" className="self-start rounded-[8px] border border-[var(--warn)] px-3 py-2 text-left text-label text-[var(--warn)]"
      onClick={()=>setResolving(row)}>Overlap: {names.join(' ↔ ')}</button>;
    })}
    {nothing&&<p className="text-label text-ink-2">Nothing planned.</p>}
    {group.entries.map((slice,index)=><SavedCard key={slice.entry.id+':'+index} slice={slice} zone={zone} clock24h={clock24h}/>)}
    {group.blocks.map(block=><button key={block.id} type="button" aria-label={'Edit block '+block.title}
     className={blockCardClass(block)} style={subjectStripe(block.subjectId)}
     onClick={event=>onEdit(block,event)}><BlockLines block={block} zone={zone} clock24h={clock24h}/></button>)}
    <DueDayItems date={group.day} firstVisible={date} zone={zone} dues={dues} projects={projects}/>
   </section>;
  })}
  {resolving&&resolvingPair.length===2&&<Dialog title="Resolve overlapping blocks" eyebrow="CALENDAR" busy={busy}
   onClose={()=>setResolving(null)} footer={<button type="button" className={action} onClick={()=>setResolving(null)}>Close</button>}>
   <p className="text-label text-ink-2">{resolvingPair[0].title} and {resolvingPair[1].title} overlap from {formatCalendarTime(resolving.startsAt,zone,clock24h)} to {formatCalendarTime(resolving.endsAt,zone,clock24h)}.</p>
   <div className="mt-4 flex flex-col gap-2">
    <button type="button" className={action+' text-left'} disabled={busy}
     onClick={event=>{const later=resolvingPair[1];setResolving(null);onEdit(later,event);}}>Move {resolvingPair[1].title}</button>
    <button type="button" className={action+' text-left'} disabled={busy}
     onClick={()=>{void shorten(resolving);}}>Shorten {resolvingPair[0].title} to end at {formatCalendarTime(resolvingPair[1].startsAt,zone,clock24h)}</button>
    <button type="button" className={action+' text-left'} disabled={busy||controls.phase!=='ready'}
     onClick={()=>{void keepBoth(resolving);}}>Keep both</button>
   </div>
  </Dialog>}
 </div>;
}
