import {motion,useReducedMotion} from 'motion/react';
export interface StepRingProps{steps:number;current:number;spark?:boolean}
export function StepRing({steps,current,spark=false}:StepRingProps){
 const reduce=!!useReducedMotion(),n=Math.max(1,Math.min(12,Math.floor(steps))),done=Math.max(0,Math.min(n,Math.floor(current)-1));
 const r=30,c=2*Math.PI*r,segment=c/n,gap=Math.min(8,segment*0.32),length=segment-gap;
 return <div role="img" aria-label={`Step ${Math.min(current,n)} of ${n}`} className="relative size-[76px]">
 <svg viewBox="0 0 76 76" aria-hidden="true" className="size-full -rotate-90">
 {Array.from({length:n},(_,i)=><motion.circle key={i} cx="38" cy="38" r={r} fill="none" stroke={i<done?'var(--amber)':i===done?'var(--amber-hi)':'var(--edge-3)'} strokeWidth={i===done?4:3} strokeLinecap="round"
 strokeDasharray={`${length} ${c-length}`} strokeDashoffset={-i*segment} initial={reduce?false:{opacity:0}} animate={{opacity:1}} transition={{duration:reduce?0.15:0.4,delay:i*0.08}}/>)}
 </svg><span className="absolute inset-0 flex items-center justify-center text-[16px] font-semibold">{Math.min(current,n)}/{n}</span>
 {spark&&!reduce&&<motion.span className="absolute left-1/2 top-0 size-1 rounded-full bg-amber-glow shadow-[0_0_9px_var(--amber)]" style={{transformOrigin:'0px 38px'}} animate={{rotate:360}} transition={{repeat:Infinity,duration:10,ease:'linear'}}/>}
 </div>;
}
export default StepRing;
