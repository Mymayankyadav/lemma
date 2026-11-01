import {lazy,Suspense,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {X} from 'lucide-react';

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

export interface ToastOptions{action?:{label:string;onClick:()=>void};tone?:'normal'|'success'|'danger'}
export interface ToastProps extends ToastOptions{message:string;id:number}
let counter=0;
let snapshot:ToastProps[]=[];
const listeners=new Set<()=>void>();
const timeouts=new Map<number,ReturnType<typeof setTimeout>>();
const notify=()=>{for(const listener of listeners)listener()};
function subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
function current(){return snapshot}
function pauseToast(id:number){
 const timer=timeouts.get(id);
 if(timer!==undefined)clearTimeout(timer);
 timeouts.delete(id);
}
function dismiss(id:number){pauseToast(id);snapshot=snapshot.filter(item=>item.id!==id);notify()}
function resumeToast(id:number){
 pauseToast(id);
 if(snapshot.some(item=>item.id===id))timeouts.set(id,setTimeout(()=>dismiss(id),4000));
}
export function toast(message:string,options:ToastOptions={}){
 const id=++counter;
 snapshot=[...snapshot.slice(-2),{id,message,...options}];
 notify();
 resumeToast(id);
 return ()=>dismiss(id);
}
export function useToast(){return toast}
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
   if(expanded){setExpanded(false);resumeToast(item.id)}
   else{pauseToast(item.id);setExpanded(true)}
  }}>{expanded?'Less':'More'}</button>}
 {item.action&&<button className="flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 font-semibold text-amber" onClick={()=>{item.action?.onClick();dismiss(item.id)}}><ToastText source={item.action.label}/></button>}
 <button type="button" aria-label="Dismiss notification" className="flex size-11 shrink-0 items-center justify-center" onClick={()=>dismiss(item.id)}><X size={16}/></button>
 </motion.div>;
}
export function ToastHost(){
 const items=useSyncExternalStore(subscribe,current,current);
 const reduce=!!useReducedMotion();
 return <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-4 bottom-[calc(108px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[480px] flex-col gap-2">
 <AnimatePresence>{items.map(item=><ToastItem key={item.id} item={item} reduce={reduce}/>)}</AnimatePresence></div>;
}
export default ToastHost;
