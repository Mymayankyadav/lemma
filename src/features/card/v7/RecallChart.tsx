import {useState} from 'react';
import {formatInterval,formatShortDate} from '../../../lib/format';
import {gradeKey,gradeWord,type RecallSeries} from './recallModel';

const W=340,H=180,L=40,R=12,T=12,B=28;
/** PLAN §6.11: estimated recall over time. A 2 px accent line, each review an 8 px dot in its grade colour (with a 44 px
 *  tap target that shows its date, grade and interval), a 0–100% axis with a hairline at 50% and a labelled target line,
 *  first and latest dates on the horizontal axis, and a legend of the four grades. */
export function RecallChart({series,target,zone}:{series:RecallSeries;target:number;zone:string}){
 const [picked,setPicked]=useState<number|null>(null);
 const span=Math.max(1,series.end-series.start);
 const x=(at:number)=>L+(at-series.start)/span*(W-L-R),y=(recall:number)=>T+(1-recall)*(H-T-B);
 const path=series.line.length?'M'+[[series.start,1] as const,...series.line.map(point=>[point.at,point.recall] as const)].map(([at,recall])=>x(at).toFixed(1)+' '+y(recall).toFixed(1)).join(' L'):'';
 const dot=picked===null?null:series.dots[picked];
 const summary='Estimated recall from '+formatShortDate(new Date(series.start),{zone})+' to '+formatShortDate(new Date(series.end),{zone})+', '+series.dots.length+(series.dots.length===1?' review':' reviews')+'.';
 return <figure className="v7-recall">
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
   {[0,.5,1].map(level=><g key={level}><line className={level===.5?'v7-recall-mid':'v7-recall-grid'} x1={L} x2={W-R} y1={y(level)} y2={y(level)}/>
    <text className="v7-recall-tick" x={L-6} y={y(level)+4} textAnchor="end">{Math.round(level*100)+'%'}</text></g>)}
   <line className="v7-recall-target" x1={L} x2={W-R} y1={y(target)} y2={y(target)}/>
   <text className="v7-recall-target-label" x={W-R} y={y(target)+14} textAnchor="end">{'target '+Math.round(target*100)+'%'}</text>
   {path&&<path className="v7-recall-line" d={path}/>}
   <text className="v7-recall-tick" x={L} y={H-8}>{formatShortDate(new Date(series.start),{zone})}</text>
   <text className="v7-recall-tick" x={W-R} y={H-8} textAnchor="end">{formatShortDate(new Date(series.end),{zone})}</text>
   {series.dots.map((item,index)=><circle key={index} className="v7-recall-dot" data-grade={gradeKey[item.rating]} cx={x(item.at)} cy={y(item.recall)} r={picked===index?6:4}/>)}
  </svg>
  {/* Tap targets as real buttons, positioned over the dots: keyboard and screen readers reach every review. */}
  <div className="v7-recall-hits">{series.dots.map((item,index)=><button key={index} type="button" aria-pressed={picked===index}
   aria-label={formatShortDate(new Date(item.at),{zone})+', '+gradeWord[item.rating]+(item.intervalDays?', next in '+formatInterval(item.intervalDays):'')}
   style={{left:(x(item.at)/W*100)+'%',top:(y(item.recall)/H*100)+'%'}} onClick={()=>setPicked(value=>value===index?null:index)}/>)}</div>
  <figcaption>
   <ul className="v7-recall-legend" aria-label="Grades">{([1,2,3,4] as const).map(rating=><li key={rating} data-grade={gradeKey[rating]}><span aria-hidden="true"/>{gradeWord[rating]}</li>)}</ul>
   <p className="v7-recall-picked" aria-live="polite">{dot?formatShortDate(new Date(dot.at),{zone})+' · '+gradeWord[dot.rating]+(dot.intervalDays?' · next in '+formatInterval(dot.intervalDays):''):'Tap a review to see its grade and interval.'}</p>
  </figcaption>
 </figure>;
}
