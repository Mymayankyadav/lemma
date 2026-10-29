import {motion} from 'motion/react';
import {useIllustrationMotion} from './useIllustrationMotion';
export interface PageStackArtProps{size?:number;className?:string}
export function PageStackArt({size=170,className=''}:PageStackArtProps){
 const active=useIllustrationMotion();
 return <svg role="img" aria-label="Book pages illustration" viewBox="0 0 180 180" width={size} height={size} className={className}>
 {[{x:43,y:35,rotation:-7},{x:52,y:31,rotation:4},{x:57,y:25,rotation:0}].map((p,i)=>
 <motion.g key={i} style={{transformOrigin:'95px 95px'}} initial={active?{opacity:0,y:15}:false} animate={{opacity:1,y:0,rotate:p.rotation}} transition={{duration:0.55,delay:i*0.12}}>
 <rect x={p.x} y={p.y} width="87" height="114" rx="7" fill={i===2?'var(--raised)':'var(--tile)'} stroke={i===2?'var(--amber-line-2)':'var(--edge-3)'} />
 {i===2&&<><path d="M73 53h43M73 65h46M73 77h35M73 89h41M73 101h37" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round"/><path d="M75 122h24" stroke="var(--amber)" strokeWidth="2"/></>}
 </motion.g>)}
 <motion.circle cx="143" cy="37" r="3" fill="var(--amber-hi)" animate={active?{opacity:[0.2,1,0.2]}:{opacity:1}} transition={{duration:3,repeat:Infinity}}/>
 </svg>;
}
export default PageStackArt;
