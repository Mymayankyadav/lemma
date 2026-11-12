import type {ReactNode} from 'react';
import {MoreActions} from './ActionSheet';

export interface RowMenuItem{label:string;icon:ReactNode;onClick:()=>void;hint?:string;destructive?:boolean}
/** The per-row ⋯: a 44 px icon button that opens the row's actions in the shared ActionSheet (R0 · F01). */
export function RowMenu({label,title,items}:{label:string;title:string;items:RowMenuItem[]}){
 return <MoreActions label={label} title={title} items={items.map(item=>({...item,destructive:item.destructive??/^(delete|remove|void)\b/i.test(item.label)}))}/>;
}
