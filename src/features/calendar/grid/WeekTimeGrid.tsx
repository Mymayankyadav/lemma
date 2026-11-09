import {useEffect,useMemo,useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import type {CalendarBlockRecord,CalendarBlockPatch,StudyEntryRecord} from '../../../data/study/contract';
import {formatDuration,formatTime} from '../../../lib/format';
import {weekDays} from '../model';
import {dayMinutes,layoutDayIntervals,moveInterval,resizeInterval,snapDragMinutes} from './layout';
import {civilDayLabel} from '../views/labels';

type Props={date:string;zone:string;firstDay:number;clock24h:boolean;
 entries:StudyEntryRecord[];blocks:CalendarBlockRecord[];
 onDay:(date:string)=>void;onEdit?:(block:CalendarBlockRecord)=>void;
 onAdjust?:(block:CalendarBlockRecord,patch:Pick<CalendarBlockPatch,'startsAt'|'endsAt'>)=>void;busy?:boolean};
const MINUTE=60_000;
/** A phone-width seven-day spatial calendar, using the SAME civil-day ranges
 * and overlap allocator as Day. Saved intervals are read-only; only versioned
 * calendar blocks expose an edit action. No synthetic UTC wall-clock days. */
type Drag={id:string;pointerId:number;y:number;delta:number;mode:'move'|'resize';started:boolean};
export default function WeekTimeGrid({date,zone,firstDay,clock24h,entries,blocks,onDay,onEdit,onAdjust,busy=false}:Props){
 const drag=useRef<Drag|null>(null),suppressClick=useRef(false);
 const [preview,setPreview]=useState<{id:string;delta:number;mode:'move'|'resize'}|null>(null);
 const scroller=useRef<HTMLDivElement>(null);
 const [hourPx,setHourPx]=useState(()=>typeof window!=='undefined'&&window.innerWidth>=700?84:64);
 const days=useMemo(()=>weekDays(date,zone,entries,blocks,firstDay),[date,zone,entries,blocks,firstDay]);
 const byId=useMemo(()=>new Map(blocks.map(b=>[b.id,b])),[blocks]);
 const columns=useMemo(()=>days.map(day=>({
  ...day,
  laidOut:layoutDayIntervals([
   ...day.blocks.filter(b=>b.block.status!=='cancelled').map(({block})=>({
    id:'block:'+block.id,start:block.startsAt,end:block.endsAt,
   })),
   ...day.logged.map((slice,index)=>({
    id:'saved:'+slice.entry.id+':'+index,start:slice.start,end:slice.end,
   })),
  ],day.range,hourPx),
 })),[days,hourPx]);
 const firstMinute=Math.min(480,...columns.flatMap(day=>day.laidOut.map(item=>Math.floor(item.startMinute/60)*60)));
 const lastMinute=Math.max(...days.map(day=>dayMinutes(day.range)));
 const height=(lastMinute-firstMinute)*hourPx/60;
 const ticks=Array.from({length:Math.ceil((lastMinute-firstMinute)/60)},(_,i)=>firstMinute+i*60);
 const names=new Intl.DateTimeFormat('en',{weekday:'short',timeZone:zone});
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60_000);return()=>window.clearInterval(timer)},[]);
 function startDrag(event:PointerEvent<HTMLElement>,block:CalendarBlockRecord,mode:'move'|'resize'){
  if(busy||!onAdjust||event.button!==0)return;
  const target=event.target as HTMLElement;
  if(event.pointerType==='touch'&&!target.closest('[data-week-grid-grip],[data-week-grid-resize]'))return;
  event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);
  drag.current={id:block.id,pointerId:event.pointerId,y:event.clientY,delta:0,mode,started:false};
 }
 function updateDrag(event:PointerEvent<HTMLElement>){
  const active=drag.current;if(!active||event.pointerId!==active.pointerId)return;
  const delta=snapDragMinutes(event.clientY-active.y,hourPx);
  drag.current={...active,delta,started:active.started||Math.abs(event.clientY-active.y)>=7};
  setPreview({id:active.id,delta,mode:active.mode});
  if(scroller.current){
   const rect=scroller.current.getBoundingClientRect();
   if(event.clientY>rect.bottom-36)scroller.current.scrollTop+=18;
   else if(event.clientY<rect.top+36)scroller.current.scrollTop-=18;
  }
 }
 function finishDrag(event:PointerEvent<HTMLElement>){
  const active=drag.current;if(!active||event.pointerId!==active.pointerId)return;
  drag.current=null;setPreview(null);
  if(!active.started||!active.delta||!onAdjust)return;
  suppressClick.current=true;window.setTimeout(()=>{suppressClick.current=false},0);
  const block=byId.get(active.id);if(!block)return;
  const result=active.mode==='move'?moveInterval(block.startsAt,block.endsAt,active.delta):resizeInterval(block.startsAt,block.endsAt,active.delta);
  onAdjust(block,{startsAt:result.start,endsAt:result.end});
 }
 function keyAdjust(event:KeyboardEvent<HTMLButtonElement>,block:CalendarBlockRecord){
  if(!event.altKey||busy||!onAdjust||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const step=event.key==='ArrowDown'?15:-15;
  const value=event.shiftKey?resizeInterval(block.startsAt,block.endsAt,step):moveInterval(block.startsAt,block.endsAt,step);
  if(value.start!==block.startsAt||value.end!==block.endsAt)onAdjust(block,{startsAt:value.start,endsAt:value.end});
 }
 useEffect(()=>{
  const media=window.matchMedia?.('(min-width:700px)');
  const update=()=>setHourPx(media?.matches?84:64);
  media?.addEventListener?.('change',update);
  return()=>media?.removeEventListener?.('change',update);
 },[]);
 useEffect(()=>{
  // Position once per selected week; re-rendering study data must not steal scroll.
  const first=columns.flatMap(day=>day.laidOut).map(item=>item.startMinute);
  if(scroller.current)scroller.current.scrollTop=Math.max(0,(Math.min(540,...first)-firstMinute)*hourPx/60-100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[date,firstDay,zone]);
 return <section aria-label="Week time grid" className="min-w-0 overflow-hidden rounded-[12px] border border-[var(--hair)] bg-[var(--paper)]">
  <div ref={scroller} role="region" aria-label="Week time grid" tabIndex={0}
   className="max-h-[65dvh] max-w-full min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-amber">
   <div className="sticky top-0 z-20 grid min-w-0 grid-cols-[36px_repeat(7,minmax(0,1fr))] border-b border-[var(--hair)] bg-[var(--paper)]">
    <span className="sr-only">Hour</span>
    {columns.map(day=><button key={day.day} type="button" data-week-grid-day={day.day}
      aria-label={'View '+civilDayLabel(day.day)+' in Day view'} onClick={()=>onDay(day.day)}
      className="flex min-h-12 min-w-0 flex-col items-center justify-center overflow-hidden border-l border-[var(--hair)] px-0.5 text-ink focus-visible:outline-2 focus-visible:outline-amber"
     ><strong className="w-full truncate text-[10px] font-semibold sm:text-label">{names.format(new Date(day.range.start))} {Number(day.day.slice(8))}</strong>
      <small className="w-full truncate whitespace-nowrap text-[9px] tabular-nums text-ink-2 sm:text-xs">{formatDuration(day.capacity.logged)}</small>
     </button>)}
   </div>
   <div className="grid min-w-0 grid-cols-[36px_repeat(7,minmax(0,1fr))]" style={{height}}>
    <div aria-hidden="true" className="relative min-w-0 border-r border-[var(--hair)]">
     {ticks.map(minute=><span key={minute} className="absolute right-0.5 whitespace-nowrap text-[10px] tabular-nums text-ink-2"
      style={{top:(minute-firstMinute)*hourPx/60-6}}>{formatTime(new Date(Date.parse(days[0].range.start)+minute*MINUTE).toISOString(),{zone,clock24h})}</span>)}
    </div>
    {columns.map(day=>{
     const start=Date.parse(day.range.start),end=Date.parse(day.range.end);
     const isToday=start<=now&&now<end;
     const nowAt=(now-start)/MINUTE;
     return <div key={day.day} data-week-grid-column={day.day}
       className="relative min-w-0 overflow-hidden border-l border-[var(--hair)]">
      {ticks.map(minute=><div key={minute} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-[var(--hair)]"
        style={{top:(minute-firstMinute)*hourPx/60}}/>)}
      {isToday&&nowAt>=firstMinute&&<div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[var(--accent)]"
       style={{top:(nowAt-firstMinute)*hourPx/60}}/>}
      {day.laidOut.map(item=>{
       const block=item.id.startsWith('block:')?byId.get(item.id.slice(6)):undefined;
       const saved=item.id.startsWith('saved:')?day.logged.find((slice,index)=>item.id==='saved:'+slice.entry.id+':'+index):undefined;
       const title=block?.title??saved?.entry.intent??'Saved focus';
       const label=block?(block.kind==='busy'?'Busy time':block.status==='done'?'Completed study':'Planned study'):'Logged study';
       const span=100/item.lanes;
       const previewForBlock=block&&preview?.id===block.id?preview:null;
       const shift=previewForBlock?.mode==='move'?previewForBlock.delta*hourPx/60:0;
       const grow=previewForBlock?.mode==='resize'?previewForBlock.delta*hourPx/60:0;
       const styles={top:(item.startMinute-firstMinute)*hourPx/60+shift,height:Math.max(10,item.height+grow),
        left:item.lane*span+'%',width:span+'%'};
       const stroke=block?.kind==='busy'?'border-l-[3px] [border-left-style:double] border-l-[var(--edge)]':
        block?'border-l-[3px] [border-left-style:dashed] border-l-[var(--accent)]':
        'border-l-[3px] border-l-[var(--good,var(--accent))]';
       const inner='flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[3px] border border-[var(--hair)] bg-[var(--paper-2)] px-px text-left text-[9px] leading-tight text-ink '+stroke;
       return <div key={item.id} data-week-lane={item.lane} data-week-event={item.id}
        className="absolute z-[1] min-w-0 overflow-hidden px-px" style={styles}>
        {block?<button type="button" className={inner+' relative'} title={title}
         aria-label={title+', '+label+', '+formatTime(item.start,{zone,clock24h})+'. Enter for details; Alt+Up/Down to move, Alt+Shift+Up/Down to resize.'}
         aria-description="Press Enter for block details. Alt and arrow keys move 15 minutes. Add Shift to resize."
         onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}onEdit?onEdit(block):onDay(day.day)}}
         onPointerDown={event=>startDrag(event,block,(event.target as HTMLElement).closest('[data-week-grid-resize]')?'resize':'move')}
         onPointerMove={updateDrag} onPointerUp={finishDrag}
         onPointerCancel={()=>{drag.current=null;setPreview(null)}} onKeyDown={event=>keyAdjust(event,block)}>
         {onAdjust&&<span data-week-grid-grip="" aria-hidden="true" className="mr-0.5 cursor-grab select-none touch-none opacity-60">⠿</span>}
         <strong className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap [word-break:normal] [overflow-wrap:normal] [hyphens:none]">{title}</strong>
         {item.height>=32&&<time dateTime={item.start} className="block w-full truncate whitespace-nowrap">{formatTime(item.start,{zone,clock24h})}</time>}
         {onAdjust&&<span aria-hidden="true" data-week-grid-resize="" className="absolute inset-x-0 bottom-0 h-[7px] cursor-ns-resize touch-none"/>}
        </button>:<div className={inner} aria-label={title+', '+label} title={title}>
         <strong className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap [word-break:normal] [overflow-wrap:normal] [hyphens:none]">{title}</strong>
         {item.height>=32&&<time dateTime={item.start} className="block w-full truncate whitespace-nowrap">{formatTime(item.start,{zone,clock24h})}</time>}
        </div>}
       </div>;
      })}
     </div>;
    })}
   </div>
  </div>
  <p className="px-2 py-1.5 text-[11px] text-ink-2">Tap a day to open its schedule, or a block to edit it. Drag a grip to move; drag its lower edge to resize. Alt+Up/Down also adjusts by 15 minutes.</p>
 </section>;
}
