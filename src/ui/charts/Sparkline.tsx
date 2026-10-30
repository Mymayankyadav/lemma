import {useId} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {scaleLinear} from 'd3-scale';
import {line,area,curveMonotoneX} from 'd3-shape';
import type {ChartSize} from './types';
export interface SparkPoint{value:number;rating?:1|2|3|4}
export interface SparklineProps extends ChartSize{data:(number|SparkPoint)[]}
const tones:Record<number,string>={1:'var(--again)',2:'var(--hard)',3:'var(--grade-good)',4:'var(--easy)'};
export function Sparkline({data,width=316,height=64,title='Card interval growth',className=''}:SparklineProps){
 const id=useId(),reduce=!!useReducedMotion(),w=Math.max(80,width),h=Math.max(30,height),rows=data.map((d,i)=>({...typeof d==='number'?{value:d}:{...d},i}));
 const min=0,max=Math.max(1,...rows.map(d=>d.value));const x=scaleLinear().domain([0,Math.max(1,rows.length-1)]).range([5,w-5]),y=scaleLinear().domain([min,max]).range([h-8,6]);
 const curve=line<(typeof rows)[number]>().x(p=>x(p.i)).y(p=>y(p.value)).curve(curveMonotoneX)(rows)||'';
 const areaPath=area<(typeof rows)[number]>().x(p=>x(p.i)).y0(h-8).y1(p=>y(p.value)).curve(curveMonotoneX)(rows)||'';
 return <svg width="100%" role="img" aria-label={`${title}: ${data.length} intervals, latest ${rows[rows.length-1]?.value??0} days.`} viewBox={`0 0 ${w} ${h}`} className={className} style={{maxWidth:w}}>
 <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--amber)" stopOpacity=".24"/><stop offset="1" stopColor="var(--amber)" stopOpacity="0"/></linearGradient></defs>
 {areaPath&&<path d={areaPath} fill={`url(#${id})`}/>}
 {curve&&<motion.path d={curve} stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" fill="none" initial={reduce?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:1.2}}/>}
 {rows.map((p,i)=><circle key={i} cx={x(p.i)} cy={y(p.value)} r="3" fill={p.rating?tones[p.rating]:'var(--amber-hi)'}/>)}
 </svg>;
}
export default Sparkline;
