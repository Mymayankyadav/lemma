import {motion} from 'motion/react';
import {useIllustrationMotion} from './useIllustrationMotion';
export interface StarfieldProps{className?:string;count?:number}
export function Starfield({className='',count=85}:StarfieldProps){
 const active=useIllustrationMotion(),n=Math.max(10,Math.min(160,Math.floor(count)));
 const stars=Array.from({length:n},(_,i)=>{const x=((i*73.123+Math.sin(i*5.27)*31+1200)%1200),y=((i*41.739+Math.cos(i*3.17)*19+800)%800);return {x,y,r:i%7===0?1.5:0.8,opacity:0.18+(i%5)*0.1}});
 return <svg aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
 {[0,1].map(layer=><motion.g key={layer} animate={active?{x:[0,layer?10:-8,0],y:[0,layer?-5:7,0]}:{x:0,y:0}} transition={{duration:layer?34:26,repeat:Infinity,ease:'linear'}}>
 {stars.filter((_,i)=>i%2===layer).map((star,i)=><circle key={i} cx={star.x} cy={star.y} r={star.r} fill="var(--ink-2)" opacity={star.opacity}/>)}
 </motion.g>)}
 </svg>;
}
export default Starfield;
