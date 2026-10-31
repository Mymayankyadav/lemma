import {motion,useReducedMotion} from 'motion/react';
import {scaleBand,scaleLinear} from 'd3-scale';
import type {ChartSize} from './types';
export interface GroupedBarDatum{label:string;demonstrated:number;rechecked:number}
export interface GroupedBarsProps extends ChartSize{data:GroupedBarDatum[]}
export function GroupedBars({data,width=316,height=132,title='Checkpoints by week',className=''}:GroupedBarsProps){
 const reduce=!!useReducedMotion(),w=Math.max(140,width),h=Math.max(75,height),left=10,right=w-10,top=8,bottom=h-25;
 const groups=scaleBand().domain(data.map((_,i)=>String(i))).range([left,right]).padding(0.28);
 const max=Math.max(1,...data.map(d=>Math.max(d.demonstrated,d.rechecked)));
 const y=scaleLinear().domain([0,max]).range([bottom,top]),bw=groups.bandwidth()/2;
 // Reserve at least 44 SVG units per visible label on a narrow phone.
 const labelEvery=Math.max(1,Math.ceil(data.length/Math.max(1,Math.floor((right-left)/44))));
 return <svg role="img" aria-label={`${title}: ${data.map(d=>d.label+': '+d.demonstrated+' demonstrated, '+d.rechecked+' rechecked').join('; ')}.`} width="100%" viewBox={`0 0 ${w} ${h}`} className={className} style={{maxWidth:w}}>
 <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--edge-3)"/>
 {data.map((d,i)=><g key={i}>{([['demonstrated','var(--amber)'],['rechecked','var(--ink-3)']] as const).map(([key,color],j)=>{
 const height=Math.max(0,bottom-y(d[key]));return <motion.rect key={key} x={(groups(String(i))||0)+bw*j} rx="2" fill={color} initial={reduce?false:{height:0,y:bottom}} animate={{height,y:y(d[key])}} width={Math.max(2,bw-2)} transition={{duration:0.6,delay:reduce?0:i*0.1}}/>
 })}
 {i%labelEvery===0&&<text x={(groups(String(i))||0)+groups.bandwidth()/2} y={h-5} fontSize="14" textAnchor="middle" fill="var(--ink-3)">{d.label}</text>}
 </g>)}</svg>;
}
export default GroupedBars;
