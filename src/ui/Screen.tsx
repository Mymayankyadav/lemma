import type {ReactNode} from 'react';
import {Link} from 'react-router';
import {ArrowLeft} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {rise,fade,variantFor} from './motion';
export interface ScreenProps{title?:string;back?:string;actions?:ReactNode;tabBar?:boolean;children:ReactNode;className?:string}
export function Screen({title,back,actions,tabBar=false,children,className=''}:ScreenProps){
 const reduce=!!useReducedMotion();
 return <motion.section initial="hidden" animate="visible" variants={variantFor(rise,reduce)} className={`relative flex flex-col gap-[var(--gap)] ${tabBar?'pb-2':''} ${className}`}>
 {(title||back||actions)&&<header className="flex min-h-11 items-center gap-3">
  {back&&<Link aria-label="Back" to={back} className="flex h-11 w-11 items-center justify-center rounded-ctl text-ink-2 hover:bg-fill-1"><ArrowLeft size={22}/></Link>}
  {title&&<h1 className="min-w-0 flex-1 text-title font-semibold tracking-tight">{title}</h1>}
  {actions&&<div className="ml-auto flex items-center gap-2">{actions}</div>}
 </header>}
 {children}</motion.section>;
}
export default Screen;
