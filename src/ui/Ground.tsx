import type { HTMLAttributes,CSSProperties } from 'react';
import {useLocation} from 'react-router';
import {GraphSketch} from './backgrounds/graph/GraphSketch';
export interface GroundProps extends HTMLAttributes<HTMLDivElement> {lamp?:'tl'|'tr'|'center'|'none';deep?:boolean}
const positions={tl:'8% -6%',tr:'108% -6%',center:'50% 20%',none:'50% 50%'};
export function Ground({lamp='tl',deep=false,className='',style,...props}:GroundProps){
 const path=useLocation().pathname;
 return <><div aria-hidden="true" {...props} className={`ground pointer-events-none fixed inset-0 z-0 ${className}`}
 style={{...({'--lamp-position':positions[lamp]} as CSSProperties),...(deep?{backgroundColor:'var(--obsidian-deep)'}:{}),...style}}/><GraphSketch path={path}/></>;
}
export default Ground;
