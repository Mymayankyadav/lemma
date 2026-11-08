import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router';
import {Ellipsis,Inbox,Plus} from 'lucide-react';
import {useHome} from '../data/hooks';
const TaskSheet=lazy(()=>import('../features/tasks/TaskSheet'));

/** Shared v6 destinations; legacy page headers are not mounted with the flag off. */
export function v6PageTitle(pathname:string){
 const titles:Record<string,string>={
  '/':'Today','/projects':'Paths','/projects/new':'New path',
  '/review':'Review','/review/run':'Review round','/review/done':'Review complete',
  '/calendar':'Calendar','/insights':'Progress','/proposals':'Inbox','/tasks':'Tasks',
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
 const addMenu=useRef<HTMLDetailsElement>(null);
 const [taskOpen,setTaskOpen]=useState(false);
 const [taskSaved,setTaskSaved]=useState(false);
 const closeTask=()=>{setTaskOpen(false);queueMicrotask(()=>addMenu.current?.querySelector('summary')?.focus());};
 useEffect(()=>{if(menu.current)menu.current.open=false;if(addMenu.current)addMenu.current.open=false;},[location.pathname]);
 const pending=Math.max(0,data?.pendingProposals??0);
 const today=pathname==='/';
 const date=new Date();
 const dateISO=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 return <header data-v6-header="" className="notebook-header relative z-20 mb-5">
  <div className="notebook-identity">
   {today&&<span className="notebook-mark" aria-hidden="true">ℓ</span>}
   <div className="min-w-0">
    <h1 className="min-w-0 break-words">{today?'Lemma':v6PageTitle(pathname)}</h1>
    {today&&<time dateTime={dateISO}>{new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(date)}</time>}
   </div>
  </div>
  <nav aria-label="Page actions" className="lemma-header-cluster">
   <Link to="/proposals" className="lemma-header-inbox desk-action"
    aria-label={pending?'Inbox, '+pending+' pending':'Inbox'} title="Inbox">
    <Inbox size={20} aria-hidden="true"/>
    <span className="sr-only">Inbox</span>
    {pending>0&&<span className="lemma-header-badge" aria-hidden="true">{pending>99?'99+':pending}</span>}
   </Link>
   <details ref={addMenu} className="lemma-add-menu">
    <summary className="desk-action" aria-label="Add to notebook" title="Add">
     <Plus size={20} aria-hidden="true"/><span className="sr-only">Add</span>
    </summary>
    <nav aria-label="Add to notebook">
     <button type="button" onClick={()=>{if(addMenu.current)addMenu.current.open=false;setTaskOpen(true);}}>Task</button>
     <Link to="/projects/new">Learning path</Link>
     <Link to="/cards?new=1">Card</Link>
    </nav>
   </details>
   <details ref={menu} data-ui="utility-menu">
    <summary className="desk-action" aria-label="Notebook menu" title="Notebook menu">
     <Ellipsis size={20} aria-hidden="true"/><span className="sr-only">Menu</span>
    </summary>
    <nav aria-label="Notebook destinations">
     {([['/settings','Settings'],['/cards','Card library'],['/atlas','Concept map'],['/tasks','Tasks'],['/calendar','Calendar']] as const)
      .filter(([to])=>to!==pathname).map(([to,label])=>
       <Link key={to} to={to}>{label}</Link>)}
    </nav>
   </details>
  </nav>
  {taskSaved&&<p role="status" className="flex w-full items-center justify-between gap-2 text-label text-ink-2">
   Task saved. <Link to="/tasks" onClick={()=>setTaskSaved(false)} className="inline-flex min-h-11 items-center font-semibold text-amber underline">View in backlog</Link>
  </p>}
  {taskOpen&&<Suspense fallback={null}><TaskSheet onDismiss={closeTask} onSaved={()=>setTaskSaved(true)}/></Suspense>}
 </header>;
}
