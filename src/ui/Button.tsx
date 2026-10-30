import type {ReactNode} from 'react';
import type {HTMLMotionProps} from 'motion/react';
import type {LucideIcon} from 'lucide-react';
import {LoaderCircle} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
export interface ButtonProps extends Omit<HTMLMotionProps<'button'>,'children'>{variant?:'lit'|'ghost'|'danger'|'text';size?:'m'|'l'|'xl';icon?:LucideIcon;loading?:boolean;children:ReactNode}
const heights={m:'min-h-[var(--ctl)]',l:'min-h-[var(--ctl)]',xl:'min-h-[calc(var(--ctl)+4px)]'};
const variants={lit:'lit',ghost:'ghost',danger:'border border-again/30 bg-danger-tint text-again',text:'bg-transparent text-amber'};
export function Button({variant='lit',size='l',icon:Icon,loading=false,disabled=false,className='',children,...rest}:ButtonProps){
 const reduce=!!useReducedMotion();
 return <motion.button {...rest} disabled={disabled||loading} aria-busy={loading||undefined} whileTap={reduce?undefined:{scale:0.97}} transition={{duration:0.12}}
 className={`inline-flex items-center justify-center gap-2 rounded-btn px-[var(--pad)] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${heights[size]} ${variants[variant]} ${className}`}>
 {loading?<LoaderCircle aria-hidden="true" size={19} className="animate-spin"/>:Icon?<Icon aria-hidden="true" size={19}/>:null}{children}
 </motion.button>;
}
export default Button;
