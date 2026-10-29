import type {HTMLAttributes,ElementType,ReactNode} from 'react';
export interface SlabProps extends HTMLAttributes<HTMLElement>{as?:'div'|'section'|'article';lamp?:boolean;children?:ReactNode}
export function Slab({as:Tag='div',lamp=false,className='',children,...rest}:SlabProps){
 return <Tag {...rest} className={`slab relative isolate overflow-hidden ${className}`}>
  {lamp&&<span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full opacity-40" style={{background:'radial-gradient(closest-side,var(--amber-tint),transparent)'}}/>}{children}</Tag>;
}
export default Slab;
