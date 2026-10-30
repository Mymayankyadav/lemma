import type {HTMLAttributes,ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
export interface ChipProps extends HTMLAttributes<HTMLSpanElement>{icon?:LucideIcon;tone?:'quiet'|'amber'|'success'|'danger';selected?:boolean;onClick?:()=>void;children:ReactNode;size?:28|32|36|40}
const tones={quiet:'bg-fill-1 text-ink-2 border-edge',amber:'bg-amber-tint text-amber border-amber-line',success:'bg-success-tint text-easy border-easy/25',danger:'bg-danger-tint text-again border-again/25'};
export function Chip({icon:Icon,tone='quiet',selected=false,onClick,children,size=32,className='',...rest}:ChipProps){
 const cls=`inline-flex items-center justify-center gap-1.5 rounded-chip border px-3 text-label font-medium ${tones[tone]} ${selected?'ring-1 ring-amber-line-2':''} ${className}`;
 const content=<>{Icon&&<Icon size={14} aria-hidden="true"/>}{children}</>;
 return onClick?<button type="button" onClick={onClick} aria-pressed={selected} className={`${cls} min-w-11`} style={{height:size}}>{content}</button>:<span {...rest} className={cls} style={{height:size,...rest.style}}>{content}</span>;
}
export default Chip;
