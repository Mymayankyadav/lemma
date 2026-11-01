import type {ReactNode} from 'react';
import type {HTMLMotionProps} from 'motion/react';
import type {LucideIcon} from 'lucide-react';
import {LoaderCircle} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {toast} from './Toast';
import {useOnlineStatus} from './useOnlineStatus';
export interface ButtonProps extends Omit<HTMLMotionProps<'button'>,'children'>{
 variant?:'lit'|'primary'|'ghost'|'danger'|'text';size?:'m'|'l'|'xl';
 icon?:LucideIcon;loading?:boolean;needsNetwork?:boolean;children:ReactNode
}
const heights={m:'min-h-[var(--ctl)]',l:'min-h-[var(--ctl)]',xl:'min-h-[calc(var(--ctl)+4px)]'};
const variants={primary:'lit',lit:'lit',ghost:'ghost',danger:'border border-again/30 bg-danger-tint text-again',text:'bg-transparent text-amber'};
export function Button({variant='lit',size='l',icon:Icon,loading=false,needsNetwork=false,disabled=false,className='',children,onClick,...rest}:ButtonProps){
 const reduce=!!useReducedMotion();
 const online=useOnlineStatus();
 const blocked=needsNetwork&&!online;
 const originalLabel=rest['aria-label']??(typeof children==='string'?children:'Action');
 return <motion.button {...rest} disabled={disabled||loading} aria-disabled={blocked||undefined}
 aria-label={blocked?originalLabel+', needs a connection':rest['aria-label']}
 aria-busy={loading||undefined} whileTap={reduce||blocked?undefined:{scale:0.97}} transition={{duration:0.12}}
 onClick={event=>{
  if(blocked){event.preventDefault();event.stopPropagation();toast('Needs a connection');return}
  onClick?.(event);
 }}
 className={`ui-button inline-flex items-center justify-center gap-2 rounded-btn px-[var(--pad)] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${heights[size]} ${variants[variant]} ${blocked?"cursor-not-allowed opacity-50":""} ${className}`}>
 {loading?<LoaderCircle aria-hidden="true" size={19} className="animate-spin"/>:Icon?<Icon aria-hidden="true" size={19}/>:null}{children}
 </motion.button>;
}
export default Button;
