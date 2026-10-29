import type {HTMLAttributes,ReactNode} from 'react';
export interface TileProps extends HTMLAttributes<HTMLElement>{as?:'div'|'section'|'article';children?:ReactNode}
export function Tile({as:Tag='div',children,className='',...rest}:TileProps){
 return <Tag {...rest} className={`tile ${className}`}>{children}</Tag>;
}
export default Tile;
