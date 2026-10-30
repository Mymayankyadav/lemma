import {useId} from 'react';
export interface SwitchProps{checked:boolean;onChange:(checked:boolean)=>void;label:string;disabled?:boolean}
export function Switch({checked,onChange,label,disabled}:SwitchProps){
 const id=useId();
 return <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-body-l text-ink">
 <span>{label}</span><span data-checked={checked} className={`ui-switch-track relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-ctl transition-colors ${checked?'bg-amber':'bg-raised-2'}`}>
 <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={e=>onChange(e.currentTarget.checked)} disabled={disabled}/>
 <span aria-hidden="true" className={`ui-switch-thumb absolute top-[3px] size-[26px] rounded-ctl bg-ink shadow transition-transform ${checked?'translate-x-[23px] bg-amber-ink':'translate-x-[3px]'}`}/>
 </span></label>;
}
export default Switch;
