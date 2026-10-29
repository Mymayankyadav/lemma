import type {HTMLAttributes,ReactNode} from 'react';
export interface GlassProps extends HTMLAttributes<HTMLElement>{as?:'div'|'nav'|'section'|'article';children?:ReactNode}
export function Glass({as:Tag='div',className='',children,...rest}:GlassProps){
 return <Tag {...rest} className={`glass ${className}`}>{children}</Tag>;
}
export default Glass;
