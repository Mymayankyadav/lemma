import {lazy,Suspense,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {Link,useLocation,useNavigate} from 'react-router';
import {CalendarDays,ChartColumn,House,Layers,Pause,Play,Plus,Route,Search,Inbox,Settings,ChevronLeft,MoreHorizontal} from 'lucide-react';
import {useHome} from '../../data/hooks';
import {getStudyApi} from '../../data/study';
import {subjectClass} from '../../ui/v7/Subject';
import {kitSubject} from '../../features/atlas/v7/model';
import {announceFocusChange,focusClock,focusWord,useActiveFocus,useNow} from './focus';
import './shell.css';

const CaptureSheet=lazy(()=>import('./CaptureSheet'));
const SearchSheet=lazy(()=>import('./SearchSheet'));

/** PLAN §6.1: floating tab bar, session row, capture button and the three header kinds. */
export const tabs=[
 {to:'/',label:'Today',Icon:House,match:(path:string)=>path==='/'},
 {to:'/projects',label:'Paths',Icon:Route,match:(path:string)=>path.startsWith('/projects')||path.startsWith('/p/')||path==='/atlas'},
 {to:'/review',label:'Review',Icon:Layers,match:(path:string)=>path.startsWith('/review')||path.startsWith('/cards')},
 {to:'/calendar',label:'Calendar',Icon:CalendarDays,match:(path:string)=>path.startsWith('/calendar')||path.startsWith('/tasks')},
 {to:'/insights',label:'Progress',Icon:ChartColumn,match:(path:string)=>path.startsWith('/insights')||path.startsWith('/log')},
] as const;

function SessionRow(){
 const {entry,refresh}=useActiveFocus(),home=useHome(),now=useNow(),navigate=useNavigate();
 const [busy,setBusy]=useState(false);
 if(!entry)return null;
 const word=focusWord(entry),clock=focusClock(entry,now);
 const project=home.data?.projects.find(item=>item.id===entry.projectId);
 const subject=kitSubject(project?.subject.name??'');
 const toggle=async()=>{
  if(busy)return;setBusy(true);
  try{
   const study=getStudyApi(),fresh=await study.activeStudyEntry();
   if(fresh?.id===entry.id){if(fresh.status==='paused')await study.resumeStudyEntry(fresh.id,fresh.version);else await study.pauseStudyEntry(fresh.id,fresh.version);}
  }finally{setBusy(false);refresh();announceFocusChange();}
 };
 return <div className="v7-session-row" data-word={word}>
  <button type="button" className="v7-session-open" onClick={()=>navigate('/focus')} aria-label={'Open focus: '+entry.intent+', '+word+', '+clock.label+(clock.mode==='remaining'?' left':' focused')}>
   <span className={'v7-session-dot '+subjectClass(subject)} aria-hidden="true"/>
   <span className="v7-session-title">{entry.intent}</span>
   <span className="v7-session-word">{word}</span>
   <span className="v7-session-time">{clock.label}</span>
  </button>
  <button type="button" className="v7-session-toggle" disabled={busy} onClick={()=>{void toggle();}}
   aria-label={entry.status==='paused'?'Resume focus':'Pause focus'}>{entry.status==='paused'?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>}</button>
 </div>;
}

const openSearch=()=>window.dispatchEvent(new CustomEvent('v7:search'));
/** F. Capture: a tap opens the sheet (a block on Calendar, a thought during a session); a 350 ms press offers the four types. */
function Capture(){
 const [mode,setMode]=useState<'closed'|'sheet'|'picker'>('closed'),location=useLocation();
 const timer=useRef<number|null>(null),long=useRef(false);
 const down=()=>{long.current=false;timer.current=window.setTimeout(()=>{long.current=true;setMode('picker');},350);};
 const up=()=>{if(timer.current)window.clearTimeout(timer.current);timer.current=null;};
 const onCalendar=location.pathname.startsWith('/calendar');
 return <>
  <button type="button" className="v7-capture" aria-label="Capture" title="Capture" aria-haspopup="dialog"
   onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
   onClick={()=>{if(long.current){long.current=false;return;}setMode('sheet');}}
   onKeyDown={event=>{if(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey)){event.preventDefault();setMode('picker');}}}><Plus aria-hidden="true"/></button>
  <Suspense fallback={null}>{mode!=='closed'&&<CaptureSheet key={mode} open onClose={()=>setMode('closed')} picker={mode==='picker'} initialKind={onCalendar&&mode==='sheet'?'block':null}/>}</Suspense>
 </>;
}

/** Wraps every v7 route except the kit. Immersive screens keep the navigation landmark, hidden until focused. */
export default function V7Shell({children,immersive=false,capture=true}:{children:ReactNode;immersive?:boolean;capture?:boolean}){
 const location=useLocation(),home=useHome(),{entry}=useActiveFocus(),[searching,setSearching]=useState(false);
 useEffect(()=>{const open=()=>setSearching(true);window.addEventListener('v7:search',open);return()=>window.removeEventListener('v7:search',open);},[]);
 const due=home.data?.due??0,active=Math.max(0,tabs.findIndex(tab=>tab.match(location.pathname)));
 return <div className="v7-shell" data-immersive={immersive?'true':'false'} data-session={entry?'true':'false'}>
  {children}
  {!immersive&&capture&&<Capture/>}
  <Suspense fallback={null}>{searching&&<SearchSheet open onClose={()=>setSearching(false)}/>}</Suspense>
  <div className="v7-dock">
   {!immersive&&<SessionRow/>}
   <nav aria-label="Main navigation" className="v7-tabbar" style={{'--v7-tab-index':active} as CSSProperties}>
    <span className="v7-tab-pill" aria-hidden="true"/>
    {tabs.map(({to,label,Icon},index)=><Link key={label} to={to} className="v7-tab" aria-current={index===active?'page':undefined}>
     <span className="v7-tab-icon"><Icon aria-hidden="true"/>{label==='Review'&&due>0&&<span className="v7-tab-pip" aria-label={due+' cards due'}>{due>99?'99+':due}</span>}</span>
     <span>{label}</span>
    </Link>)}
   </nav>
  </div>
 </div>;
}

/** A. Hub header: date (Today only) and page actions, then the hub title in Display. */
export function HubHeader({title,date,pending=0,settings=false,children}:{title:string;date?:string;pending?:number;settings?:boolean;children?:ReactNode}){
 return <header className="v7-hub-header">
  <div className="v7-hub-row">
   {date?<p className="v7-hub-date"><span className="v7-hub-mark" aria-hidden="true">ℓ</span>{date}</p>:<span/>}
   <nav aria-label="Page actions" className="v7-page-actions">
    <button type="button" aria-label="Search" title="Search" aria-haspopup="dialog" onClick={openSearch}><Search aria-hidden="true"/></button>
    <Link to="/proposals" aria-label={'Inbox'+(pending?', '+pending+' pending':'')} title="Inbox"><Inbox aria-hidden="true"/>{pending>0&&<span className="v7-count-badge" aria-hidden="true">{pending>99?'99+':pending}</span>}</Link>
    {settings&&<Link to="/settings" aria-label="Settings" title="Settings"><Settings aria-hidden="true"/></Link>}
   </nav>
  </div>
  <h1 className="v7-hub-title">{title}</h1>
  {children}
 </header>;
}
/** B. Detail header: a sticky glass bar with Back, a short title and one action. */
export function DetailHeader({title,back,action}:{title:string;back?:string;action?:ReactNode}){
 const navigate=useNavigate(),location=useLocation();
 return <header className="v7-detail-header">
  <button type="button" className="v7-icon-button" aria-label="Back" onClick={()=>{if(location.key!=='default')navigate(-1);else navigate(back??'/');}}><ChevronLeft aria-hidden="true"/></button>
  <p className="v7-detail-title" aria-hidden="true">{title}</p>
  <nav aria-label="Page actions" className="v7-page-actions">{action??<button type="button" aria-label="Search" title="Search" aria-haspopup="dialog" onClick={openSearch}><Search aria-hidden="true"/></button>}</nav>
 </header>;
}
/** C. Immersive header: leave on the left, progress in the centre, more on the right. */
export function ImmersiveHeader({leave,center,more}:{leave:ReactNode;center:ReactNode;more?:ReactNode}){
 return <header className="v7-immersive-header">
  {leave}<div className="v7-immersive-center">{center}</div>
  <nav aria-label="Page actions" className="v7-page-actions">{more??<button type="button" className="v7-icon-button" aria-label="More" disabled><MoreHorizontal aria-hidden="true"/></button>}</nav>
 </header>;
}
