import {lazy,Suspense} from 'react';
import {Link} from 'react-router';
import {Button} from './Button';

// EmptyState is imported by successful routes for their error/empty branches.
// Keep the four animated illustration modules off those cold import graphs;
// the matching art still loads automatically when a real EmptyState renders.
const CompassArt=lazy(()=>import('./art/CompassArt'));
const CardFanArt=lazy(()=>import('./art/CardFanArt'));
const PlugArt=lazy(()=>import('./art/PlugArt'));
const DoneBurst=lazy(()=>import('./art/DoneBurst'));

export interface EmptyStateProps{art:'compass'|'deck'|'plug'|'inbox';title:string;body:string;action?:{label:string;to?:string;onClick?:()=>void};className?:string}
export function EmptyState({art,title,body,action,className=''}:EmptyStateProps){
 return <section className={`mx-auto flex max-w-sm flex-col items-center justify-center gap-3 py-8 text-center ${className}`}>
  <Suspense fallback={<div aria-hidden="true" className="h-[170px] w-[170px] shrink-0"/>}>
   {art==='plug'?<PlugArt connected={false}/>:
    art==='compass'?<CompassArt/>:
    art==='deck'?<CardFanArt/>:<DoneBurst/>}
  </Suspense>
  <h2 className="mt-1 text-card font-semibold tracking-tight">{title}</h2>
  <p className="font-math text-headline leading-relaxed text-ink-2">{body}</p>
  {action?.to?<Link to={action.to} className="lit mt-3 inline-flex min-h-[52px] items-center justify-center px-6">{action.label}</Link>:action?.onClick?<Button className="mt-3" onClick={action.onClick}>{action.label}</Button>:null}
 </section>;
}
export default EmptyState;
