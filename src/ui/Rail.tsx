import {motion,useReducedMotion} from 'motion/react';
export interface RailProps{value:number;sheen?:boolean;delay?:number;label?:string;className?:string}
export function Rail({value,sheen=false,delay=0,label='Progress',className=''}:RailProps){
 const reduce=!!useReducedMotion(),v=Math.min(1,Math.max(0,Number.isFinite(value)?value:0));
 return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v*100)} className={`relative h-1 overflow-hidden rounded-full bg-fill-2 ${className}`}>
 <motion.div initial={reduce?false:{scaleX:0}} animate={{scaleX:1}} transition={{duration:reduce?0.15:1.1,delay:reduce?0:delay,ease:[0.65,0,0.35,1]}} style={{width:`${v*100}%`,background:'var(--grad-rail)',transformOrigin:'left'}} className="relative h-full rounded-full shadow-[0_0_12px_var(--amber-line)]">
 {sheen&&!reduce&&<motion.div aria-hidden="true" initial={{x:'-100%'}} animate={{x:'200%'}} transition={{delay:delay+0.7,duration:0.65}} className="absolute inset-0 bg-linear-to-r from-transparent via-amber-hi/60 to-transparent"/>}
 </motion.div></div>;
}
export default Rail;
