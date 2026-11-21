import {useId,useLayoutEffect,useRef,useState} from 'react';
import {haptic} from './haptics';
import '../../features/home/v7/ruler.css';

export function rulerLabelValues(ticks: readonly number[], span: number, trackWidth: number, labelWidth: number) {
 const first=ticks[0],last=ticks.at(-1);
 if(first===undefined||last===undefined)return new Set<number>();
 const unitsPerPixel=span/Math.max(1,trackWidth),majorStep=span<=120?5:120;
 const every=majorStep*Math.max(1,Math.ceil((labelWidth+12)*unitsPerPixel/majorStep));
 // The end labels sit inside the track, so their nearest neighbours need
 // clearance for the full end label and half the centred interior label.
 const edgeDistance=(labelWidth*1.5+8)*unitsPerPixel;
 return new Set([first,...ticks.filter(at=>at%every===0&&at-first>=edgeDistance&&last-at>=edgeDistance),last]);
}

/** The same half-hour ruler for a duration or a point in the day. The native slider owns keyboard and touch access. */
export function RulerSlider({label,value,min,max,onChange,onCommit,format,disabled=false,tickFormat=format,step=5}:{label:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void;onCommit?:(value:number)=>void;disabled?:boolean;format:(value:number)=>string;tickFormat?:(value:number)=>string}){
 const id=useId(),last=useRef(value),span=Math.max(1,max-min),ticks:number[]=[];
 const divisions=span<=120?5:30;
 const root=useRef<HTMLDivElement>(null),[layout,setLayout]=useState({trackWidth:0,labelWidth:36});
 const firstTick=Math.ceil(min/divisions)*divisions,lastTick=Math.floor(max/divisions)*divisions;
 useLayoutEffect(()=>{
  const node=root.current;if(!node)return;
  const measure=()=>{
   const track=node.querySelector<HTMLElement>('.v7-ruler'),label=node.querySelector<HTMLElement>('.v7-ruler-label');if(!track)return;
   const size=label?parseFloat(getComputedStyle(label).fontSize):12;
   const characters=Math.max(...[firstTick,lastTick].map(value=>tickFormat(value).length));
   const widths=[...track.querySelectorAll<HTMLElement>('.v7-ruler-label')].map(value=>value.getBoundingClientRect().width);
   const labelWidth=Math.ceil(Math.max(characters*(Number.isFinite(size)?size:12)*.65,...widths));
   const trackWidth=track.clientWidth;
   setLayout(previous=>previous.trackWidth===trackWidth&&previous.labelWidth===labelWidth?previous:{trackWidth,labelWidth});
  };
  measure();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[firstTick,lastTick,tickFormat]);
 for(let at=firstTick;at<=lastTick;at+=divisions)ticks.push(at);
 const labels=rulerLabelValues(ticks,span,layout.trackWidth,layout.labelWidth);
 const current=Math.min(max,Math.max(min,value));
 return <div ref={root} className="v7-ruler-control">
  <label htmlFor={id}>{label}<output htmlFor={id}>{format(current)}</output></label>
  <div className="v7-ruler v7-ruler-input-track">
   {ticks.map(at=><span key={at} className="v7-ruler-tick" data-hour={at%60===0||undefined}
    data-edge={at===firstTick?'start':at===lastTick?'end':undefined} style={{left:(at-min)/span*100+'%'}} aria-hidden="true">
    {labels.has(at)&&<span className="v7-ruler-label">{tickFormat(at)}</span>}
   </span>)}
   <input id={id} type="range" disabled={disabled} min={min} max={max} step={step} value={current} aria-label={label} aria-valuetext={format(current)}
    onPointerUp={event=>onCommit?.(event.currentTarget.valueAsNumber)}
    onKeyUp={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))onCommit?.(event.currentTarget.valueAsNumber);}}
    onChange={event=>{
    const next=Number(event.target.value);if(last.current!==next)haptic('snap');last.current=next;onChange(next);
   }}/>
  </div>
 </div>;
}
