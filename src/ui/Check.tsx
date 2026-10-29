import {useEffect,useRef} from 'react';
import {Check as CheckIcon,Minus} from 'lucide-react';
export interface CheckProps{checked:boolean|'mixed';onChange:(checked:boolean)=>void;size?:20|22;label:string;disabled?:boolean}
export function Check({checked,onChange,size=22,label,disabled}:CheckProps){
 const ref=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(ref.current)ref.current.indeterminate=checked==='mixed'},[checked]);
 return <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 text-[13px] text-ink-2">
  <input ref={ref} type="checkbox" disabled={disabled} className="peer sr-only" checked={checked===true} onChange={e=>onChange(e.currentTarget.checked)}/>
  <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-[6px] border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber ${checked?'border-amber bg-amber text-amber-ink':'border-edge-3 bg-well'}`} style={{width:size,height:size}}>
  {checked==='mixed'?<Minus size={14}/>:checked?<CheckIcon size={15} strokeWidth={2.6}/>:null}</span>{label}
 </label>;
}
export default Check;
