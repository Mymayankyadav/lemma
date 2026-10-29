import {useId} from 'react';
import {motion} from 'motion/react';
import {useIllustrationMotion} from './useIllustrationMotion';
export interface CompassArtProps{size?:number;className?:string}
export function CompassArt({size=170,className=''}:CompassArtProps){
 const active=useIllustrationMotion(),id=useId();
 return <svg role="img" aria-label="Compass illustration" viewBox="0 0 180 180" width={size} height={size} className={className}>
 <defs><radialGradient id={id}><stop stopColor="var(--amber)" stopOpacity=".24"/><stop offset="1" stopColor="var(--amber)" stopOpacity="0"/></radialGradient></defs>
 <circle cx="90" cy="90" r="81" fill={`url(#${id})`}/><circle cx="90" cy="90" r="62" fill="none" stroke="var(--amber-line)" strokeWidth="1.5" strokeDasharray="3 6"/>
 <circle cx="90" cy="90" r="46" fill="var(--tile)" stroke="var(--edge-3)" strokeWidth="2"/>
 <motion.g style={{transformOrigin:'90px 90px'}} animate={active?{rotate:[-8,8,-8]}:{rotate:0}} transition={{duration:8,repeat:Infinity,ease:'easeInOut'}}>
 <path d="M90 47 106 90 90 133 74 90Z" fill="var(--amber-tint-2)" stroke="var(--amber)" strokeWidth="1.4"/>
 <path d="M90 47 106 90 90 88Z" fill="var(--amber)"/><path d="M90 133 74 90 90 92Z" fill="var(--ink-3)"/>
 </motion.g><circle cx="90" cy="90" r="5" fill="var(--amber-hi)"/>
 {[0,90,180,270].map(deg=><g key={deg} transform={`rotate(${deg} 90 90)`}><path d="M90 21v10" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round"/></g>)}
 <motion.circle r="3" cx="154" cy="90" fill="var(--amber-glow)" animate={active?{opacity:[0.35,1,0.35]}:{opacity:1}} transition={{duration:3.2,repeat:Infinity}}/>
 </svg>;
}
export default CompassArt;
