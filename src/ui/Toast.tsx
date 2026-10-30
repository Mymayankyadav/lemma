import {Tex} from './Tex';
import {useState,useSyncExternalStore} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {X} from 'lucide-react';
export interface ToastOptions{action?:{label:string;onClick:()=>void};tone?:'normal'|'success'|'danger'}
export interface ToastProps extends ToastOptions{message:string;id:number}
let counter=0;
let snapshot:ToastProps[]=[];
const listeners=new Set<()=>void>();
const timeouts=new Map<number,ReturnType<typeof setTimeout>>();
const notify=()=>{for(const listener of listeners)listener()};
function subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
function current(){return snapshot}
function dismiss(id:number){const timer=timeouts.get(id);if(timer)clearTimeout(timer);timeouts.delete(id);snapshot=snapshot.filter(item=>item.id!==id);notify()}
export function toast(message:string,options:ToastOptions={}){
 const id=++counter;
 snapshot=[...snapshot.slice(-2),{id,message,...options}];
 notify();
 timeouts.set(id,setTimeout(()=>dismiss(id),4000));
 return ()=>dismiss(id);
}
export function useToast(){return toast}
export function ToastHost(){
 const items=useSyncExternalStore(subscribe,current,current);
 const reduce=!!useReducedMotion();
 const [expanded,setExpanded]=useState<Set<number>>(()=>new Set());
 return <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-4 bottom-[calc(108px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[480px] flex-col gap-2">
 <AnimatePresence>{items.map(item=><motion.div key={item.id} role="status" initial={{opacity:0,y:reduce?0:12}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduce?0.15:0.22}}
 className={`glass pointer-events-auto flex min-h-12 items-center gap-3 rounded-chip px-4 py-2 text-label ${item.tone==='danger'?'text-again':item.tone==='success'?'text-easy':'text-ink'}`}>
 <span className={`min-w-0 flex-1 ${expanded.has(item.id)?'wrap':'line-clamp-2'}`}><Tex source={item.message}/></span>
 {item.message.length>120&&<button type="button" aria-label={expanded.has(item.id)?'Collapse notification details':'Show notification details'}
  className="min-h-11 shrink-0 text-amber" onClick={()=>setExpanded(previous=>{
   const next=new Set(previous);next.has(item.id)?next.delete(item.id):next.add(item.id);return next;
  })}>{expanded.has(item.id)?'Less':'More'}</button>}
 {item.action&&<button className="min-h-11 shrink-0 font-semibold text-amber" onClick={()=>{item.action?.onClick();dismiss(item.id)}}><Tex source={item.action.label}/></button>}
 <button type="button" aria-label="Dismiss notification" className="flex size-11 shrink-0 items-center justify-center" onClick={()=>dismiss(item.id)}><X size={16}/></button>
 </motion.div>)}</AnimatePresence></div>;
}
export default ToastHost;
