import type {HTMLAttributes,ReactNode} from 'react';
export type BadgeKind='new'|'gap'|'strength'|'code';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>{kind?:BadgeKind;children:ReactNode}
export function Badge({kind='code',children,className='',...props}:BadgeProps){
 return <span {...props} data-kind={kind} className={`ui-badge shrink-0 ${className}`}>{children}</span>;
}
export default Badge;
