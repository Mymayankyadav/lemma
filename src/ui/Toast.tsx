import {lazy,Suspense,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useMotionReduced} from './v7/effects';
import {durations} from './v7/motion';
import {AnimatePresence,motion,useIsPresent,useReducedMotion} from 'motion/react';
import {CircleAlert,CircleCheck,Info,X} from 'lucide-react';

const RichTex=lazy(()=>import('./Tex').then(module=>({default:module.Tex})));
const richSyntax=new Set([String.fromCharCode(92),String.fromCharCode(36),String.fromCharCode(96),'*','_','~','[',']','<','>','!','#','|','&',String.fromCharCode(13),String.fromCharCode(10)]);
function ToastText({source}:{source:string}){
 // A notification with plain prose must appear immediately. React escapes
 // the text; rich Markdown, HTML entities and LaTeX keep canonical rendering.
 if(source && !Array.from(source).some(character=>richSyntax.has(character)))
  return <span>{source}</span>;
 return <Suspense fallback={<span role="status" aria-label="Rendering notification text">…</span>}>
  <RichTex source={source}/>
 </Suspense>;
}

export interface ToastOptions{action?:{label:string;onClick:()=>unknown};tone?:'normal'|'success'|'danger';
 /** N121 A7: how long a toast stays (default 4 s), e.g. the length of an Undo window. */
 duration?:number}
export interface ToastProps extends ToastOptions{message:string;id:number}
type UndoEntry={id:number;message:string;options:ToastOptions};
type PauseReason='pointer'|'focus'|'details';
type ToastClock={
 duration:number; remaining:number; deadline:number|null; timer?:ReturnType<typeof setTimeout>;
 paused:Set<PauseReason>; undo?:UndoEntry[]; updatedAt:number;
};
const DEFAULT_DURATION=4000,UNDO_GROUP_WINDOW=1000;
let counter=0;
let snapshot:ToastProps[]=[];
const listeners=new Set<()=>void>();
const clocks=new Map<number,ToastClock>();
const notify=()=>{for(const listener of listeners)listener()};
function subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
function current(){return snapshot}
function stop(clock:ToastClock){
 clearTimeout(clock.timer);
 if(clock.deadline!==null)clock.remaining=Math.max(0,clock.deadline-Date.now());
 clock.deadline=null;
}
function forget(id:number){
 const clock=clocks.get(id);
 if(clock)stop(clock);
 clocks.delete(id);
}
function dismiss(id:number){
 if(!clocks.has(id))return;
 forget(id);snapshot=snapshot.filter(item=>item.id!==id);notify();
}
function schedule(id:number,clock:ToastClock){
 if(clock.paused.size)return;
 clock.deadline=Date.now()+clock.remaining;
 clock.timer=setTimeout(()=>dismiss(id),clock.remaining);
}
function holdToast(id:number,reason:PauseReason,hold:boolean){
 const clock=clocks.get(id);
 if(!clock||clock.paused.has(reason)===hold)return;
 if(hold){stop(clock);clock.paused.add(reason);}
 else{clock.paused.delete(reason);schedule(id,clock);}
 snapshot=[...snapshot];notify();
}
function refreshClock(id:number,clock:ToastClock,duration:number,updatedAt:number){
 stop(clock);clock.duration=duration;clock.remaining=duration;clock.updatedAt=updatedAt;schedule(id,clock);
}
const v7Root=()=>typeof document!=='undefined'&&document.documentElement.hasAttribute('data-v7');
function withUndo(id:number,entries:UndoEntry[]):ToastProps{
 const latest=entries.at(-1)!;
 if(entries.length===1)return {id,message:latest.message,...latest.options};
 return {id,message:entries.length+' changes',...latest.options,action:{label:'Undo',onClick:async()=>{
  // Roll back the newest change first. One failed undo must not discard the others.
  for(const entry of [...entries].reverse()){
   try{await entry.options.action?.onClick();}
   catch{toast('Could not undo a change',{tone:'danger'});}
  }
 }}};
}
function dismissUndo(id:number,entryId:number){
 const clock=clocks.get(id);
 if(!clock?.undo)return;
 const remaining=clock.undo.filter(entry=>entry.id!==entryId);
 if(remaining.length===clock.undo.length)return;
 if(!remaining.length){dismiss(id);return;}
 clock.undo=remaining;
 snapshot=snapshot.map(item=>item.id===id?withUndo(id,remaining):item);notify();
}
/** v7 keeps one visible toast and combines undo actions that arrive in quick succession. */
export function toast(message:string,options:ToastOptions={}){
 const v7=v7Root(),now=Date.now(),duration=options.duration??DEFAULT_DURATION;
 const latest=snapshot.at(-1),active=latest?clocks.get(latest.id):undefined;
 const undo=v7&&options.action?.label==='Undo'?{id:++counter,message,options}:undefined;
 if(undo&&latest&&active?.undo&&now-active.updatedAt<=UNDO_GROUP_WINDOW){
  active.undo=[...active.undo,undo];
  snapshot=[withUndo(latest.id,active.undo)];
  refreshClock(latest.id,active,Math.max(duration,active.duration),now);notify();
  return ()=>dismissUndo(latest.id,undo.id);
 }
 const same=undo?undefined:snapshot.find(item=>item.message===message&&item.tone===options.tone&&item.action?.label===options.action?.label);
 if(same){
  snapshot=snapshot.map(item=>item.id===same.id?{...item,...options}:item);
  const clock=clocks.get(same.id);
  if(clock)refreshClock(same.id,clock,duration,now);
  notify();return ()=>dismiss(same.id);
 }
 const id=undo?.id??++counter;
 for(const item of v7?snapshot:snapshot.slice(0,-2))forget(item.id);
 snapshot=[...(v7?[]:snapshot.slice(-2)),{id,message,...options}];
 const clock:ToastClock={duration,remaining:duration,deadline:null,paused:new Set(),undo:undo?[undo]:undefined,updatedAt:now};
 clocks.set(id,clock);schedule(id,clock);notify();
 return undo?()=>dismissUndo(id,undo.id):()=>dismiss(id);
}
/** F13: errors do not follow you to another screen; the v7 shell clears them on navigation. */
export function clearToasts(match:(item:ToastProps)=>boolean=()=>true){
 const next=snapshot.filter(item=>{
  if(!match(item))return true;
  forget(item.id);return false;
 });
 if(next.length!==snapshot.length){snapshot=next;notify();}
}
export function useToast(){return toast}
/** F40: the v7 toast is an ink pill (Day) or raised navy pill (Night) with an icon, the message, a bold indigo action and
 * a countdown hairline for the undo window. */
function V7ToastItem({item,reduce}:{item:ToastProps;reduce:boolean}){
 const Icon=item.tone==='danger'?CircleAlert:item.tone==='success'?CircleCheck:Info;
 const present=useIsPresent(),countdown=useRef<HTMLSpanElement>(null);
 const clock=clocks.get(item.id),deadline=clock?.deadline??null,remaining=clock?.remaining??0,total=clock?.duration??1;
 useLayoutEffect(()=>{
  const line=countdown.current;
  if(!line)return;
  const left=deadline===null?remaining:Math.max(0,deadline-Date.now());
  const scale='scaleX('+Math.min(1,left/Math.max(1,total))+')';
  line.style.transform=scale;
  if(deadline===null||!left||typeof line.animate!=='function')return;
  const motion=line.animate([{transform:scale},{transform:'scaleX(0)'}],{duration:left,fill:'forwards'});
  return ()=>motion.cancel();
 },[deadline,remaining,total,reduce]);
 return <motion.div role={item.tone==='danger'?'alert':'status'} className="v7-app-toast" data-surface-role="S6" data-v7-lifted="" data-tone={item.tone??'normal'}
  inert={!present} aria-hidden={present?undefined:true}
  initial={{opacity:0,y:reduce?0:12}} animate={{opacity:1,y:0,transition:{duration:reduce?durations.reduced:durations.base}}}
  exit={{opacity:0,transition:{duration:reduce?durations.reduced:durations.quickExit}}}
  onPointerEnter={()=>holdToast(item.id,'pointer',true)} onPointerLeave={()=>holdToast(item.id,'pointer',false)}
  onFocus={()=>holdToast(item.id,'focus',true)}
  onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))holdToast(item.id,'focus',false);}}>
  <Icon className="v7-app-toast-icon" aria-hidden="true"/>
  <span className="v7-app-toast-text"><ToastText source={item.message}/></span>
  {item.action&&<button type="button" className="v7-app-toast-action" onClick={()=>{dismiss(item.id);item.action?.onClick();}}><ToastText source={item.action.label}/></button>}
  <button type="button" aria-label="Dismiss notification" className="v7-app-toast-close" onClick={()=>dismiss(item.id)}><X aria-hidden="true"/></button>
  {item.action&&!reduce&&<span ref={countdown} className="v7-app-toast-countdown" aria-hidden="true"/>}
 </motion.div>;
}
function ToastItem({item,reduce}:{item:ToastProps;reduce:boolean}){
 const [expanded,setExpanded]=useState(false);
 const [overflow,setOverflow]=useState(false);
 const messageRef=useRef<HTMLSpanElement>(null);
 // Character counts cannot predict wrapping: an action button, a narrow phone,
 // large text, or a single long formula can overflow well below 120 characters.
 useLayoutEffect(()=>{
  const node=messageRef.current;
  if(!node||expanded)return;
  const measure=()=>setOverflow(node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1);
  measure();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  observer?.observe(node);
  return ()=>observer?.disconnect();
 },[item.message,expanded]);
 const messageId='toast-message-'+item.id;
 return <motion.div role="status" initial={{opacity:0,y:reduce?0:12}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduce?0.15:0.22}}
 className={`glass pointer-events-auto flex min-h-12 items-center gap-3 rounded-chip px-4 py-2 text-label ${item.tone==='danger'?'text-again':item.tone==='success'?'text-easy':'text-ink'}`}>
 <span ref={messageRef} id={messageId} className={`min-w-0 flex-1 ${expanded?'wrap max-h-[50vh] overflow-y-auto':'line-clamp-2'}`}><ToastText source={item.message}/></span>
 {overflow&&<button type="button" aria-label={expanded?'Collapse notification details':'Show notification details'}
  aria-expanded={expanded} aria-controls={messageId}
  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 text-amber" onClick={()=>{
   // A user reading expanded details must not lose them to the 4-second timer.
   if(expanded){setExpanded(false);holdToast(item.id,'details',false)}
   else{holdToast(item.id,'details',true);setExpanded(true)}
  }}>{expanded?'Less':'More'}</button>}
 {item.action&&<button className="flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 font-semibold text-amber" onClick={()=>{item.action?.onClick();dismiss(item.id)}}><ToastText source={item.action.label}/></button>}
 <button type="button" aria-label="Dismiss notification" className="flex size-11 shrink-0 items-center justify-center" onClick={()=>dismiss(item.id)}><X size={16}/></button>
 </motion.div>;
}
export function ToastHost(){
 const items=useSyncExternalStore(subscribe,current,current);
 const host=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const node=host.current;
  if(!node||!items.length)return;
  let frame=0;
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>schedule());
  const observed=new Set<Element>();
  const measure=()=>{
   frame=0;
   let clearance=0;
   if(!document.querySelector('dialog[open]'))for(const dock of document.querySelectorAll('.v7-pinned-dock,.v7-dock,.v7-sticky-actions')){
    if(!observed.has(dock)){observed.add(dock);resize?.observe(dock);}
    const box=dock.getBoundingClientRect(),style=getComputedStyle(dock);
    const bottomActions=['fixed','sticky'].includes(style.position)||dock.classList.contains('v7-path-bar');
    if(bottomActions&&box.width&&box.height&&box.top>innerHeight/2&&box.top<innerHeight&&style.visibility!=='hidden')
     clearance=Math.max(clearance,innerHeight-box.top);
   }
   const value=Math.ceil(clearance)+'px';
   if(node.style.getPropertyValue('--v7-toast-clearance')!==value)node.style.setProperty('--v7-toast-clearance',value);
  };
  function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
  const mutations=new MutationObserver(schedule);
  mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','class','data-immersive']});
  window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  window.addEventListener('scroll',schedule,{capture:true,passive:true});
  measure();
  return()=>{cancelAnimationFrame(frame);resize?.disconnect();mutations.disconnect();window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);};
 },[items]);
 const reduce=!!useReducedMotion(),effectsReduced=useMotionReduced();
 // A1: the v7 toast also honours Settings › Reduce effects.
 if(v7Root())return <div ref={host} aria-live="polite" aria-atomic="false" className="v7-toast-host">
  <AnimatePresence>{items.slice(-1).map(item=><V7ToastItem key={item.id} item={item} reduce={reduce||effectsReduced}/>)}</AnimatePresence></div>;
 return <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-4 bottom-[calc(108px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[480px] flex-col gap-2">
 <AnimatePresence>{items.map(item=><ToastItem key={item.id} item={item} reduce={reduce}/>)}</AnimatePresence></div>;
}
export default ToastHost;
