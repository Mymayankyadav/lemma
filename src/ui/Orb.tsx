import type {HTMLMotionProps} from 'motion/react';
import type {LucideIcon} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
export interface OrbProps extends Omit<HTMLMotionProps<'button'>,'children'>{icon:LucideIcon;label:string;size?:64|76;halo?:boolean}
export function Orb({icon:Icon,label,size=76,halo=true,className='',...rest}:OrbProps){
 const reduce=!!useReducedMotion();
 return <span className="relative inline-flex items-center justify-center" style={{width:size,height:size}}>
 {halo&&!reduce&&<motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-[1.5px] border-amber-line-2" animate={{scale:[1,1.5],opacity:[0.6,0]}} transition={{repeat:Infinity,duration:2.8,ease:'easeOut'}}/>}
 <motion.button {...rest} aria-label={label} whileTap={reduce?undefined:{scale:0.94}} className={`orb relative flex items-center justify-center ${className}`} style={{width:size,height:size}}><Icon size={size===64?24:28} strokeWidth={2} aria-hidden="true"/></motion.button>
 </span>;
}
export default Orb;
