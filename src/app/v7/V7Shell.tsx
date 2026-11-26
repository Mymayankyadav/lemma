import {afterPaintOnIdle,createLazyModule} from '../lazyModule';
import BootReady from '../BootReady';
import {useSurfaceBeta} from '../surfaceBeta';
import LazyOverlay from './LazyOverlay';
import RoutePending,{updatePendingTab} from './RoutePending';
import {useRouteIntent} from './routeIntent';
import {dismissTopLayer,hasOpenLayer,restoreLayerFocus,topLayerOwnsHistory} from '../../ui/v7/layers';
import {Fragment,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode,type RefObject} from 'react';
import {useHapticsSetting} from '../../ui/v7/useHapticsSetting';
import {useDeviceCommands} from '../../platform/useDeviceCommands';
import {Link,UNSAFE_DataRouterContext,useBlocker,useLocation,useNavigate,useNavigationType} from 'react-router';
import {clearToasts} from '../../ui/Toast';
import {CalendarDays,ChartColumn,House,Pause,Play,Plus,Route,Search,Settings} from 'lucide-react';
import {MEANING_ICON} from '../../ui/v7/meanings';
import {useHome} from '../../data/hooks';
import {getStudyApi} from '../../data/study';
import type {StudyEntryRecord} from '../../data/study/contract';
import {SubjectMark,subjectClass} from '../../ui/v7/Subject';
import {kitSubject} from '../../features/atlas/v7/model';
import {announceFocusChange,focusClock,focusWord,useActiveFocus,useFocusChangeListener,useNow} from './focus';
import {useRoutePresentation} from './useRoutePresentation';
import {useRouteLinkFocus} from './useRouteLinkFocus';
import {Button,Sheet} from '../../ui/v7/components';
import {Dock} from '../../ui/v7/Dock';
import OfflineBanner from '../OfflineBanner';
import {EllMark} from '../../ui/v7/marks';
import {useMinWidth} from './useMinWidth';
import {openSearch} from './PageHeaders';
import {useSubjectColours} from './subjectColours';
import {useSettings} from '../../data/hooks';
import {applyReduceEffects} from '../../ui/v7/effects';
import type {SearchItem,SearchSnapshot} from './searchModel';
import {needsWelcome} from '../../features/sign-in/v7/welcomeRule';
import {rememberRoomItem} from '../../ui/v7/room';
import {isFlagOn} from '../../flags';
const captureModule=createLazyModule(()=>import('./CaptureSheet'));
const searchModule=createLazyModule(()=>import('./SearchSheet'));

/** PLAN §6.1: floating tab bar, session row, capture button and the three header kinds. */
export const tabs=[
 {to:'/',label:'Today',Icon:House,match:(path:string)=>path==='/'},
 {to:'/projects',label:'Paths',Icon:Route,match:(path:string)=>path.startsWith('/projects')||path.startsWith('/p/')||path.startsWith('/s/')||path==='/atlas'||path.startsWith('/cards')},
 {to:'/review',label:'Review',Icon:MEANING_ICON.review,match:(path:string)=>path.startsWith('/review')||path.startsWith('/practice')},
 {to:'/calendar',label:'Calendar',Icon:CalendarDays,match:(path:string)=>path.startsWith('/calendar')||path.startsWith('/tasks')},
 {to:'/insights',label:'Progress',Icon:ChartColumn,match:(path:string)=>path.startsWith('/insights')||path.startsWith('/log')},
] as const;

function SessionRow({entry}:{entry:StudyEntryRecord}){
 const home=useHome(),now=useNow(entry.status==='paused'?null:1000),navigate=useNavigate();
 const [busy,setBusy]=useState(false);
 const word=focusWord(entry),clock=focusClock(entry,now);
 const project=home.data?.projects.find(item=>item.id===entry.projectId);
 const subject=kitSubject(project?.subject.name??'');
 const toggle=async()=>{
  if(busy)return;setBusy(true);
  try{
   const study=getStudyApi(),fresh=await study.activeStudyEntry();
   if(fresh?.id===entry.id){if(fresh.status==='paused')await study.resumeStudyEntry(fresh.id,fresh.version);else await study.pauseStudyEntry(fresh.id,fresh.version);}
  }finally{setBusy(false);announceFocusChange();}
 };
 return <div className="v7-session-row" data-word={word}>
  <button type="button" className="v7-session-open" onClick={()=>navigate('/focus')} aria-label={'Open focus: '+entry.intent+', '+word+', '+clock.label+(clock.mode==='remaining'?' left':' focused')}>
   <span className={'v7-session-dot '+subjectClass(subject)} aria-hidden="true"><SubjectMark subject={subject}/></span>
   <span className="v7-session-title">{entry.intent}</span>
   <span className="v7-session-word">{word}</span>
   <span className="v7-session-time">{clock.label}</span>
  </button>
  <button type="button" className="v7-session-toggle" disabled={busy} onClick={()=>{void toggle();}}
   aria-label={entry.status==='paused'?'Resume focus':'Pause focus'}>{entry.status==='paused'?<Play aria-hidden="true"/>:<Pause aria-hidden="true"/>}</button>
 </div>;
}

type SearchVisit={key:string;opener:HTMLElement|null;initial?:SearchSnapshot};
/** F. Capture: a tap opens the sheet (a block on Calendar, a thought during a session); a 350 ms press offers the four types. */
function Capture(){
 const [mode,setMode]=useState<'closed'|'sheet'|'picker'>('closed'),location=useLocation();
 const timer=useRef<number|null>(null),long=useRef(false),opener=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const open=()=>{opener.current?.focus({preventScroll:true});setMode('sheet');};window.addEventListener('v7:capture',open);return()=>window.removeEventListener('v7:capture',open);},[]);
 const down=()=>{long.current=false;timer.current=window.setTimeout(()=>{long.current=true;setMode('picker');},350);};
 const up=()=>{if(timer.current)window.clearTimeout(timer.current);timer.current=null;};
 const onCalendar=location.pathname.startsWith('/calendar');
 // On the card library Capture writes a new card (PLAN §6.11).
 const onCards=location.pathname==='/cards';
 // V14 (v7 UX audit r3): Capture sits in the dock row, so it no longer fades on scroll. Fading kept its slot and left
 // the bar lopsided; hiding the slot would make the tabs jump while scrolling.
 // R0 · F13: an error toast belongs to the screen that raised it.
 useEffect(()=>clearToasts(item=>item.tone==='danger'),[location.pathname]);
 return <>
  <button ref={opener} type="button" className="v7-capture" aria-label="Capture" title="Capture" aria-haspopup="dialog"
   onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
   onClick={()=>{if(long.current){long.current=false;return;}if(onCards){window.dispatchEvent(new Event('v7:new-card'));return;}setMode('sheet');}}
   onKeyDown={event=>{if(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey)){event.preventDefault();setMode('picker');}}}><Plus aria-hidden="true"/>
   {/* N252: shown only as the iPad's wide rail row (ipad.css). */}
   <span className="v7-capture-label" aria-hidden="true">Capture</span></button>
  {mode!=='closed'&&<LazyOverlay key={mode} title="Capture" onClose={()=>setMode('closed')} source={captureModule} returnTarget={()=>opener.current}
   bodyProps={{onClose:()=>setMode('closed'),picker:mode==='picker',initialKind:onCalendar&&mode==='sheet'?'block':null}}/>}
 </>;
}

/** Keep the single-row dock when all names and adjacent controls fit. */
function useTabLabelsFit(ref:RefObject<HTMLElement|null>,wide:boolean,enabled:boolean,hasSession:boolean,capture:boolean):boolean{
 const [fit,setFit]=useState(true);
 useLayoutEffect(()=>{
  const nav=ref.current,row=nav?.parentElement;
  if(!nav||!row||wide){setFit(true);return;}
  const labels=[...nav.querySelectorAll<HTMLElement>('.v7-tab-label')];
  const measure=document.createRange();
  const check=()=>{
   // Measure the full-label footprint even in the compact layout.
   const dock=row.parentElement;
   if(!dock)return;
   const dockStyle=getComputedStyle(dock);
   const space=(token:string)=>parseFloat(dockStyle.getPropertyValue('--v7-space-'+token));
   const controls=(hasSession?44:0)+(capture?48:0);
   const width=Math.min(window.innerWidth-2*space('3'),parseFloat(dockStyle.maxWidth));
   const gutters=parseFloat(dockStyle.borderLeftWidth)+parseFloat(dockStyle.borderRightWidth)
    +2*space('1')+2*space('2');
   const slot=(width-controls-gutters)/labels.length;
   setFit(labels.every(label=>{
    measure.selectNodeContents(label);
    return [...measure.getClientRects()].reduce((width,rect)=>width+rect.width,0)<=slot-4;
   }));
  };
  check();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(check);
  observer?.observe(row);
  labels.forEach(label=>observer?.observe(label));
  window.addEventListener('resize',check);
  let active=true;
  void document.fonts?.ready.then(()=>{if(active)check();}).catch(()=>undefined);
  return()=>{active=false;observer?.disconnect();window.removeEventListener('resize',check);};
 },[ref,wide,enabled,hasSession,capture]);
 return fit;
}

/** Wraps every v7 route except the kit. Immersive screens provide their own navigation and actions. */
export default function V7Shell({children,immersive=false,capture=true}:{children:ReactNode;immersive?:boolean;capture?:boolean}){
 const location=useLocation(),navigate=useNavigate(),navigation=useNavigationType(),home=useHome(),{entry}=useActiveFocus();
 const dataRouter=useContext(UNSAFE_DataRouterContext);
 const beta=useSurfaceBeta(),intent=useRouteIntent(beta),warm=useRef(intent.warm);
 warm.current=intent.warm;
 useEffect(()=>afterPaintOnIdle(()=>{
  if(navigator.onLine===false)return;
  captureModule.warm();searchModule.warm();
 }),[]);
 useEffect(()=>{if(beta)return afterPaintOnIdle(()=>{for(const {to} of tabs)warm.current(to);});},[beta]);
 useFocusChangeListener();
 const shell=useRef<HTMLDivElement>(null),routeTrigger=useRef<HTMLAnchorElement|null>(null);
 const presentation=useRoutePresentation(shell,location.pathname,location.key,navigation,beta);
 const {announcement,remember,prepareKeyboardNavigation}=useRouteLinkFocus(shell,location.pathname,location.key,navigation,beta);
 const [searching,setSearching]=useState<SearchVisit|null>(null),[shortcuts,setShortcuts]=useState(false);
 const key=location.pathname+location.search+'\n'+location.key;
 const searchBack=useRef(new Map<string,SearchVisit>()),previousKey=useRef(key);
 const wide=useMinWidth(700);
 const tabbar=useRef<HTMLElement>(null),labelsFit=useTabLabelsFit(tabbar,wide,!immersive,Boolean(entry),capture);
 const indicateTab=useCallback((path:string)=>{
  if(!beta)return;
  updatePendingTab(tabbar.current,tabs.findIndex(tab=>tab.to===path),tabs.some(tab=>tab.to===location.pathname)&&path!==location.pathname);
 },[beta,location.pathname]);
 useLayoutEffect(()=>{updatePendingTab(tabbar.current,-1,false);},[beta,location.key]);
 // A subject colour chosen in Settings redraws every screen in that colour (PLAN §6.14).
 const colours=useSubjectColours();
 // PLAN §6.15: a new owner (no paths, first run neither finished nor skipped) starts on the first-run steps, once.
 const settings=useSettings();
 useLayoutEffect(()=>{
  if(!isFlagOn('v7Room'))return;
  const path=location.pathname,to=path+location.search;
  if(/^\/p\/[^/]+(?:\/cp\/[^/]+)?\/tutor$/.test(path))return;
  const group=path.startsWith('/p/')?(path.includes('/cp/')?'Checkpoints':'Paths'):path.startsWith('/cards/')?'Cards':path.startsWith('/s/')?'Sessions':null;
  if(!group)return;
  const root=shell.current;
  if(!root)return;
  let lastTitle='';
  const record=()=>{
   const main=root.querySelector('main'),title=main?.querySelector('h1')?.textContent?.trim();
   if(!title||['Path','Card','Checkpoint','Loading…'].includes(title))return;
   const project=home.data?.projects.find(item=>path==='/p/'+item.slug);
   const next=project?.title??title;
   if(next===lastTitle)return;
   lastTitle=next;
   rememberRoomItem({id:to,group,title:next,to});
  };
  record();const observer=new MutationObserver(record);observer.observe(root,{childList:true,subtree:true});
  return()=>observer.disconnect();
 },[location.pathname,location.search,home.data]);
 // A1: Reduce effects follows the account (set on another device) once settings load; the device copy applied at start.
 const reduceEffects=settings.data?.ui?.reduceEffects;
 // AW6: haptic() follows Lemma's Haptics switch everywhere in v7.
 useHapticsSetting();
 useDeviceCommands();
 useEffect(()=>{if(typeof reduceEffects==='boolean')applyReduceEffects(reduceEffects);},[reduceEffects]);
 useEffect(()=>{
  if(location.pathname!=='/'||!settings.data||!home.data||isFlagOn('todayNextStep'))return;
  if(needsWelcome(settings.data.ui,home.data.projects.filter(project=>!project.system).length))navigate('/welcome',{replace:true});
 },[location.pathname,settings.data,home.data,navigate]);
 // Restore only on return to the source history entry, never on an ordinary link to the same URL.
 useLayoutEffect(()=>{
  if(previousKey.current===key)return;
  previousKey.current=key;
  const visit=navigation==='POP'?searchBack.current.get(key):undefined;
  searchBack.current.delete(key);
  setSearching(visit??null);
 },[key,navigation]);
 useEffect(()=>{
  const open=(event:Event)=>{
   const opener=(event as CustomEvent<HTMLElement>).detail??document.activeElement;
   setSearching(current=>current?.key===key?current:{key,opener:opener instanceof HTMLElement?opener:null});
  };
  window.addEventListener('v7:search',open);return()=>window.removeEventListener('v7:search',open);
 },[key]);
 function searchOpener(){
  const opener=searching?.opener;
  if(opener?.isConnected&&opener!==document.body&&opener.getClientRects().length>0)return opener;
  return [...document.querySelectorAll<HTMLElement>('[data-v7-search-opener]')].find(candidate=>candidate.getClientRects().length>0)??null;
 }
 useEffect(()=>{
  if(!location.state?.v7SearchFocus||location.state.v7SearchDestination||navigation==='POP')return;
  const root=shell.current;
  if(!root)return;
  let frame=0;
  const observer=new MutationObserver(schedule);
  function focus(){
   if(!root||hasOpenLayer())return;
   const heading=root.querySelector<HTMLElement>('main h1');
   if(!heading||heading.getClientRects().length===0)return;
   observer.disconnect();
   restoreLayerFocus(heading);
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(focus);}
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['open','inert']});
  schedule();
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[location.key,location.state,navigation]);
 function pickSearchItem(item:SearchItem,initial:SearchSnapshot){
  if(!searching)return;
  const back=searchBack.current;
  back.delete(key);
  back.set(key,{...searching,initial});
  if(back.size>8){const oldest=back.keys().next().value;if(oldest)back.delete(oldest);}
  setSearching(null);
  intent.warm(item.to);
  navigate(item.to,{state:{v7SearchFocus:true,v7SearchDestination:item.group==='Settings'}});
 }
 // A route outside the five destinations (Inbox, Settings) highlights none of them; the Library link shows where you are.
 const due=home.data?.due??0,active=tabs.findIndex(tab=>tab.match(location.pathname));
 useEffect(()=>{
  const keys=(event:KeyboardEvent)=>{
   if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable],dialog'))return;
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();window.dispatchEvent(new CustomEvent('v7:search'));return;}
   if(!wide)return;
   if(event.ctrlKey||event.metaKey||event.altKey)return;
   if(event.key==='?'){event.preventDefault();setShortcuts(true);}
   else if(!immersive&&/^[1-5]$/.test(event.key)){
    event.preventDefault();prepareKeyboardNavigation();const {to}=tabs[Number(event.key)-1];indicateTab(to);warm.current(to);navigate(to);
   }
   else if(!immersive&&event.key.toLowerCase()==='n'&&capture){event.preventDefault();window.dispatchEvent(new Event('v7:capture'));}
   else if(!immersive&&event.key.toLowerCase()==='f'){event.preventDefault();navigate(entry?'/focus':'/?quick=1');}
  };
  window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
 },[wide,immersive,capture,navigate,entry,prepareKeyboardNavigation,indicateTab]);
 return <div ref={shell} className="v7-shell" data-surface-role={immersive?'S7':'S0'} data-immersive={immersive?'true':'false'} onPointerOverCapture={event=>{if(event.pointerType==='mouse')intent.warmLink(event.target,false);}}
  onPointerDownCapture={event=>{if(event.button===0)intent.warmLink(event.target);}}
  onFocusCapture={event=>intent.warmLink(event.target)} onClickCapture={event=>{
   const link=remember(event);
   const previous=routeTrigger.current;
   if(previous)delete previous.dataset.routeDestination;
   routeTrigger.current=link??null;
   if(link?.classList.contains('v7-tab'))indicateTab(link.hash.slice(1));
   else if(link && dataRouter && link.hash!==window.location.hash){
    // The activated control can acknowledge the click before loading or mounting the destination.
    link.dataset.routeDestination='';
    requestAnimationFrame(()=>{
     if(dataRouter.router.state.navigation.state==='idle'&&routeTrigger.current===link){
      delete link.dataset.routeDestination;routeTrigger.current=null;
     }
    });
   }
  }}
  data-session={entry?'true':'false'} data-route-motion={presentation.motion}
  data-route-alternate={presentation.alternate&&beta?'':undefined} data-travel={presentation.travel}>
  <BootReady/>
  <OfflineBanner/>
  {beta&&<div ref={announcement} className="v7-sr-only" aria-live="polite"/>}
  {dataRouter&&<><LayerBack/>{beta&&<RoutePending shell={shell} trigger={routeTrigger} tabs={tabs}/>}</>}
  <Fragment key={colours}>{children}</Fragment>
  {searching?.key===key&&<LazyOverlay key={key} title="Search" full className="v7-search-dialog"
   onClose={()=>setSearching(null)} returnTarget={searchOpener} source={searchModule}
   bodyProps={{onPick:pickSearchItem,initial:searching.initial}}/>}
  {!immersive&&<Dock className="v7-dock">
   <div className="v7-rail-head"><Link to="/" className="v7-rail-brand" aria-label="Lemma home"><EllMark size={22}/><span>Lemma</span></Link><button type="button" data-v7-search-opener="" onClick={openSearch}><Search aria-hidden="true"/><span>Search</span><kbd>⌘ / Ctrl K</kbd></button></div>
   <div className="v7-dock-row">
   <nav ref={tabbar} aria-label="Main navigation" className="v7-tabbar" data-labels={labelsFit?'all':'selected'} style={{'--v7-tab-index':Math.max(0,active)} as CSSProperties}>
    {active>=0&&<span className="v7-tab-pill" aria-hidden="true"/>}
    {tabs.map(({to,label,Icon},index)=><Link key={label} to={to} className="v7-tab" aria-current={index===active?'page':undefined}>
     <span className="v7-tab-icon"><Icon aria-hidden="true"/>{label==='Review'&&due>0&&<span className="v7-tab-pip" aria-label={due+' cards due'}>{due>99?'99+':due}</span>}</span>
     <span className="v7-tab-label">{label}</span>
    </Link>)}
   </nav>
   {entry&&<SessionRow entry={entry}/>}
   {capture&&<Capture/>}
   </div>
   <nav className="v7-rail-library" aria-label="Library"><p className="v7-eyebrow">Library</p>
    {([['/proposals','Inbox'+(home.data?.pendingProposals?' · '+home.data.pendingProposals:'')],['/cards','Cards'],['/atlas','Atlas'],['/tasks','Tasks'],['/practice','Practice'],['/log','Time log']] as const).map(([to,label])=><Link key={to} to={to} aria-current={location.pathname===to||location.pathname.startsWith(to+'/')?'page':undefined}>{label}</Link>)}
   </nav>
   <Link className="v7-rail-settings" to="/settings"><Settings aria-hidden="true"/><span>Settings</span></Link>
  </Dock>}
  <Sheet open={shortcuts} onClose={()=>setShortcuts(false)} title="Keyboard shortcuts" footer={<Button variant="primary" onClick={()=>setShortcuts(false)}>Done</Button>}>
   <dl className="v7-shortcuts">{[['⌘ / Ctrl K','Search'],['N','Capture'],['1–5','Switch destinations'],['F','Start or return to focus'],['Space','Pause focus / reveal answer'],['1–4','Grade an answer'],['U','Undo last answer'],['Esc','Close the top layer'],['?','Show shortcuts']].map(([key,label])=><div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
  </Sheet>
 </div>;
}

function LayerBack(){
 const blocker=useBlocker(({historyAction,currentLocation,nextLocation})=>{
  if(historyAction!=='POP'||!hasOpenLayer())return false;
  const leaving=currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search;
  return !leaving||!topLayerOwnsHistory();
 });
 useEffect(()=>{
  if(blocker.state!=='blocked')return;
  blocker.reset();
  dismissTopLayer('back');
 },[blocker]);
 return null;
}

export {HubHeader,DetailHeader,ImmersiveHeader} from './PageHeaders';
