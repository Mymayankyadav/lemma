import {useEffect,useMemo,useRef,useState,type PointerEvent,type MouseEvent,type KeyboardEvent} from 'react';
import type {CalendarBlockRecord,CalendarBlockPatch,StudyEntryRecord} from '../../../data/study/contract';
import {calendarRange} from '../model';
import {formatCalendarTime} from '../views/WeekView';
import {dayMinutes,layoutDayIntervals,moveInterval,resizeInterval,snapDragMinutes,type GridItem} from './layout';

type Props={date:string;zone:string;clock24h:boolean;entries:StudyEntryRecord[];
 blocks:CalendarBlockRecord[];busy?:boolean;
 onCreate:(startsAt:string)=>void;
 onEdit:(block:CalendarBlockRecord)=>void;
 onAdjust:(block:CalendarBlockRecord,patch:Pick<CalendarBlockPatch,'startsAt'|'endsAt'>)=>void;
};
type Drag={id:string;pointerId:number;y:number;delta:number;mode:'move'|'resize';started:boolean};
const MINUTE=60_000;
const HOUR=60*MINUTE;
/** An elapsed-time grid: overlapping events share the same spatial surface.
 * Day range is supplied by calendarRange, so DST folds and gaps remain accurate. */
export default function TimeGrid({date,zone,clock24h,entries,blocks,busy=false,
 onCreate,onEdit,onAdjust}:Props){
 const scroll=useRef<HTMLDivElement>(null);
 const suppressClick=useRef(false);
 const drag=useRef<Drag|null>(null);
 const [preview,setPreview]=useState<{id:string;delta:number;mode:'move'|'resize'}|null>(null);
 const [now,setNow]=useState(()=>Date.now());
 const [pixelsPerHour,setPixelsPerHour]=useState(()=>typeof window!=='undefined'&&window.innerWidth>=700?84:64);
 const range=useMemo(()=>calendarRange(date,zone),[date,zone]);
 const from=Date.parse(range.start),until=Date.parse(range.end);
 const visibleBlocks=useMemo(()=>blocks.filter(block=>block.status!=='cancelled'),[blocks]);
 const blockById=useMemo(()=>new Map(visibleBlocks.map(block=>[block.id,block])),[visibleBlocks]);
 const eventInputs=useMemo(()=>[
  ...visibleBlocks.map(block=>({id:'block:'+block.id,start:block.startsAt,end:block.endsAt})),
  ...entries.filter(entry=>entry.status==='saved').flatMap(entry=>entry.intervals
   .filter(interval=>interval.kind==='focus'&&interval.end!==null)
   .map(interval=>({id:'saved:'+entry.id+':'+interval.id,start:interval.start,end:interval.end!}))),
 ],[visibleBlocks,entries]);
 const positioned=useMemo(()=>layoutDayIntervals(eventInputs,range,pixelsPerHour),[eventInputs,range,pixelsPerHour]);
 const firstVisibleMinute=Math.min(480,...positioned.map(item=>Math.floor(item.startMinute/60)*60));
 const wholeMinutes=dayMinutes(range);
 const height=(wholeMinutes-firstVisibleMinute)*pixelsPerHour/60;
 const tickMinutes=Array.from({length:Math.ceil((wholeMinutes-firstVisibleMinute)/60)+1},(_,i)=>firstVisibleMinute+i*60)
  .filter(minute=>minute<wholeMinutes);
 const sameDay=now>=from&&now<until;
 const nowY=(now-from)/HOUR*pixelsPerHour-firstVisibleMinute/60*pixelsPerHour;
 useEffect(()=>{
  const clock=window.setInterval(()=>setNow(Date.now()),60_000);
  const media=window.matchMedia?.('(min-width:700px)');
  const update=()=>setPixelsPerHour(media?.matches?84:64);
  media?.addEventListener?.('change',update);
  return()=>{window.clearInterval(clock);media?.removeEventListener?.('change',update)};
 },[]);
 useEffect(()=>{
  const node=scroll.current;
  if(!node)return;
  const target=sameDay?nowY-pixelsPerHour:positioned.length?
   positioned[0].top-firstVisibleMinute/60*pixelsPerHour-pixelsPerHour:0;
  node.scrollTop=Math.max(0,target);
  // Only auto-position on navigation; tick updates must not steal a user's scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[date,zone]);
 function createAt(event:MouseEvent<HTMLDivElement>){
  if(event.target!==event.currentTarget||busy||suppressClick.current)return;
  const bounds=event.currentTarget.getBoundingClientRect();
  const elapsed=firstVisibleMinute+(event.clientY-bounds.top)*60/pixelsPerHour;
  const snapped=Math.max(0,Math.min(wholeMinutes-15,Math.floor(elapsed/30)*30));
  onCreate(new Date(from+snapped*MINUTE).toISOString());
 }
 function startDrag(event:PointerEvent<HTMLElement>,block:CalendarBlockRecord,mode:'move'|'resize'){
  if(busy||event.button!==0)return;
  // Touch scrolling stays native except on the explicit grip/resize control.
  const target=event.target as HTMLElement;
  if(event.pointerType==='touch'&&!target.closest('[data-grid-grip],[data-grid-resize]'))return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  drag.current={id:block.id,pointerId:event.pointerId,y:event.clientY,delta:0,mode,started:false};
 }
 function updateDrag(event:PointerEvent<HTMLElement>){
  const active=drag.current;
  if(!active||event.pointerId!==active.pointerId)return;
  const delta=snapDragMinutes(event.clientY-active.y,pixelsPerHour);
  drag.current={...active,delta,started:active.started||Math.abs(event.clientY-active.y)>=7};
  setPreview({id:active.id,delta,mode:active.mode});
  if(scroll.current){
   const rect=scroll.current.getBoundingClientRect();
   if(event.clientY>rect.bottom-36)scroll.current.scrollTop+=18;
   else if(event.clientY<rect.top+36)scroll.current.scrollTop-=18;
  }
 }
 function finishDrag(event:PointerEvent<HTMLElement>){
  const active=drag.current;
  if(!active||event.pointerId!==active.pointerId)return;
  drag.current=null;setPreview(null);
  if(!active.started||!active.delta)return;
  suppressClick.current=true;
  window.setTimeout(()=>{suppressClick.current=false},0);
  const block=blockById.get(active.id);
  if(!block)return;
  const result=active.mode==='move'
   ?moveInterval(block.startsAt,block.endsAt,active.delta)
   :resizeInterval(block.startsAt,block.endsAt,active.delta);
  onAdjust(block,{startsAt:result.start,endsAt:result.end});
 }
 function keyAdjust(event:KeyboardEvent<HTMLButtonElement>,block:CalendarBlockRecord){
  if(!event.altKey||busy||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();
  const step=event.key==='ArrowDown'?15:-15;
  const value=event.shiftKey?resizeInterval(block.startsAt,block.endsAt,step)
   :moveInterval(block.startsAt,block.endsAt,step);
  if(value.start!==block.startsAt||value.end!==block.endsAt)
   onAdjust(block,{startsAt:value.start,endsAt:value.end});
 }
 function eventCard(item:GridItem){
  const id=item.id.startsWith('block:')?item.id.slice(6):null;
  const block=id?blockById.get(id):undefined;
  const saved=!block?entries.find(entry=>item.id.startsWith('saved:'+entry.id+':')):undefined;
  const moving=preview?.id===id;
  const shift=moving&&preview.mode==='move'?preview.delta*pixelsPerHour/60:0;
  const grow=moving&&preview.mode==='resize'?preview.delta*pixelsPerHour/60:0;
  const top=item.top-firstVisibleMinute*pixelsPerHour/60+shift;
  const shownHeight=Math.max(15,item.height+grow);
  const label=block?.title??saved?.intent??'Saved study';
  const kind=block?(block.kind==='busy'?'Busy':block.status==='done'?'Completed study':'Planned study'):'Logged study';
  const width=100/item.lanes,offset=item.lane*width;
  const borderClass=block?.kind==='busy'?'border-l-[3px] [border-left-style:double] border-l-[var(--edge)]':
   block?.kind==='study'?'border-l-[3px] [border-left-style:dashed] border-l-[var(--accent)]':
   'border-l-[3px] border-l-[var(--good,var(--accent))]';
  return <div key={item.id} className="absolute z-[1] overflow-hidden px-[2px]" style={{top,height:shownHeight,left:offset+'%',width:width+'%'}}>
   {block?<button type="button" data-calendar-block={block.id}
    aria-label={block.title+', '+kind+', '+formatCalendarTime(item.start,zone,clock24h)+'. Enter for details; Alt+Up/Down to move, Alt+Shift+Up/Down to resize.'}
    aria-description="Press Enter for block details. Alt and arrow keys move 15 minutes. Add Shift to resize."
    className={'relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[6px] border border-[var(--control-edge)] bg-[var(--paper)] p-1 text-left text-caption text-ink '+borderClass}
    onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}onEdit(block)}}
    onPointerDown={event=>startDrag(event,block,(event.target as HTMLElement).closest('[data-grid-resize]')?'resize':'move')}
    onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={()=>{drag.current=null;setPreview(null)}}
    onKeyDown={event=>keyAdjust(event,block)}>
    <span className="flex min-w-0 items-center gap-1"><span data-grid-grip="" aria-hidden="true" className="cursor-grab select-none touch-none opacity-60">⠿</span>
     <strong className="min-w-0 truncate font-medium">{label}</strong></span>
    {shownHeight>=38&&<span className="truncate text-[11px]">{formatCalendarTime(item.start,zone,clock24h)}</span>}
    {item.continuesBefore||item.continuesAfter?<span className="sr-only">Continues across midnight</span>:null}
    <span aria-hidden="true" data-grid-resize="" className="absolute inset-x-0 bottom-0 h-[9px] cursor-ns-resize touch-none"/>
   </button>:<div className={'flex h-full flex-col overflow-hidden rounded-[6px] border border-[var(--hair)] bg-[var(--paper-2)] px-1 py-[2px] text-caption '+borderClass}
    aria-label={label+', '+kind}>
    <strong className="truncate font-medium">{label}</strong>
    {shownHeight>=38&&<span className="truncate">{formatCalendarTime(item.start,zone,clock24h)} · Logged</span>}
   </div>}
  </div>;
 }
 return <section aria-label="Day time grid" className="min-w-0 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)]">
  <div className="flex items-center justify-between gap-2 border-b border-[var(--hair)] p-3 text-label">
   <strong>Time grid</strong><span className="text-ink-2">{zone.split('/').pop()?.replace(/_/g,' ')}</span>
  </div>
  <div ref={scroll} role="region" aria-label="Day time grid" tabIndex={0}
   className="max-h-[68dvh] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-amber">
   <div className="relative grid min-w-0 grid-cols-[44px_minmax(0,1fr)]" style={{height}}>
    <div aria-hidden="true" className="relative border-r border-[var(--hair)]">
     {tickMinutes.map(minute=><time key={minute} dateTime={new Date(from+minute*MINUTE).toISOString()}
      className="absolute right-1 text-[11px] tabular-nums text-ink-2"
      style={{top:(minute-firstVisibleMinute)*pixelsPerHour/60-7}}>
      {formatCalendarTime(new Date(from+minute*MINUTE).toISOString(),zone,clock24h)}
     </time>)}
    </div>
    <div className="relative min-w-0 cursor-crosshair" onClick={createAt} aria-label="Select empty time to create a block">
     {tickMinutes.map(minute=><div key={minute} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-[var(--hair)]"
      style={{top:(minute-firstVisibleMinute)*pixelsPerHour/60}}/>)}
     {sameDay&&nowY>=0&&nowY<=height&&<div aria-hidden="true" data-calendar-now="" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[var(--accent)]"
      style={{top:nowY}}><span className="absolute -left-1 -top-[4px] size-2 rounded-full bg-[var(--accent)]"/></div>}
     {positioned.map(eventCard)}
    </div>
   </div>
  </div>
  <details className="lemma-disclosure border-t border-[var(--hair)] px-3 py-2 text-caption text-ink-2">
   <summary className="min-h-11 cursor-pointer">Key</summary>
   <p>Dashed edge: planned study. Double edge: busy time. Solid edge: saved focus.</p>
  </details>
 </section>;
}
