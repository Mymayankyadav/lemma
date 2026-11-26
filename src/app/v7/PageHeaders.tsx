import {Children,isValidElement,useEffect,useRef,useState,type MouseEvent,type ReactNode,type RefObject} from 'react';
import {Link,useLocation} from 'react-router';
import {ChevronLeft,Inbox,Search,Settings} from 'lucide-react';
import {useHome} from '../../data/hooks';
import {isFlagOn} from '../../flags';
import {useDevicePrefValue} from '../../platform/useDevicePref';
import {IconButton} from '../../ui/v7/components';
import {EllMark} from '../../ui/v7/marks';
import {SyncMark} from '../../ui/v7/SyncMark';
import {useDetailBack} from './useDetailBack';
import './shellAppearance';

export const openSearch=(event:MouseEvent<HTMLButtonElement>)=>window.dispatchEvent(new CustomEvent('v7:search',{detail:event.currentTarget}));

/** A. Hub header. Today: the date and page actions, then the greeting in Display 44 (the one Display per page). Other hubs: the
 *  title in Title 32 shares the row with the actions, so content starts higher (CD1). The Inbox count shows on every hub;
 *  Settings only on Today (SH4). */
export function HubHeader({title,date,settings=false,display=false,control,titleControl,children,headingRef,titleFollowsTab=true,extraAction}:{title:string;date?:string;settings?:boolean;display?:boolean;
 headingRef?:RefObject<HTMLHeadingElement|null>;
 /** N161: one compact control beside the title (Calendar's view menu on a phone). */
 control?:ReactNode;titleControl?:ReactNode;children?:ReactNode;titleFollowsTab?:boolean;extraAction?:ReactNode}){
 const findSelected=(nodes:ReactNode):string|undefined=>{
  for(const node of Children.toArray(nodes)){
   if(!isValidElement<{children?:ReactNode;'aria-current'?:string}>(node))continue;
   if(node.props['aria-current']==='page'&&typeof node.props.children==='string')return node.props.children;
   const nested=findSelected(node.props.children);if(nested)return nested;
  }
 };
 if(isFlagOn('v7Room')&&!display&&titleFollowsTab)title=findSelected(children)??title;
 const pending=useHome().data?.pendingProposals??0;
 // N157 · AW3: the app's daily check found a newer APK (only the Android app writes this).
 const update=useDevicePrefValue<number|null>('updateAvailable',null);
 // CD1: on hubs other than Today the title row is a sticky solid bar whose Title 32 shrinks to Subhead 20 once the page
 // scrolls, so content gets the room back (the tabs and controls below scroll away).
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{
  if(display)return;
  const onScroll=()=>setCollapsed(previous=>previous?window.scrollY>=8:window.scrollY>32);
  onScroll();window.addEventListener('scroll',onScroll,{passive:true});return()=>window.removeEventListener('scroll',onScroll);
 },[display]);
 const actions=<nav aria-label="Page actions" className="v7-page-actions">
    <button type="button" aria-label="Search" title="Search" aria-haspopup="dialog" data-v7-search-opener="" onClick={openSearch}><Search aria-hidden="true"/></button>
    <Link to="/proposals" aria-label={'Inbox'+(pending?', '+pending+' pending':'')} title="Inbox"><Inbox aria-hidden="true"/>{pending>0&&<span className="v7-count-badge" aria-hidden="true">{pending>99?'99+':pending}</span>}</Link>
    {settings&&<Link to="/settings" aria-label={update!==null?'Settings, a newer version is available':'Settings'} title="Settings"><Settings aria-hidden="true"/>{update!==null&&<span className="v7-update-dot" aria-hidden="true"/>}</Link>}
    {extraAction}
   </nav>;
 if(!display)return <>
  <header data-surface-role="S1" className="v7-hub-bar" data-collapsed={collapsed?'true':'false'}><div className="v7-hub-row"><h1 ref={headingRef} tabIndex={headingRef?-1:undefined} className={titleControl?"v7-sr-only":"v7-hub-title"}><span>{title}</span></h1>{titleControl}{control&&<div className="v7-hub-control">{control}</div>}{actions}</div></header>
  {children&&<div className="v7-hub-extra">{children}</div>}
 </>;
 return <header data-surface-role="S1" className="v7-hub-header" data-display="true">
  <div className="v7-hub-row">
   {date?<p className="v7-hub-date"><SyncMark><span className="v7-hub-mark" aria-hidden="true"><EllMark size={18}/></span></SyncMark><span>{date}</span></p>:<span/>}
   {actions}
  </div>
  <h1 className="v7-hub-title v7-display">{title}</h1>
  {children}
 </header>;
}
/** B. Detail header: a sticky glass bar with Back, a short title and one action. */
export function DetailHeader({title,back,action,extraAction,compact}:{title:string;back?:string;action?:ReactNode;extraAction?:ReactNode;
 /** R2 · F11: shown beside the bar title once the page's large title has scrolled away (an emblem thumbnail, a progress ring). */
 compact?:ReactNode}){
 const goBack=useDetailBack(back),location=useLocation(),ref=useRef<HTMLElement>(null);
 // R1 · F18: the small bar title stays hidden while the page's own large title is on screen, so a title is never shown
 // twice; it appears once the large title scrolls under the bar. Pages without a visible H1 always show it.
 const [pageTitleVisible,setPageTitleVisible]=useState(false);
 useEffect(()=>{
  const header=ref.current,heading=header?.parentElement?.querySelector<HTMLElement>('h1:not(.v7-sr-only)');
  if(!header||!heading||typeof IntersectionObserver==='undefined'){setPageTitleVisible(false);return;}
  let observer:IntersectionObserver|undefined,margin=-1;
  function observe(height:number){
   const rounded=Math.round(height);
   if(rounded===margin)return;
   margin=rounded;observer?.disconnect();
   observer=new IntersectionObserver(([entry])=>setPageTitleVisible(entry.isIntersecting),{rootMargin:'-'+rounded+'px 0px 0px 0px'});
   observer.observe(heading!);
  }
  const size=typeof ResizeObserver==='undefined'?null:new ResizeObserver(([entry])=>{
   observe(entry.borderBoxSize?.[0]?.blockSize??entry.contentRect.height);
  });
  if(size)size.observe(header);
  else observe(56);
  return ()=>{size?.disconnect();observer?.disconnect();};
 },[title,location.pathname,location.search]);
 return <header data-surface-role="S1" className="v7-detail-header" ref={ref} data-title-hidden={pageTitleVisible?'true':undefined}>
  <IconButton label="Back" onClick={goBack}><ChevronLeft aria-hidden="true"/></IconButton>
  <p className="v7-detail-title" aria-hidden="true">{compact&&<span className="v7-detail-compact">{compact}</span>}<span>{title}</span></p>
  <nav aria-label="Page actions" className="v7-page-actions">{action??<button type="button" aria-label="Search" title="Search" aria-haspopup="dialog" data-v7-search-opener="" onClick={openSearch}><Search aria-hidden="true"/></button>}{extraAction}</nav>
 </header>;
}
/** C. Immersive header: leave on the left, progress in the centre, more on the right. */
export function ImmersiveHeader({leave,center,more}:{leave:ReactNode;center:ReactNode;more?:ReactNode}){
 return <header data-surface-role="S1" className="v7-immersive-header">
  {leave}<div className="v7-immersive-center">{center}</div>
  {/* SH3: no disabled, outlined "⋯" placeholder — a screen without a menu keeps an empty 44 px slot. */}
  <nav aria-label="Page actions" className="v7-page-actions">{more??<span className="v7-icon-spacer" aria-hidden="true"/>}</nav>
 </header>;
}
