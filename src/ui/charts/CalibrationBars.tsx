import {motion,useReducedMotion} from 'motion/react';
import type {ChartSize} from './types';
import {bounded,formatPercent} from './types';
export interface CalibrationDatum{confidence?:'sure'|'unsure'|'guess';label?:string;total:number;right:number;rate:number|null}
export interface CalibrationBarsProps extends ChartSize{data:CalibrationDatum[]}
export function CalibrationBars({data,width=316,height,title='Answer confidence calibration',className=''}:CalibrationBarsProps){
 const reduce=!!useReducedMotion(),w=Math.max(180,width),h=height??Math.max(60,data.length*43),left=82,bar=w-left-55;
 return <svg role="img" aria-label={`${title}: ${data.map(d=>(d.label||d.confidence||'Unknown')+' '+d.right+' of '+d.total+' correct').join('; ')}.`} width="100%" viewBox={`0 0 ${w} ${h}`} style={{maxWidth:w}} className={className}>
 {data.map((d,i)=>{const y=7+i*43,v=bounded(d.rate??0);return <g key={i}>
 <text x={6} y={y+17} fontSize="14" fill="var(--ink-2)">{d.label||(d.confidence?d.confidence[0].toUpperCase()+d.confidence.slice(1):'Unknown')}</text>
 <rect x={left} y={y+6} height="11" width={bar} rx="5.5" fill="var(--fill-2)"/>
 <motion.rect x={left} y={y+6} height="11" rx="5.5" fill={d.rate===null?'var(--ink-3)':'var(--amber)'} initial={reduce?false:{width:0}} animate={{width:bar*v}} transition={{duration:0.9,delay:reduce?0:i*0.1}}/>
 <text x={w-5} y={y+17} textAnchor="end" fontSize="14" fill="var(--ink)">{d.rate===null?'—':formatPercent(d.rate)}</text>
 </g>})}</svg>;
}
export default CalibrationBars;
