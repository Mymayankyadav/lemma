import {motion} from 'motion/react';
import {useIllustrationMotion} from './useIllustrationMotion';
export interface CardFanArtProps{size?:number;className?:string}
export function CardFanArt({size=170,className=''}:CardFanArtProps){
 const active=useIllustrationMotion();
 const cards=[{angle:-18,x:46,y:40},{angle:18,x:70,y:40},{angle:0,x:58,y:30}];
 return <svg role="img" aria-label="Study card illustration" viewBox="0 0 180 180" width={size} height={size} className={className}>
 <ellipse cx="91" cy="146" rx="64" ry="15" fill="var(--amber-tint)"/>
 {cards.map((c,i)=><motion.g key={i} style={{transformOrigin:`${c.x+31}px ${c.y+44}px`}}
 initial={active?{opacity:0,y:16,rotate:0}:false} animate={{opacity:1,y:0,rotate:c.angle}} transition={{duration:0.6,delay:i*0.12}}>
 <rect x={c.x} y={c.y} width="65" height="88" rx="11" fill={i===2?'var(--raised)':'var(--tile)'} stroke={i===2?'var(--amber-line-2)':'var(--edge-3)'}/>
 <path d={`M${c.x+15} ${c.y+28}h34 M${c.x+15} ${c.y+42}h26 M${c.x+15} ${c.y+56}h32`} stroke={i===2?'var(--amber)':'var(--ink-3)'} strokeWidth="2.5" strokeLinecap="round"/>
 </motion.g>)}
 <motion.path d="m138 28 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="var(--amber-hi)" animate={active?{scale:[0.85,1.16,0.85],opacity:[0.6,1,0.6]}:{scale:1,opacity:1}} transition={{repeat:Infinity,duration:3}}/>
 </svg>;
}
export default CardFanArt;
