import {useEffect,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent,type MouseEvent,type PointerEvent} from 'react';
import {Check,Flag,Target} from 'lucide-react';
import type {CalendarBlockPatch,CalendarBlockRecord,StudyEntryRecord} from '../../../data/study/contract';
import {haptic} from '../../../ui/v7/haptics';
import {calendarRange} from '../model';
import {dayMinutes,layoutDayIntervals,moveInterval,resizeInterval,snapDragMinutes,type GridItem} from '../grid/layout';

export const HOUR_PX=64;
const MINUTE=60_000;
export interface BlockLook{subjectClass:string;path:string;}
type Drag={id:string;pointerId:number;y:number;delta:number;mode:'move'|'resize';lifted:boolean;touch:boolean;lastStep:number;timer:number|null};
type Props={
 date:string;zone:string;clock:(instant:string)=>string;entries:StudyEntryRecord[];blocks:CalendarBlockRecord[];busy?:boolean;
 now:number;lookOf:(block:CalendarBlockRecord)=>BlockLook;
 onCreate:(startsAt:string)=>void;onEdit:(block:CalendarBlockRecord)=>void;
 onAdjust:(block:CalendarBlockRecord,patch:Pick<CalendarBlockPatch,'startsAt'|'endsAt'>)=>void;
 /** Dropping a lifted block on a day in the week strip moves it there. */
 onDropDay:(block:CalendarBlockRecord,day:string,delta:number)=>void;
 onSwipe:(direction:1|-1)=>void;
};
/** PLAN §6.5. An hour is 64 px, so 15 minutes is 16 px; the gutter is 44 px. */
export function layoutKind(height:number):'full'|'line'|'title'{return height>=45?'full':height>=30?'line':'title';}
export function quarterHour(elapsedMinutes:number,wholeMinutes:number):number{
 return Math.max(0,Math.min(wholeMinutes-15,Math.floor(elapsedMinutes/15)*15));
}
export function openingScroll(input:{sameDay:boolean;nowY:number;viewport:number;firstBlockTop:number|null;windowTop:number}):number{
 const target=input.sameDay?input.nowY-input.viewport/3:(input.firstBlockTop??input.windowTop)-HOUR_PX/2;
 return Math.max(0,target);
}
export default function DayGrid({date,zone,clock,entries,blocks,busy=false,now,lookOf,onCreate,onEdit,onAdjust,onDropDay,onSwipe}:Props){
 const scroll=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),suppress=useRef(false),swipe=useRef<{x:number;y:number}|null>(null);
 const [preview,setPreview]=useState<{id:string;delta:number;mode:'move'|'resize';lifted:boolean}|null>(null);
 const range=useMemo(()=>calendarRange(date,zone),[date,zone]);
 const from=Date.parse(range.start),until=Date.parse(range.end),whole=dayMinutes(range);
 const visible=useMemo(()=>blocks.filter(block=>block.status!=='cancelled'),[blocks]);
 const byId=useMemo(()=>new Map(visible.map(block=>[block.id,block])),[visible]);
 const saved=useMemo(()=>entries.filter(entry=>entry.status==='saved').flatMap(entry=>entry.intervals
  .filter(interval=>interval.kind==='focus'&&interval.end!==null).map(interval=>({id:'saved:'+entry.id+':'+interval.id,start:interval.start,end:interval.end!}))),[entries]);
 const inputs=useMemo(()=>[...visible.map(block=>({id:'block:'+block.id,start:block.startsAt,end:block.endsAt})),...saved],[visible,saved]);
 const items=useMemo(()=>layoutDayIntervals(inputs,range,HOUR_PX),[inputs,range]);
 const first=Math.min(360,...items.map(item=>Math.floor(item.startMinute/60)*60));
 const height=(whole-first)*HOUR_PX/60;
 const ticks=Array.from({length:Math.ceil((whole-first)/60)+1},(_,index)=>first+index*60).filter(minute=>minute<whole);
 const sameDay=now>=from&&now<until,nowY=(now-from)/(60*MINUTE)*HOUR_PX-first/60*HOUR_PX;
 useEffect(()=>{
  const node=scroll.current;if(!node)return;
  node.scrollTop=openingScroll({sameDay,nowY,viewport:node.clientHeight||480,firstBlockTop:items.length?items[0].top-first*HOUR_PX/60:null,windowTop:(480-first)*HOUR_PX/60});
  // Only on navigation: clock ticks must not steal the reader's scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[date,zone]);
 useEffect(()=>()=>{if(drag.current?.timer)window.clearTimeout(drag.current.timer);},[]);
 function createAt(event:MouseEvent<HTMLDivElement>){
  if(event.target!==event.currentTarget||busy||suppress.current)return;
  const bounds=event.currentTarget.getBoundingClientRect();
  onCreate(new Date(from+quarterHour(first+(event.clientY-bounds.top)*60/HOUR_PX,whole)*MINUTE).toISOString());
 }
 function blockOf(id:string){return byId.get(id);}
 function lift(active:Drag){
  active.lifted=true;haptic('snap',true);
  setPreview({id:active.id,delta:0,mode:active.mode,lifted:true});
 }
 const blockTouchMove=(event:TouchEvent)=>{if(drag.current?.lifted&&event.cancelable)event.preventDefault();};
 function startDrag(event:PointerEvent<HTMLElement>,block:CalendarBlockRecord,mode:'move'|'resize'){
  if(busy||event.button!==0)return;
  const touch=event.pointerType==='touch',target=event.target as HTMLElement;
  // The bottom handle resizes at once; the body lifts after 300 ms of holding (PLAN §6.5).
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const active:Drag={id:block.id,pointerId:event.pointerId,y:event.clientY,delta:0,mode,lifted:false,touch,lastStep:0,timer:null};
  drag.current=active;
  if(target.closest('[data-grid-resize]'))lift(active);
  else if(touch)active.timer=window.setTimeout(()=>{if(drag.current===active)lift(active);},300);
  window.addEventListener('touchmove',blockTouchMove,{passive:false});
 }
 function moveDrag(event:PointerEvent<HTMLElement>){
  const active=drag.current;if(!active||event.pointerId!==active.pointerId)return;
  const dy=event.clientY-active.y;
  if(!active.lifted){
   if(active.touch){if(Math.abs(dy)>8&&active.timer){window.clearTimeout(active.timer);active.timer=null;drag.current=null;}return;}
   if(Math.abs(dy)<7)return;
   lift(active);
  }
  const delta=snapDragMinutes(dy,HOUR_PX);
  if(delta!==active.lastStep){active.lastStep=delta;haptic('snap',true);}
  active.delta=delta;setPreview({id:active.id,delta,mode:active.mode,lifted:true});
  const rect=scroll.current?.getBoundingClientRect();
  if(scroll.current&&rect){if(event.clientY>rect.bottom-36)scroll.current.scrollTop+=18;else if(event.clientY<rect.top+36)scroll.current.scrollTop-=18;}
 }
 function endDrag(event:PointerEvent<HTMLElement>){
  const active=drag.current;if(!active||event.pointerId!==active.pointerId)return;
  if(active.timer)window.clearTimeout(active.timer);
  window.removeEventListener('touchmove',blockTouchMove);
  drag.current=null;setPreview(null);
  if(!active.lifted)return;
  suppress.current=true;window.setTimeout(()=>{suppress.current=false;},0);
  const block=blockOf(active.id);if(!block)return;
  const strip=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-strip-day]');
  if(strip?.dataset.stripDay&&active.mode==='move'&&strip.dataset.stripDay!==date){onDropDay(block,strip.dataset.stripDay,active.delta);return;}
  if(!active.delta)return;
  const result=active.mode==='move'?moveInterval(block.startsAt,block.endsAt,active.delta):resizeInterval(block.startsAt,block.endsAt,active.delta);
  onAdjust(block,{startsAt:result.start,endsAt:result.end});
 }
 function cancelDrag(){
  if(drag.current?.timer)window.clearTimeout(drag.current.timer);
  window.removeEventListener('touchmove',blockTouchMove);
  drag.current=null;setPreview(null);
 }
 function keyAdjust(event:KeyboardEvent<HTMLButtonElement>,block:CalendarBlockRecord){
  if(!event.altKey||busy||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();
  const step=event.key==='ArrowDown'?15:-15,value=event.shiftKey?resizeInterval(block.startsAt,block.endsAt,step):moveInterval(block.startsAt,block.endsAt,step);
  if(value.start!==block.startsAt||value.end!==block.endsAt)onAdjust(block,{startsAt:value.start,endsAt:value.end});
 }
 function card(item:GridItem){
  const id=item.id.startsWith('block:')?item.id.slice(6):null,block=id?blockOf(id):undefined;
  const entry=!block?entries.find(candidate=>item.id.startsWith('saved:'+candidate.id+':')):undefined;
  const moving=preview?.id===id,shift=moving&&preview.mode==='move'?preview.delta*HOUR_PX/60:0,grow=moving&&preview.mode==='resize'?preview.delta*HOUR_PX/60:0;
  const top=item.top-first*HOUR_PX/60+shift,shown=Math.max(15,item.height+grow),size=layoutKind(shown);
  const look=block?lookOf(block):entry?lookOf({projectId:entry.projectId} as CalendarBlockRecord):{subjectClass:'',path:''};
  const minutes=Math.round((Date.parse(item.end)-Date.parse(item.start))/MINUTE);
  const done=block?.status==='done',past=sameDay&&Date.parse(item.end)<now;
  const kind=block?(block.kind==='busy'?'busy':done?'done':'study'):'logged';
  const label=block?.title??entry?.intent??'Saved study',lane:CSSProperties={top,height:shown,left:'calc('+item.lane/item.lanes*100+'% + 1px)',width:'calc('+100/item.lanes+'% - 2px)'};
  const range=clock(item.start)+'–'+clock(item.end);
  const body=<>
   {kind==='logged'||done?<Check className="v7-cal-check" aria-hidden="true"/>:null}
   <strong>{label}</strong>
   {size!=='title'&&<small>{kind==='logged'?minutes+' min logged':range}</small>}
   {size==='full'&&kind!=='logged'&&look.path&&<small>{look.path}</small>}
   {block?.checkpointId&&size!=='title'&&<Target className="v7-cal-link" aria-hidden="true"/>}
   {block?.taskId&&size!=='title'&&<Flag className="v7-cal-link" aria-hidden="true"/>}
   {item.continuesBefore||item.continuesAfter?<span className="v7-sr-only">Continues across midnight</span>:null}
  </>;
  return <div key={item.id} className={'v7-cal-block '+look.subjectClass} data-kind={kind} data-size={size} data-past={past?'true':'false'} data-lifted={moving&&preview.lifted?'true':'false'} style={lane}>
   {block?<button type="button" data-calendar-block={block.id}
    aria-label={block.title+', '+(kind==='busy'?'Busy':done?'Completed study':'Planned study')+(look.path?', '+look.path:'')+', '+range+'. Enter for details; Alt+Up/Down to move, Alt+Shift+Up/Down to resize.'}
    onClick={()=>{if(suppress.current){suppress.current=false;return;}onEdit(block);}}
    onPointerDown={event=>startDrag(event,block,'move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag}
    onKeyDown={event=>keyAdjust(event,block)}>{body}<span data-grid-resize="" aria-hidden="true"/></button>
   :<div aria-label={label+', Logged study'}>{body}</div>}
  </div>;
 }
 return <section className="v7-cal-grid" aria-label="Day calendar" data-day-minutes={whole}>
  <div ref={scroll} role="region" aria-label="Day time grid" tabIndex={0} className="v7-cal-scroll"
   onTouchStart={event=>{const t=event.touches[0];swipe.current={x:t.clientX,y:t.clientY};}}
   onTouchEnd={event=>{const start=swipe.current,t=event.changedTouches[0];swipe.current=null;
    if(!start||drag.current?.lifted)return;const dx=t.clientX-start.x,dy=t.clientY-start.y;
    if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*2)onSwipe(dx<0?1:-1);}}>
   <div className="v7-cal-plane" style={{height}}>
    <div className="v7-cal-gutter" aria-hidden="true">
     {ticks.map(minute=><time key={minute} dateTime={new Date(from+minute*MINUTE).toISOString()} style={{top:(minute-first)*HOUR_PX/60-7}}>{clock(new Date(from+minute*MINUTE).toISOString())}</time>)}
     {sameDay&&nowY>=0&&nowY<=height&&<span className="v7-cal-now-pill" style={{top:nowY-11}}>{clock(new Date(now).toISOString())}</span>}
    </div>
    <div className="v7-cal-slots" onClick={createAt} aria-label="Select empty time to create a block">
     {ticks.map(minute=><i key={minute} aria-hidden="true" style={{top:(minute-first)*HOUR_PX/60}}/>)}
     {sameDay&&nowY>=0&&nowY<=height&&<b className="v7-cal-now" data-calendar-now="" aria-hidden="true" style={{top:nowY}}/>}
     {items.map(card)}
    </div>
   </div>
  </div>
 </section>;
}
