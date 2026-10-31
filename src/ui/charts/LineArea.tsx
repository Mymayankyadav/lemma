import {useId} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {scaleLinear} from 'd3-scale';
import {line,area,curveMonotoneX} from 'd3-shape';
import type {ChartSize,Point} from './types';
export interface LineAreaProps extends ChartSize{data:Point[];target?:number;min?:number;max?:number}
export function LineArea({data,width=316,height=132,target=0.9,min=0.8,max=1,title='Recall over time',className=''}:LineAreaProps){
 const id=useId(),reduce=!!useReducedMotion(),w=Math.max(100,width),h=Math.max(75,height),left=42,right=w-12,top=12,bottom=h-24;
 const values=data.map((p,i)=>({...p,index:i})).filter(p=>p.value!=null&&Number.isFinite(p.value));
 const x=scaleLinear().domain([0,Math.max(1,data.length-1)]).range([left,right]);
 const y=scaleLinear().domain([min,max]).range([bottom,top]);
 const curve=line<(typeof values)[number]>().x(p=>x(p.index)).y(p=>y(p.value??min)).curve(curveMonotoneX);
 const areaPath=area<(typeof values)[number]>().x(p=>x(p.index)).y0(bottom).y1(p=>y(p.value??min)).curve(curveMonotoneX);
 const path=curve(values)||'',fill=areaPath(values)||'';
 const last=values[values.length-1];
 const description=`${title}. ${values.length} points; latest ${last?Math.round((last.value??0)*100)+'%':'no data'}; target ${Math.round(target*100)}%.`;
 return <svg className={className} width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={description} style={{maxWidth:w}}>
 <defs><linearGradient id={id+'-area'} x1="0" x2="0" y1="0" y2="1"><stop stopColor="var(--amber)" stopOpacity=".35"/><stop offset="1" stopColor="var(--amber)" stopOpacity="0"/></linearGradient></defs>
 {[min,(min+max)/2,max].map(v=><g key={v}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="var(--edge-2)" strokeDasharray="3 5"/><text x={left-5} y={y(v)+3} fill="var(--ink-3)" textAnchor="end" fontSize="14">{Math.round(v*100)}%</text></g>)}
 {target>=min&&target<=max&&<g><line x1={left} x2={right} y1={y(target)} y2={y(target)} stroke="var(--ink-3)" strokeDasharray="5 5" opacity=".7"/><text x={right} y={y(target)-5} textAnchor="end" fontSize="14" fill="var(--ink-3)">target {Math.round(target*100)}%</text></g>}
 {fill&&<path d={fill} fill={`url(#${id}-area)`}/>}
 {path&&<motion.path d={path} fill="none" stroke="var(--amber)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={reduce?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:1.2}}/>}
 {last&&<circle data-stress-mark="" cx={x(last.index)} cy={y(last.value??min)} r="4" fill="var(--amber-hi)" stroke="var(--amber)" strokeWidth="2"/>}
 <text x={left} y={h-5} fontSize="14" fill="var(--ink-3)">{data[0]?.label||''}</text><text x={right} y={h-5} fontSize="14" textAnchor="end" fill="var(--ink-3)">{data[data.length-1]?.label||''}</text>
 </svg>;
}
export default LineArea;
