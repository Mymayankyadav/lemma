import {useId} from 'react';
import {area, curveMonotoneX, line} from 'd3-shape';

export interface RecallPoint {label: string; value: number | null}

/** A static ink drawing: a hatched area, no gradient or motion, including reduced motion. */
export function InkRecall({data,target}: {data: RecallPoint[]; target: number}) {
 const id=useId();
 const left=34,right=310,top=12,bottom=120;
 const x=(index:number)=>left+(right-left)*index/Math.max(1,data.length-1);
 const y=(value:number)=>bottom-(bottom-top)*Math.max(0,Math.min(1,value));
 const indexed=data.map((point,index)=>({...point,index}));
 const defined=(point:(typeof indexed)[number])=>point.value!==null&&Number.isFinite(point.value);
 const stroke=line<(typeof indexed)[number]>().defined(defined).x(p=>x(p.index)).y(p=>y(p.value??0)).curve(curveMonotoneX)(indexed);
 const shade=area<(typeof indexed)[number]>().defined(defined).x(p=>x(p.index)).y0(bottom).y1(p=>y(p.value??0)).curve(curveMonotoneX)(indexed);
 const last=[...indexed].reverse().find(defined);
 const count=indexed.filter(defined).length;
 return <svg role="img" aria-label={`Recall over time: ${count} periods with data, latest ${last?Math.round((last.value??0)*100)+'%':'unavailable'}, target ${Math.round(target*100)}%.`}
  viewBox="0 0 320 146" width="100%" className="block">
  <defs><pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
   <line x1="0" y1="0" x2="0" y2="7" stroke="var(--accent)" strokeOpacity=".24" strokeWidth="1"/>
  </pattern></defs>
  {[0,.25,.5,.75,1].map(tick=><g key={tick}>
   <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="var(--line)" strokeWidth=".8"/>
   <text x={left-7} y={y(tick)+3} textAnchor="end" fill="var(--ink-3)" fontSize="10">{Math.round(tick*100)}%</text>
  </g>)}
  <line x1={left} x2={right} y1={y(target)} y2={y(target)} stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="4 4"/>
  {shade&&<path d={shade} fill={`url(#${id})`}/>}
  {stroke&&<path d={stroke} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round"/>}
  {last&&<circle cx={x(last.index)} cy={y(last.value??0)} r="3.5" fill="var(--accent)"/>}
  <text x={left} y="141" fill="var(--ink-3)" fontSize="10">{data[0]?.label||''}</text>
  <text x={right} y="141" textAnchor="end" fill="var(--ink-3)" fontSize="10">{data[data.length-1]?.label||''}</text>
 </svg>;
}
