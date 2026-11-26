import {useEffect,useLayoutEffect,useState} from 'react';
import {durations} from '../ui/v7/motion';
import {Link,useLocation,useNavigate} from 'react-router';
import {v7ScreenFor} from './v7Kit';
import BootReady from './BootReady';
import {useSurfaceBeta} from './surfaceBeta';
import {isFlagOn} from '../flags';
import {resetFailedLazyComponents} from './lazyModule';

export default function RouteError(){
 const location=useLocation(),navigate=useNavigate();
 // Once the boundary shows the error, Retry and either form of Back can remount the failed chunks.
 useLayoutEffect(resetFailedLazyComponents);
 return <RouteErrorScreen onRetry={()=>{void navigate(location.pathname+location.search+location.hash,{replace:true,state:location.state});}}/>;
}

export function RouteErrorScreen({onRetry,busy=false}:{onRetry:()=>void;busy?:boolean}){
 const v7=isFlagOn('v7Shell');
 return <main id="main-content" className={v7?'v7-page lemma-route-error':'lemma-route-error'} role="alert">
  <BootReady/>
  <h1>Couldn’t open this screen</h1>
  <p>Try opening this screen again.</p>
  <div>
   <button type="button" className={v7?'v7-button v7-primary':'lit min-h-11 px-4'} disabled={busy} aria-busy={busy} onClick={onRetry}><span>Retry</span></button>
   <Link to="/">Back to Today</Link>
  </div>
 </main>;
}

export function RouteSkeleton({path}:{path:string}){
 const screen=v7ScreenFor(path);
 const shape=screen==='calendar'?'calendar':screen==='atlas'?'atlas':
  screen==='paths'||screen==='tasks'||screen==='cards'||screen==='inbox'?'list':'page';
 return <div className="lemma-route-skeleton" data-shape={shape} aria-hidden="true">
  <span/><span/><span/><span/>
 </div>;
}

export function markLoadingSurface(element:HTMLElement|null){
 if(element&&!element.dataset.shownAt)element.dataset.shownAt=String(performance.now());
}

export function RouteFallback(){
 const {pathname}=useLocation(),preference=useSurfaceBeta(),v7=isFlagOn('v7Shell');
 const beta=v7&&preference;
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  if(!beta)return;
  const timer=window.setTimeout(()=>setVisible(true),durations.skeletonDelay*1000);
  return()=>window.clearTimeout(timer);
 },[beta]);
 if(!beta)return <main className={v7?'v7-page lemma-route-fallback':'lemma-route-fallback'} role="status" data-loading-surface="route-generic"><h1>Loading screen…</h1></main>;
 return <main className="v7-page lemma-route-fallback" aria-label="Opening screen" aria-busy="true">
  {visible&&<div ref={markLoadingSurface} data-loading-surface="route-skeleton"><RouteSkeleton path={pathname}/></div>}
 </main>;
}
