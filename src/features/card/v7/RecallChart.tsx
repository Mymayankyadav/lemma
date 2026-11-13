import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {formatInterval,formatShortDate} from '../../../lib/format';
import {gradeKey,gradeWord,tapGroups,type RecallSeries,type ReviewDot} from './recallModel';

const W=340,H=180,L=40,R=12,T=12,B=28;
/** The width the chart is drawn at and the touch target in CSS pixels (the kit's `--v7-touch`: 44 on the web, 48 in the app). */
function useChartBox(){
 const ref=useRef<HTMLDivElement>(null),[box,setBox]=useState({width:W,touch:44});
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  const measure=()=>{
   const width=node.getBoundingClientRect().width,touch=parseFloat(getComputedStyle(node).getPropertyValue('--v7-touch'))||44;
   setBox(previous=>width>0&&(previous.width!==width||previous.touch!==touch)?{width,touch}:previous);
  };
  measure();
  if(typeof ResizeObserver!=='function')return;
  const observer=new ResizeObserver(measure);observer.observe(node);
  return()=>observer.disconnect();
 },[]);
 return [ref,box] as const;
}
/** PLAN §6.11: estimated recall over time. A 2 px accent line, each review an 8 px dot in its grade colour (with a 44 px
 *  tap target that shows its date, grade and interval), a 0–100% axis with a hairline at 50% and a labelled target line,
 *  first and latest dates on the horizontal axis, and a legend of the four grades. N153: reviews closer than a tap target
 *  share one, which lists each of them. */
export function RecallChart({series,target,zone}:{series:RecallSeries;target:number;zone:string}){
 const [picked,setPicked]=useState<number|null>(null);
 const [hitsRef,box]=useChartBox();
 const span=Math.max(1,series.end-series.start);
 const x=(at:number)=>L+(at-series.start)/span*(W-L-R),y=(recall:number)=>T+(1-recall)*(H-T-B);
 const path=series.line.length?'M'+[[series.start,1] as const,...series.line.map(point=>[point.at,point.recall] as const)].map(([at,recall])=>x(at).toFixed(1)+' '+y(recall).toFixed(1)).join(' L'):'';
 const scale=box.width/W;
 const groups=useMemo(()=>{
  const left=(at:number)=>L+(at-series.start)/Math.max(1,series.end-series.start)*(W-L-R),top=(recall:number)=>T+(1-recall)*(H-T-B);
  return tapGroups(series.dots.map(item=>({x:left(item.at)*scale,y:top(item.recall)*scale})),box.touch);
 },[series,scale,box.touch]);
 const chosen=picked===null?null:groups.find(group=>group.first<=picked&&picked<=group.last)??null;
 const reviews=(from:number,to:number)=>series.dots.slice(from,to+1);
 const line=(item:ReviewDot)=>formatShortDate(new Date(item.at),{zone})+' · '+gradeWord[item.rating]+(item.intervalDays?' · next in '+formatInterval(item.intervalDays):'');
 const label=(items:readonly ReviewDot[])=>items.length===1
  ?formatShortDate(new Date(items[0].at),{zone})+', '+gradeWord[items[0].rating]+(items[0].intervalDays?', next in '+formatInterval(items[0].intervalDays):'')
  :formatShortDate(new Date(items[0].at),{zone})+' to '+formatShortDate(new Date(items.at(-1)!.at),{zone})+', '+items.length+' reviews: '+items.map(item=>gradeWord[item.rating]).join(', ');
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
   {series.dots.map((item,index)=><circle key={index} className="v7-recall-dot" data-grade={gradeKey[item.rating]} cx={x(item.at)} cy={y(item.recall)} r={chosen&&chosen.first<=index&&index<=chosen.last?6:4}/>)}
  </svg>
  {/* Tap targets as real buttons over the dots: keyboard and screen readers reach every review. N153: side-by-side
      targets, each at least a touch target in size, that never overlap (tapGroups). */}
  <div ref={hitsRef} className="v7-recall-hits">{groups.map(group=><button key={group.first} type="button" aria-pressed={chosen===group}
   aria-label={label(reviews(group.first,group.last))}
   style={{left:(group.left/box.width*100)+'%',width:((group.right-group.left)/box.width*100)+'%',
    top:(group.top/(box.width*H/W)*100)+'%',height:((group.bottom-group.top)/(box.width*H/W)*100)+'%'}}
   onClick={()=>setPicked(value=>value===group.first?null:group.first)}/>)}</div>
  <figcaption>
   <ul className="v7-recall-legend" aria-label="Grades">{([1,2,3,4] as const).map(rating=><li key={rating} data-grade={gradeKey[rating]}><span aria-hidden="true"/>{gradeWord[rating]}</li>)}</ul>
   <p className="v7-recall-picked" aria-live="polite">{chosen?reviews(chosen.first,chosen.last).map(line).join('; '):'Tap a review to see its grade and interval.'}</p>
  </figcaption>
 </figure>;
}
