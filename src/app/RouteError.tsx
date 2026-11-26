import {useEffect,useState} from 'react';
import {durations} from '../ui/v7/motion';
import {Link,useLocation,useNavigate} from 'react-router';
import {v7ScreenFor} from './v7Kit';
import BootReady from './BootReady';
import {useSurfaceBeta} from './surfaceBeta';

export default function RouteError(){
 const location=useLocation(),navigate=useNavigate();
 return <RouteErrorScreen onRetry={()=>{void navigate(location.pathname+location.search+location.hash,{replace:true,state:location.state});}}/>;
}

export function RouteErrorScreen({onRetry,busy=false}:{onRetry:()=>void;busy?:boolean}){
 return <main id="main-content" className="v7-page lemma-route-error" role="alert">
  <BootReady/>
  <h1>Couldn’t open this screen</h1>
  <p>Try opening this screen again.</p>
  <div>
   <button type="button" className="v7-button v7-primary" disabled={busy} aria-busy={busy} onClick={onRetry}><span>Retry</span></button>
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
 const {pathname}=useLocation(),beta=useSurfaceBeta();
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  if(!beta)return;
  const timer=window.setTimeout(()=>setVisible(true),durations.skeletonDelay*1000);
  return()=>window.clearTimeout(timer);
 },[beta]);
 if(!beta)return <main className="v7-page lemma-route-fallback" role="status" data-loading-surface="route-generic"><h1>Loading screen…</h1></main>;
 return <main className="v7-page lemma-route-fallback" aria-label="Opening screen" aria-busy="true">
  {visible&&<div ref={markLoadingSurface} data-loading-surface="route-skeleton"><RouteSkeleton path={pathname}/></div>}
 </main>;
}
