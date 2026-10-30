import {motion,useReducedMotion} from 'motion/react'
import {useCalm} from '../../ui/useCalm'
import {regularPolygon} from '../review-run/polygon'
interface AnswerLike {card:{cardId:string};rating:number}
interface RoundSealProps {order:readonly string[];answers:readonly AnswerLike[]}
/** One edge per reviewed card; a circle/semicircles represent one/two-card rounds. */
export function RoundSeal({order,answers}:RoundSealProps){
 const reduced=!!useReducedMotion(),calm=useCalm(),quiet=reduced||calm
 const n=order.length,points=regularPolygon(Math.max(1,n),84,84,58)
 const step=Math.min(.11,1.2/Math.max(1,n)),finish=.12+n*step+.24
 const firstGrades=new Map<string,number>()
 for(const answer of answers)if(!firstGrades.has(answer.card.cardId))firstGrades.set(answer.card.cardId,answer.rating)
 const point=(angle:number,r=58)=>({x:84+r*Math.cos(angle),y:84+r*Math.sin(angle)})
 const edge=(i:number)=>{
  if(n>=3){const p=points[i],q=points[(i+1)%n];return `M${p.x} ${p.y} L${q.x} ${q.y}`}
  const a=-Math.PI/2+2*Math.PI*i/Math.max(1,n),p=point(a),q=point(a+Math.PI/Math.max(1,n)),r=point(a+2*Math.PI/Math.max(1,n))
  return `M${p.x} ${p.y} A58 58 0 0 1 ${q.x} ${q.y} A58 58 0 0 1 ${r.x} ${r.y}`
 }
 return <svg viewBox="0 0 168 168" width="200" height="200" role="img" aria-label={`Completed round of ${n} ${n===1?'card':'cards'}`}>
  {Array.from({length:32},(_,i)=>{
   const angle=i*Math.PI/16,a=point(angle,68),b=point(angle,i%2?76:82)
   return <motion.line key={'ray'+i} data-seal-ray x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)"
    initial={quiet?false:{opacity:0}} animate={quiet?{opacity:0}:{opacity:[0,.6,0],scale:[.82,1.06,1.16]}}
    style={{transformOrigin:'84px 84px'}} transition={{duration:quiet?0:1.1,delay:quiet?0:finish+.65+(i%8)*.018}}/>
  })}
  <motion.circle cx="84" cy="84" r="58" fill="none" stroke="var(--line)" strokeWidth="1.2"
   initial={quiet?false:{pathLength:0}} animate={{pathLength:1}}
   transition={{duration:quiet?0:.7,delay:quiet?0:finish}}/>
  {points.map((p,i)=><motion.line key={'radius'+i} data-seal-radius x1={84} y1={84} x2={p.x} y2={p.y}
   stroke="var(--ink-3)" strokeWidth=".8" initial={quiet?false:{opacity:0}} animate={{opacity:.35}}
   transition={{duration:quiet?0:.3,delay:quiet?0:finish+.3+i*step/3}}/>)}
  {order.map((id,i)=><motion.path key={id} data-round-edge={firstGrades.get(id)===1?'missed':'passed'} d={edge(i)} fill="none"
   stroke={firstGrades.get(id)===1?'var(--bad)':'var(--accent)'} strokeWidth="2"
   initial={quiet?false:{pathLength:0}} animate={{pathLength:1}}
   transition={{duration:quiet?0:.24,delay:quiet?0:.12+i*step}}/>)}
  {order.map((id,i)=><motion.circle key={id} cx={points[i].x} cy={points[i].y} r="2.5" fill="var(--bg)" stroke="var(--accent)"
   initial={quiet?false:{scale:0}} animate={{scale:1}} style={{transformOrigin:`${points[i].x}px ${points[i].y}px`}}
   transition={{duration:quiet?0:.22,delay:quiet?0:.12+i*step}}/>)}
  <motion.circle cx="84" cy="84" r="3" fill="var(--accent)" style={{transformOrigin:'84px 84px'}}
   initial={quiet?false:{scale:0}} animate={quiet?{scale:1}:{scale:[0,1.8,1]}}
   transition={{duration:quiet?0:.6,delay:quiet?0:finish+.65}}/>
 </svg>
}
