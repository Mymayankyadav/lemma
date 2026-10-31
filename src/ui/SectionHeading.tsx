import type {HTMLAttributes,ReactNode} from 'react';

/** The single v4 notebook section-heading role (Newsreader italic 19/23). */
export interface SectionHeadingProps extends HTMLAttributes<HTMLHeadingElement>{
 children:ReactNode;
}
export function SectionHeading({children,className='',...props}:SectionHeadingProps){
 return <h2 {...props} className={`ui-section-heading ${className}`}>{children}</h2>;
}
export default SectionHeading;
