import {motion,useReducedMotion} from 'motion/react';
export interface ProgressRingProps{value:number;label:string}
export function ProgressRing({value,label}:ProgressRingProps){
 const reduce=!!useReducedMotion(),v=Math.max(0,Math.min(1,value)),r=21,c=2*Math.PI*r;
 return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v*100)} className="relative size-[52px]">
 <svg aria-hidden="true" viewBox="0 0 52 52" className="size-full -rotate-90"><circle cx="26" cy="26" r={r} fill="none" stroke="var(--fill-2)" strokeWidth="4"/>
 <motion.circle cx="26" cy="26" r={r} fill="none" stroke="var(--amber)" strokeLinecap="round" strokeWidth="4" strokeDasharray={c} initial={reduce?false:{strokeDashoffset:c}} animate={{strokeDashoffset:c*(1-v)}} transition={{duration:reduce?0.15:1.2,ease:[0.65,0,0.35,1]}}/>
 </svg><span className="absolute inset-0 flex items-center justify-center text-caption font-semibold">{Math.round(v*100)}%</span>
 </div>;
}
export default ProgressRing;
