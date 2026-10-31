import {useContext,type HTMLAttributes,type ReactNode} from 'react';
import {PaperContext} from './PaperContext';
export interface CardProps extends HTMLAttributes<HTMLElement>{as?:'div'|'section'|'article';stack?:boolean;variant?:'default'|'quiet';children?:ReactNode}
export function Card({as:Tag='div',stack=false,variant='default',className='',children,...rest}:CardProps){
 const nested=useContext(PaperContext);
 return <div className={stack&&!nested?'relative mb-6':''}>
 {stack&&!nested&&<><div aria-hidden="true" className="absolute inset-x-[22px] -bottom-[26px] top-4 rounded-hero bg-well"/><div aria-hidden="true" className="absolute inset-x-[11px] -bottom-[13px] top-2 rounded-hero bg-sheet border border-edge"/></>}
 <Tag {...rest} data-card={!nested||undefined} data-paper-group={nested||undefined} className={`${nested?'ui-paper-group':'card'} relative ${variant==='quiet'&&!nested?'ui-card-quiet':''} ${className}`}>
  <PaperContext.Provider value={true}>{children}</PaperContext.Provider>
 </Tag>
 </div>;
}
export default Card;
