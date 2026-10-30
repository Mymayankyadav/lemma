import {motion,useReducedMotion} from 'motion/react'
import {regularPolygon} from '../review-run/polygon'

interface AnswerLike {card:{cardId:string};rating:number}
interface RoundSealProps {order:readonly string[];answers:readonly AnswerLike[]}

/** Euclid's circumscribed review polygon; the first failed pass remains rubric red. */
export function RoundSeal({order,answers}:RoundSealProps){
 const reduced=!!useReducedMotion()
 const n=Math.max(3,order.length)
 const points=regularPolygon(n,84,84,58)
 const firstGrades=new Map<string,number>()
 for(const answer of answers)if(!firstGrades.has(answer.card.cardId))firstGrades.set(answer.card.cardId,answer.rating)
 return <svg viewBox="0 0 168 168" width="168" height="168" aria-hidden="true">
  <motion.circle cx="84" cy="84" r="58" fill="none" stroke="var(--line)" strokeWidth="1.2"
   initial={reduced?false:{pathLength:0}} animate={{pathLength:1}}
   transition={{duration:reduced?0:0.7,delay:reduced?0:0.4}}/>
  {points.map((p,i)=>{
   const next=points[(i+1)%n],missed=firstGrades.get(order[i])===1
   return <motion.line key={i} x1={p.x} y1={p.y} x2={next.x} y2={next.y}
    stroke={missed?'var(--bad)':'var(--accent)'} strokeWidth="2"
    strokeDasharray={missed?'4 3':undefined}
    initial={reduced?false:{pathLength:0}} animate={{pathLength:1}}
    transition={{duration:reduced?0:0.25,delay:reduced?0:i*0.07}}/>
  })}
  {points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--accent)"/>)}
  <circle cx="84" cy="84" r="3" fill="var(--accent)"/>
 </svg>
}
