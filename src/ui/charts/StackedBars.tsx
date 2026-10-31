import {motion,useReducedMotion} from 'motion/react';
import {scaleBand,scaleLinear} from 'd3-scale';
import type {ChartSize} from './types';
export interface StackedBarDatum{label:string;again:number;hard:number;good:number;easy:number}
export interface StackedBarsProps extends ChartSize{data:StackedBarDatum[]}
// Use the semantic review colours in both light and dark worlds.
// --good is the success green (Easy); a Good review uses --grade-good.
const parts=[['again','var(--bad)'],['hard','var(--warn)'],['good','var(--grade-good)'],['easy','var(--good)']] as const;
export function StackedBars({data,width=316,height=120,title='Reviews by day',className=''}:StackedBarsProps){
 const reduce=!!useReducedMotion(),w=Math.max(120,width),h=Math.max(70,height),top=8,bottom=h-23,left=8,right=w-7;
 const max=Math.max(1,...data.map(d=>d.again+d.hard+d.good+d.easy));
 const x=scaleBand().domain(data.map((_,i)=>String(i))).range([left,right]).padding(data.length>16?0.18:0.32);
 const y=scaleLinear().domain([0,max]).range([bottom,top]);
 // Labels need >=12px; omit intermediate ticks instead of shrinking them.
 const labelEvery=Math.max(1,Math.ceil(data.length/Math.max(1,Math.floor((right-left)/38))));
 return <svg role="img" aria-label={`${title}: ${data.length} periods and ${data.reduce((n,d)=>n+d.again+d.hard+d.good+d.easy,0)} reviews.`} className={className} width="100%" viewBox={`0 0 ${w} ${h}`} style={{maxWidth:w}}>
 <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--edge-3)"/>
 {data.map((d,i)=>{let offset=0;return <g key={i}>
 <g data-stress-mark="">
 {parts.map(([key,color])=>{const count=d[key],base=offset;offset+=count;const topY=y(offset),bottomY=y(base),barHeight=Math.max(0,bottomY-topY);
 return count>0?<motion.rect key={key} data-review-grade={key} x={x(String(i))||0} width={Math.max(1,x.bandwidth())} fill={color} rx={1.5}
 initial={reduce?false:{y:bottom,height:0}} animate={{y:topY,height:barHeight}} transition={{duration:0.55,delay:reduce?0:i*(data.length>16?0.018:0.06)}}/>:null})}</g>
 {(i%labelEvery===0)&&<text x={(x(String(i))||0)+x.bandwidth()/2} y={h-5} fontSize="14" textAnchor="middle" fill="var(--ink-3)">{d.label}</text>}
 </g>})}</svg>;
}
export default StackedBars;
