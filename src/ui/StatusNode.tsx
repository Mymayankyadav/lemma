import {Check,Lock,Plus} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
export type NodeStatus='done'|'revisit'|'now'|'next'|'locked'|'proposed';
export interface StatusNodeProps{status:NodeStatus;className?:string}
const labels:Record<NodeStatus,string>={done:'Done',revisit:'Needs revisit',now:'In progress',next:'Next checkpoint',locked:'Locked',proposed:'Proposed'};
export function StatusNode({status,className=''}:StatusNodeProps){
 const reduce=!!useReducedMotion();
 return <span role="img" aria-label={labels[status]} className={`relative inline-flex size-7 shrink-0 items-center justify-center rounded-full ${status==='done'||status==='revisit'?'bg-amber text-amber-ink':status==='now'?'border-[2.5px] border-amber bg-amber-tint text-amber-hi':status==='proposed'?'border-2 border-dashed border-amber text-amber':status==='locked'?'bg-tile text-ink-4':'border-[1.5px] border-edge-3'} ${className}`}>
 {(status==='done'||status==='revisit')&&<Check size={17} strokeWidth={2.6} aria-hidden="true"/>}
 {status==='locked'&&<Lock size={13} aria-hidden="true"/>}{status==='proposed'&&<Plus size={15} aria-hidden="true"/>}
 {status==='now'&&<span className="size-2 rounded-full bg-amber-hi shadow-[0_0_10px_var(--amber)]"/>}
 {['now','revisit'].includes(status)&&!reduce&&<motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border border-amber" animate={{scale:[1,status==='now'?2:2.1],opacity:[0.6,0]}} transition={{duration:2.4,repeat:Infinity}}/>}
 </span>;
}
export default StatusNode;
