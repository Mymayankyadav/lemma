import {useEffect,useLayoutEffect,useState,type RefObject} from 'react';
import {useLocation,useNavigation} from 'react-router';
import {durations} from '../../ui/v7/motion';
import {markLoadingSurface,RouteSkeleton} from '../RouteError';

export function updatePendingTab(bar:HTMLElement|null|undefined,index:number,changing:boolean){
 if(!bar)return;
 const intended=changing?index:-1;
 bar.toggleAttribute('data-tab-pending',intended>=0);
 if(intended>=0)bar.style.setProperty('--v7-pending-tab-index',String(intended));
 else bar.style.removeProperty('--v7-pending-tab-index');
 bar.querySelectorAll('.v7-tab').forEach((link,position)=>link.toggleAttribute('data-tab-destination',position===intended));
}

export default function RoutePending({shell,tabs}:{shell:RefObject<HTMLDivElement|null>;tabs:readonly {to:string}[]}){
 const navigation=useNavigation(),{pathname}=useLocation();
 const path=navigation.location?.pathname,key=navigation.location?.key;
 useLayoutEffect(()=>{
  const bar=shell.current?.querySelector<HTMLElement>('.v7-tabbar');
  const index=tabs.findIndex(tab=>tab.to===path);
  if(!bar||index<0||path===pathname||!tabs.some(tab=>tab.to===pathname))return;
  updatePendingTab(bar,index,true);
  return()=>updatePendingTab(bar,-1,false);
 },[shell,tabs,path,pathname]);
 const [skeleton,setSkeleton]=useState<string|null>(null),[progress,setProgress]=useState<string|null>(null);
 useEffect(()=>{
  if(!key||!path||path===pathname)return;
  const progressTimer=window.setTimeout(()=>setProgress(key),durations.progressDelay*1000);
  const skeletonTimer=window.setTimeout(()=>setSkeleton(key),durations.skeletonDelay*1000);
  return ()=>{
   window.clearTimeout(progressTimer);window.clearTimeout(skeletonTimer);
   setProgress(null);setSkeleton(null);
  };
 },[key,path,pathname]);
 if(!key||!path||path===pathname)return null;
 return <>
  {progress===key&&<div ref={markLoadingSurface} className="lemma-route-progress" aria-hidden="true" data-loading-surface="route-progress"/>}
  {skeleton===key&&<div ref={markLoadingSurface} className="lemma-route-preview" role="status" data-loading-surface="route-skeleton">
   <span className="v7-sr-only">Opening screen…</span><RouteSkeleton path={path}/>
  </div>}
 </>;
}
