import {motion,useReducedMotion} from 'motion/react';
export interface SegmentBarProps{total:number;done:number;current?:number;label?:string}
export function SegmentBar({total,done,current,label='Checkpoint progress'}:SegmentBarProps){
 const n=Math.min(40,Math.max(0,Math.floor(total))),reduce=!!useReducedMotion();
 return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={n} aria-valuenow={Math.min(n,Math.max(0,done))} className="flex items-center gap-1.5">
 {Array.from({length:n},(_,i)=><span key={i} aria-hidden="true" className={`relative h-1 flex-1 rounded-full ${i<done?'bg-amber':i+1===current?'bg-amber-hi':'bg-fill-2'}`}>
 {i+1===current&&!reduce&&<motion.span className="absolute inset-0 rounded-full bg-amber-hi" animate={{opacity:[0.35,1,0.35]}} transition={{repeat:Infinity,duration:2.2}}/>}
 </span>)}
 </div>;
}
export default SegmentBar;
