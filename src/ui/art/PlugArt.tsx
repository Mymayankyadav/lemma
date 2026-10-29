import {motion} from 'motion/react';
import {useIllustrationMotion} from './useIllustrationMotion';
export interface PlugArtProps{connected:boolean;size?:number;className?:string}
export function PlugArt({connected,size=170,className=''}:PlugArtProps){
 const active=useIllustrationMotion();
 return <svg role="img" aria-label={connected?'Connected tutor illustration':'Disconnected tutor illustration'} viewBox="0 0 180 180" width={size} height={size} className={className}>
 <circle cx="90" cy="90" r="74" fill="var(--amber-tint)" opacity={connected?1:0.35}/>
 <motion.g animate={{x:connected?0:-15}} transition={{type:'spring',stiffness:220,damping:25}}>
 <path d="M19 90h33m0-18v36l25 0V72Z" fill="var(--raised)" stroke="var(--ink-2)" strokeWidth="3" strokeLinejoin="round"/>
 <path d="M69 72V56m11 16V56" stroke="var(--amber)" strokeWidth="5" strokeLinecap="round"/>
 </motion.g>
 <motion.g animate={{x:connected?0:15}} transition={{type:'spring',stiffness:220,damping:25}}>
 <path d="M157 90h-26m0-18v36H105V72Z" fill="var(--raised)" stroke="var(--ink-2)" strokeWidth="3" strokeLinejoin="round"/>
 <path d="M113 72V56m11 16V56" stroke="var(--amber)" strokeWidth="5" strokeLinecap="round"/>
 </motion.g>
 {connected&&<motion.g animate={active?{opacity:[0.25,1,0.25],scale:[0.75,1.2,0.75]}:{opacity:1}} transition={{duration:3.2,repeat:Infinity}}>
 <circle cx="91" cy="90" r="8" fill="var(--amber-hi)"/><path d="M91 73v-6m0 46v-6m17-17h6m-45 0h6" stroke="var(--amber-glow)" strokeWidth="2" strokeLinecap="round"/></motion.g>}
 </svg>;
}
export default PlugArt;
