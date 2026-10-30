import type {ReactNode} from 'react';
import {Link} from 'react-router';
import {CompassArt} from './art/CompassArt';
import {CardFanArt} from './art/CardFanArt';
import {PlugArt} from './art/PlugArt';
import {DoneBurst} from './art/DoneBurst';
import {Button} from './Button';
export interface EmptyStateProps{art:'compass'|'deck'|'plug'|'inbox';title:string;body:string;action?:{label:string;to?:string;onClick?:()=>void};className?:string}
const illustrations={compass:CompassArt,deck:CardFanArt,plug:PlugArt,inbox:DoneBurst};
export function EmptyState({art,title,body,action,className=''}:EmptyStateProps){
 const Art=illustrations[art];
 return <section className={`mx-auto flex max-w-sm flex-col items-center justify-center gap-3 py-8 text-center ${className}`}>
 {art==='plug'?<PlugArt connected={false}/>:<Art {...{connected:false}}/>}
 <h2 className="mt-1 text-card font-semibold tracking-tight">{title}</h2>
 <p className="font-math text-headline leading-relaxed text-ink-2">{body}</p>
 {action?.to?<Link to={action.to} className="lit mt-3 inline-flex min-h-[52px] items-center justify-center px-6">{action.label}</Link>:action?.onClick?<Button className="mt-3" onClick={action.onClick}>{action.label}</Button>:null}
 </section>;
}
export default EmptyState;
