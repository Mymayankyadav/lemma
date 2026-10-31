import type {HTMLAttributes,ReactNode} from 'react';

/** The single v4 notebook section-heading role (Newsreader italic 19/23). */
export interface SectionHeadingProps extends HTMLAttributes<HTMLHeadingElement>{
 children:ReactNode;
 /** Keep semantic heading depth in sheets while sharing the v4 visual role. */
 as?:'h2'|'h3';
}
export function SectionHeading({children,className='',as:Tag='h2',...props}:SectionHeadingProps){
 return <Tag {...props} className={`ui-section-heading ${className}`}>{children}</Tag>;
}
export default SectionHeading;
