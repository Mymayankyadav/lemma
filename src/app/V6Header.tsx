import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router';
import {ArrowLeft,Ellipsis,Inbox,Plus} from 'lucide-react';
import {useHome} from '../data/hooks';
import {plainMath} from '../lib/plain-math';
import {useV6RouteSubtitle,useV6RouteTitle} from './v6Title';
const TaskSheet=lazy(()=>import('../features/tasks/TaskSheet'));

/** N13's shared v6 title and actions; the legacy page headers stay unchanged when the flag is off. */
export function v6PageTitle(pathname:string){
 const titles:Record<string,string>={
  '/':'Today','/projects':'Paths','/projects/new':'New path',
  '/review':'Review','/review/run':'Review round','/review/done':'Review complete',
  '/calendar':'Calendar','/insights':'Progress','/proposals':'Inbox','/tasks':'Tasks',
  '/cards':'Cards','/atlas':'Concept map','/settings':'Settings','/kit':'Kit',
  '/log':'Time log','/practice':'Practice','/today/close':'Close the day',
 };
 return titles[pathname]??(pathname.startsWith('/proposals/')?'Plan proposal':
  pathname.startsWith('/cards/')?'Card detail':pathname.startsWith('/p/')?'Path':
  pathname.startsWith('/s/')?'Session':'Lemma');
}

/** The five destinations; every other route is a detail screen with a back control. */
export const v6TabRoutes=new Set(['/','/projects','/review','/calendar','/insights']);
/** N110 (mockup `NotebookMenu`): destinations and Cards/Inbox show Inbox and Add in the
 * header; other detail screens keep only the menu, which then carries Inbox and Add. */
export function v6CompactHeader(pathname:string){
 return !v6TabRoutes.has(pathname)&&!['/cards','/proposals'].includes(pathname);
}

function closeDetails(target:EventTarget){
 (target as HTMLElement).closest('details')?.removeAttribute('open');
}

function HeaderCluster({pathname,onTask}:{pathname:string;onTask:()=>void}){
 const {data}=useHome();
 const pending=Math.max(0,data?.pendingProposals??0);
 const compact=v6CompactHeader(pathname);
 const addItems=[
  <button key="task" type="button" onClick={event=>{closeDetails(event.currentTarget);onTask();}}>Task</button>,
  <Link key="block" to="/calendar?new=block" onClick={event=>closeDetails(event.currentTarget)}>Time block</Link>,
  <Link key="card" to="/cards?new=1" onClick={event=>closeDetails(event.currentTarget)}>Card</Link>,
  <Link key="path" to="/projects/new" onClick={event=>closeDetails(event.currentTarget)}>New path</Link>,
 ];
 const destinations=([['/tasks','Tasks'],['/practice','Practice'],['/log','Time log'],
  ['/today/close','Close the day'],['/atlas','Concept map'],['/cards','Card library'],['/settings','Settings']] as const)
  .filter(([to])=>to!==pathname);
 return <nav aria-label="Page actions" className="lemma-header-cluster">
  {!compact&&<Link to="/proposals" className="lemma-header-inbox" title="Inbox"
   aria-label={pending?'Inbox, '+pending.toLocaleString()+' pending':'Inbox'}>
   <Inbox size={20} aria-hidden="true"/><span className="sr-only">Inbox</span>
   {pending>0&&<span className="lemma-header-badge" aria-hidden="true">{pending>99?'99+':pending}</span>}
  </Link>}
  {!compact&&<details className="lemma-add-menu">
   <summary aria-label="Add" title="Add"><Plus size={20} aria-hidden="true"/><span className="sr-only">Add</span></summary>
   <nav aria-label="Add to notebook">{addItems}</nav>
  </details>}
  <details data-ui="utility-menu">
   <summary aria-label="Menu" title="Notebook menu"><Ellipsis size={20} aria-hidden="true"/><span className="sr-only">Menu</span></summary>
   <nav aria-label="Notebook destinations">
    {compact&&<Link to="/proposals">{pending?'Inbox · '+pending.toLocaleString():'Inbox'}</Link>}
    {compact&&<div className="lemma-menu-add"><span className="lemma-menu-label">Add to notebook</span>{addItems}</div>}
    {destinations.map(([to,label])=><Link key={to} to={to}>{label}</Link>)}
    {([['/','Today'],['/projects','Paths'],['/review','Review'],['/calendar','Calendar'],['/insights','Progress']] as const)
     .map(([to,label])=><Link key={'d'+to} to={to} className="lemma-landscape-destination">{label}</Link>)}
   </nav>
  </details>
 </nav>;
}

export default function V6Header({pathname}:{pathname:string}){
 const location=useLocation(),navigate=useNavigate();
 const header=useRef<HTMLElement>(null);
 const title=plainMath(useV6RouteTitle(pathname,v6PageTitle(pathname)));
 const subtitle=useV6RouteSubtitle(pathname);
 const [taskOpen,setTaskOpen]=useState(false);
 const [taskSaved,setTaskSaved]=useState(false);
 const closeTask=()=>{setTaskOpen(false);queueMicrotask(()=>header.current?.querySelector<HTMLElement>('.lemma-add-menu summary, [data-ui=utility-menu] summary')?.focus());};
 // Route changes close any open header menu.
 useEffect(()=>{header.current?.querySelectorAll('details[open]').forEach(d=>d.removeAttribute('open'));},[location.pathname]);
 // Escape closes an open header menu and returns focus to its trigger.
 useEffect(()=>{
  const node=header.current;if(!node)return;
  const key=(event:KeyboardEvent)=>{
   if(event.key!=='Escape')return;
   const open=node.querySelector<HTMLDetailsElement>('details[open]');
   if(!open)return;
   open.removeAttribute('open');open.querySelector<HTMLElement>('summary')?.focus();
  };
  document.addEventListener('keydown',key);
  return()=>document.removeEventListener('keydown',key);
 },[pathname]);
 const cluster=<HeaderCluster pathname={pathname} onTask={()=>setTaskOpen(true)}/>;
 const extras=<>
  {taskSaved&&<p role="status" className="flex basis-full items-center justify-between gap-2 text-label text-ink-2">Task saved. <Link to="/tasks" onClick={()=>setTaskSaved(false)} className="inline-flex min-h-11 items-center font-semibold text-[var(--link)] underline">View in backlog</Link></p>}
  {taskOpen&&<Suspense fallback={null}><TaskSheet onDismiss={closeTask} onSaved={()=>setTaskSaved(true)}/></Suspense>}
 </>;
 if(pathname==='/'){
  const date=new Date();
  return <header ref={header} data-v6-header="" className="notebook-header">
   <div className="notebook-identity">
    <span className="notebook-mark" aria-hidden="true">ℓ</span>
    <div>
     <h1>Lemma<span className="sr-only"> · Today</span></h1>
     <time dateTime={date.toLocaleDateString('en-CA')}>{new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(date)}</time>
    </div>
   </div>
   {cluster}{extras}
  </header>;
 }
 const back=!v6TabRoutes.has(pathname);
 return <header ref={header} data-v6-header="" data-ui="page-header" data-back={back} data-header-layout="compact"
  className="page-header lemma-page-header">
  <div className="lemma-page-title-row">
   {back&&<button type="button" aria-label="Back" data-ui="page-back" className="lemma-page-back"
    onClick={()=>{if(window.history.length>1)navigate(-1);else navigate('/');}}>
    <ArrowLeft size={22} aria-hidden="true"/>
   </button>}
   {subtitle?<div className="lg-heading min-w-0 flex-1">
    <h1 title={title}>{title}</h1>
    <p data-v6-header-subtitle="" className="text-label text-ink-2">{subtitle}</p>
   </div>:<h1 title={title}>{title}</h1>}
   {cluster}
  </div>
  {extras}
 </header>;
}
