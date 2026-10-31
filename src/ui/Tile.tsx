import {useContext,type HTMLAttributes,type ReactNode} from 'react';
import {PaperContext} from './PaperContext';
export interface TileProps extends HTMLAttributes<HTMLElement>{as?:'div'|'section'|'article';children?:ReactNode}
export function Tile({as:Tag='div',children,className='',...rest}:TileProps){
 const nested=useContext(PaperContext);
 return <Tag {...rest} data-paper-group={nested||undefined}
  className={`${nested?'ui-paper-group':'tile'} ${className}`}>
  <PaperContext.Provider value={true}>{children}</PaperContext.Provider>
 </Tag>;
}
export default Tile;
