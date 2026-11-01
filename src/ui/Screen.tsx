import type {ReactNode} from 'react';
import {Link} from 'react-router';
import {ArrowLeft} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {rise,fade,variantFor} from './motion';
export interface ScreenProps{title?:string;back?:string;actions?:ReactNode;tabBar?:boolean;children:ReactNode;className?:string}
// The app shell already disables its initial entrance. Nesting another 600ms
// Screen fade makes a cold document appear unready after real content paints.
// Preserve the approved rise/fade for later hash-route transitions.
const documentEntryHash=typeof window==='undefined'?null:window.location.hash;
export function isColdScreenRoute(initialHash:string,currentHash:string):boolean{
 const route=(hash:string)=>hash.replace(/^#/,'').split('?')[0]||'/';
 return route(initialHash)===route(currentHash);
}
export function Screen({title,back,actions,tabBar=false,children,className=''}:ScreenProps){
 const reduce=!!useReducedMotion();
 const skipColdEntrance=documentEntryHash!==null&&isColdScreenRoute(documentEntryHash,window.location.hash);
 return <motion.section initial={skipColdEntrance?false:"hidden"} animate="visible" variants={variantFor(rise,reduce)} className={`relative flex flex-col gap-[var(--gap)] ${tabBar?'pb-2':''} ${className}`}>
 {(title||back||actions)&&<header className="flex min-h-11 items-center gap-3">
  {back&&<Link aria-label="Back" to={back} className="flex h-11 w-11 items-center justify-center rounded-ctl text-ink-2 hover:bg-fill-1"><ArrowLeft size={22}/></Link>}
  {title&&<h1 className="min-w-0 flex-1 text-title font-semibold tracking-tight">{title}</h1>}
  {actions&&<div className="ml-auto flex items-center gap-2">{actions}</div>}
 </header>}
 {children}</motion.section>;
}
export default Screen;
