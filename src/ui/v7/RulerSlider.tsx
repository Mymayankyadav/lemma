import {useId,useLayoutEffect,useRef,useState} from 'react';
import {haptic} from './haptics';
import '../../features/home/v7/ruler.css';

/** The same half-hour ruler for a duration or a point in the day. The native slider owns keyboard and touch access. */
export function RulerSlider({label,value,min,max,onChange,format,tickFormat=format,step=5}:{label:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void;format:(value:number)=>string;tickFormat?:(value:number)=>string}){
 const id=useId(),last=useRef(value),span=Math.max(1,max-min),ticks=[];
 const root=useRef<HTMLDivElement>(null),[labelEvery,setLabelEvery]=useState(120);
 useLayoutEffect(()=>{
  const node=root.current;if(!node)return;
  const measure=()=>{
   const track=node.querySelector<HTMLElement>('.v7-ruler'),label=node.querySelector<HTMLElement>('.v7-ruler-label');if(!track)return;
   const size=label?parseFloat(getComputedStyle(label).fontSize):12;
   const characters=Math.max(...[120,240,max].map(value=>tickFormat(value).length));
   const slots=Math.max(1,Math.floor(track.clientWidth/(characters*size*.65+12)));
   setLabelEvery(120*Math.max(1,Math.ceil((max-min)/120/slots)));
  };
  measure();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[min,max,tickFormat]);
 for(let at=Math.ceil(min/30)*30;at<=max;at+=30)ticks.push(at);
 const current=Math.min(max,Math.max(min,value));
 return <div ref={root} className="v7-ruler-control">
  <label htmlFor={id}>{label}<output htmlFor={id}>{format(current)}</output></label>
  <div className="v7-ruler v7-ruler-input-track">
   {ticks.map(at=><span key={at} className="v7-ruler-tick" data-hour={at%60===0||undefined} style={{left:(at-min)/span*100+'%'}} aria-hidden="true">
    {at%labelEvery===0&&<span className="v7-ruler-label">{tickFormat(at)}</span>}
   </span>)}
   <input id={id} type="range" min={min} max={max} step={step} value={current} aria-valuetext={format(current)} onChange={event=>{
    const next=Number(event.target.value);if(last.current!==next)haptic('snap');last.current=next;onChange(next);
   }}/>
  </div>
 </div>;
}
