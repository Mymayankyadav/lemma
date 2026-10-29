import type { HTMLAttributes } from 'react';
export interface GroundProps extends HTMLAttributes<HTMLDivElement> {lamp?:'tl'|'tr'|'center'|'none';deep?:boolean}
const positions={tl:'8% -6%',tr:'108% -6%',center:'50% 20%',none:'50% 50%'};
export function Ground({lamp='tl',deep=false,className='',style,...props}:GroundProps){
 return <div aria-hidden="true" {...props} className={`ground pointer-events-none fixed inset-0 z-0 ${className}`}
 style={{background:lamp==='none'?'var(--obsidian-deep)':`radial-gradient(85% 50% at ${positions[lamp]}, var(--amber-tint), transparent 62%), var(--grad-lamp), var(--obsidian)`,...(deep?{backgroundColor:'var(--obsidian-deep)'}:{}),...style}}/>;
}
export default Ground;
