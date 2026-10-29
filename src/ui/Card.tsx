import type {HTMLAttributes,ReactNode} from 'react';
export interface CardProps extends HTMLAttributes<HTMLElement>{as?:'div'|'section'|'article';stack?:boolean;children?:ReactNode}
export function Card({as:Tag='div',stack=false,className='',children,...rest}:CardProps){
 return <div className={stack?'relative mb-6':''}>
 {stack&&<><div aria-hidden="true" className="absolute inset-x-[22px] -bottom-[26px] top-4 rounded-hero bg-well"/><div aria-hidden="true" className="absolute inset-x-[11px] -bottom-[13px] top-2 rounded-hero bg-sheet border border-edge"/></>}
 <Tag {...rest} className={`card relative ${className}`}>{children}</Tag>
 </div>;
}
export default Card;
