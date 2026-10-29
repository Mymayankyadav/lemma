import {useId} from 'react';
import {motion,useReducedMotion} from 'motion/react';
export interface SegmentOption{value:string;label:string;count?:number}
export interface SegmentedProps{options:SegmentOption[];value:string;onChange:(value:string)=>void;tone?:'raised'|'amber';label?:string}
export function Segmented({options,value,onChange,tone='raised',label='Choose view'}:SegmentedProps){
 const id=useId(),reduce=!!useReducedMotion();
 return <div role="group" aria-label={label} className="flex min-h-12 gap-1 rounded-ctl bg-well p-1">
 {options.map(option=><button type="button" key={option.value} aria-pressed={value===option.value} onClick={()=>onChange(option.value)}
 className={`relative flex min-h-11 min-w-11 flex-1 items-center justify-center gap-1.5 rounded-[11px] px-2 text-[13px] font-semibold ${value===option.value?(tone==='amber'?'text-amber-ink':'text-ink'):'text-ink-3'}`}>
 {value===option.value&&<motion.span aria-hidden="true" layoutId={id+'-thumb'} transition={reduce?{duration:0.15}:{duration:0.35,ease:[0.16,1,0.3,1]}} className={`absolute inset-0 rounded-[11px] ${tone==='amber'?'bg-amber':'bg-raised-2'}`}/>}
 <span className="relative">{option.label}</span>{option.count!==undefined&&<span className="relative text-[11px]">{option.count}</span>}
 </button>)}
 </div>;
}
export default Segmented;
