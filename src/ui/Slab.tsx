import {useContext,type HTMLAttributes,type ReactNode} from 'react';
import {PaperContext} from './PaperContext';
export interface SlabProps extends HTMLAttributes<HTMLElement>{as?:'div'|'section'|'article';lamp?:boolean;children?:ReactNode}
export function Slab({as:Tag='div',lamp=false,className='',children,...rest}:SlabProps){
 const nested=useContext(PaperContext);
 return <Tag {...rest} data-paper-group={nested||undefined}
  className={`${nested?'ui-paper-group relative':'slab relative isolate overflow-hidden'} ${className}`}>
  {lamp&&!nested&&<span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full opacity-40" style={{background:'radial-gradient(closest-side,var(--amber-tint),transparent)'}}/>}
  <PaperContext.Provider value={true}>{children}</PaperContext.Provider>
 </Tag>;
}
export default Slab;
