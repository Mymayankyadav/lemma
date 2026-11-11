import type {ReactNode} from 'react';
import {Link} from 'react-router';
import {Clock3} from 'lucide-react';
import {StatusIcon,type Tone} from './KitPrimitives';

/** KC1: the kit's one Badge — 8 px corners, 24 px tall, a filled status icon, "Label · meaning" in the status colour on its
 *  tint. Status is never shown without its icon. Where a badge opens something it becomes a button or link that keeps the
 *  badge's look (with a 44 px hit area). */
export function StatusBadge({tone='info',children,onClick,to,label,className=''}:{
 tone?:Tone;children:ReactNode;onClick?:()=>void;to?:string;label?:string;className?:string;
}){
 const klass=`v7-badge v7-tone-${tone}${onClick||to?' v7-badge-action':''}${className?' '+className:''}`;
 const body=<><StatusIcon tone={tone} size={14}/><span>{children}</span></>;
 if(to)return <Link className={klass} to={to} aria-label={label}>{body}</Link>;
 if(onClick)return <button type="button" className={klass} onClick={onClick} aria-label={label}>{body}</button>;
 return <span className={klass}>{body}</span>;
}
/** KA7: a "live" time chip ("in 1 h 55 min", "Now · until 16:30") — an info badge with a clock icon. */
export function LiveChip({children}:{children:ReactNode}){
 return <span className="v7-badge v7-tone-info v7-live-chip"><Clock3 aria-hidden="true"/><span>{children}</span></span>;
}
