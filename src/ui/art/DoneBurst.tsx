import {motion} from 'motion/react';
import {useIllustrationMotion} from './useIllustrationMotion';
export interface DoneBurstProps{size?:number;className?:string}
export function DoneBurst({size=170,className=''}:DoneBurstProps){
 const active=useIllustrationMotion();
 return <svg role="img" aria-label="Completed review illustration" viewBox="0 0 180 180" width={size} height={size} className={className}>
 <circle cx="90" cy="90" r="66" fill="var(--amber-tint)"/>
 <motion.circle cx="90" cy="90" r="48" fill="var(--raised)" stroke="var(--amber)" strokeWidth="3" strokeLinecap="round" pathLength={1}
 initial={active?{strokeDasharray:'0 1'}:false} animate={{strokeDasharray:'1 0'}} transition={{duration:1.1}}/>
 <motion.path d="m64 91 18 18 35-39" fill="none" stroke="var(--amber-hi)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" pathLength={1}
 initial={active?{pathLength:0}:false} animate={{pathLength:1}} transition={{duration:0.5,delay:0.5}}/>
 {Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4;const x=90+Math.cos(angle)*65,y=90+Math.sin(angle)*65;
 return <motion.path key={i} d={`M${x} ${y}l${Math.cos(angle)*10} ${Math.sin(angle)*10}`} stroke="var(--amber-glow)" strokeWidth="3" strokeLinecap="round" initial={active?{opacity:0,scale:0.1}:false} animate={{opacity:1,scale:1}} transition={{duration:0.42,delay:0.55+i*0.05}}/>})}
 </svg>;
}
export default DoneBurst;
