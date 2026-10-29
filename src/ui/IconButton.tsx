import type {ButtonHTMLAttributes} from 'react';
import type {LucideIcon} from 'lucide-react';
import {Link} from 'react-router';
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'>{icon:LucideIcon;label:string;to?:string;tone?:'glass'|'plain'|'amber';badge?:'dot'|number}
export function IconButton({icon:Icon,label,to,tone='glass',badge,className='',...rest}:IconButtonProps){
 const classNames=`relative inline-flex size-11 shrink-0 items-center justify-center rounded-ctl ${tone==='amber'?'bg-amber-tint text-amber':tone==='plain'?'text-ink-2 hover:bg-fill-1':'glass text-ink'} ${className}`;
 const inner=<><Icon size={22} strokeWidth={1.75} aria-hidden="true"/>{badge!==undefined&&<span aria-hidden="true" className="absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-amber text-[10px] font-bold text-amber-ink">{badge==='dot'?<span className="size-1.5 rounded-full bg-amber-ink"/>:badge}</span>}</>;
 return to?<Link to={to} aria-label={label} className={classNames}>{inner}</Link>:<button {...rest} type={rest.type||'button'} aria-label={label} className={classNames}>{inner}</button>;
}
export default IconButton;
