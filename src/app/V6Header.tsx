import {useEffect,useRef} from 'react';
import {Link,useLocation} from 'react-router';
import {Inbox,Menu,Plus} from 'lucide-react';
import {useHome} from '../data/hooks';

/** N13's shared v6 title and actions; the legacy page headers stay unchanged when the flag is off. */
export function v6PageTitle(pathname:string){
 const titles:Record<string,string>={
  '/':'Today','/projects':'Paths','/projects/new':'New path',
  '/review':'Review','/review/run':'Review round','/review/done':'Review complete',
  '/calendar':'Calendar','/insights':'Progress','/proposals':'Inbox',
  '/cards':'Cards','/atlas':'Atlas','/settings':'Settings','/kit':'Kit',
 };
 return titles[pathname]??(pathname.startsWith('/proposals/')?'Proposal':
  pathname.startsWith('/cards/')?'Card':pathname.startsWith('/p/')?'Path':
  pathname.startsWith('/s/')?'Session':'Lemma');
}

export default function V6Header({pathname}:{pathname:string}){
 const {data}=useHome();
 const location=useLocation();
 const menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(menu.current)menu.current.open=false;},[location.pathname]);
 const pending=Math.max(0,data?.pendingProposals??0);
 const action='flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-ctl border border-edge px-3 text-label font-semibold text-ink-2 hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';
 return <header data-v6-header="" className="relative z-20 mb-5 flex min-w-0 flex-col gap-3">
  <div className="flex min-h-11 items-center justify-between gap-3">
   <h2 className="min-w-0 truncate text-title font-semibold tracking-tight">{v6PageTitle(pathname)}</h2>
  </div>
  <nav aria-label="Page actions" className="flex min-w-0 items-stretch gap-2">
   <Link to="/proposals" aria-label={pending?'Inbox, '+pending+' pending':'Inbox'} className={action+' flex-1'}>
    <Inbox size={18} aria-hidden="true"/><span>Inbox</span>
    {pending>0&&<span aria-label={pending+' pending'} className="rounded-ctl bg-amber px-1.5 text-[12px] font-bold text-amber-ink tabular-nums">{pending>99?'99+':pending}</span>}
   </Link>
   <Link to="/projects/new" className={action+' flex-1'}><Plus size={18} aria-hidden="true"/>Add</Link>
   <details ref={menu} className="relative min-w-0 flex-1">
    <summary className={action+' h-full cursor-pointer list-none [&::-webkit-details-marker]:hidden'}><Menu size={18} aria-hidden="true"/>Menu</summary>
    <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-ctl border border-edge bg-[var(--paper)] p-1 shadow-lg">
     {[['Settings','/settings'],['Cards','/cards'],['Atlas','/atlas']].map(([label,to])=>
      <Link key={to} to={to} className="flex min-h-11 items-center rounded-ctl px-3 text-label font-semibold text-ink-2 hover:bg-fill-1">{label}</Link>)}
    </div>
   </details>
  </nav>
 </header>;
}
