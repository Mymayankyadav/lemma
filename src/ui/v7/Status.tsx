import type {ReactNode} from 'react';
import {Link} from 'react-router';
import {CalendarDays,CircleDashed,Clock3,Flag,Plus,Sparkle,Triangle} from 'lucide-react';
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
/**
 * R1 · F21: a neutral meta chip for things that are not a status: a date or target (flag, calendar), "next" (a ring),
 * a diff (+ Added in success, Δ Changed), a suggestion. Status icons stay for success, warning, danger and info only.
 */
export type MetaKind='target'|'date'|'next'|'added'|'changed'|'suggested';
const metaIcon={target:Flag,date:CalendarDays,next:CircleDashed,added:Plus,changed:Triangle,suggested:Sparkle} as const;
export function MetaChip({kind,children,to,className=''}:{kind:MetaKind;children:ReactNode;to?:string;className?:string}){
 const Icon=metaIcon[kind],klass='v7-meta-chip'+(className?' '+className:'');
 const body=<><Icon aria-hidden="true"/><span>{children}</span></>;
 return to?<Link className={klass} data-kind={kind} to={to}>{body}</Link>:<span className={klass} data-kind={kind}>{body}</span>;
}
/** KA7: a "live" time chip ("in 1 h 55 min", "Now · until 16:30") — an info badge with a clock icon. */
export function LiveChip({children}:{children:ReactNode}){
 return <span className="v7-badge v7-tone-info v7-live-chip"><Clock3 aria-hidden="true"/><span>{children}</span></span>;
}
