import {useEffect,useState} from 'react';
import {useLocation,useNavigation} from 'react-router';
import {durations} from '../../ui/v7/motion';
import {markLoadingSurface,RouteSkeleton} from '../RouteError';

export default function RoutePending(){
 const navigation=useNavigation(),{pathname}=useLocation();
 const path=navigation.location?.pathname;
 const [skeleton,setSkeleton]=useState<string|null>(null),[progress,setProgress]=useState<string|null>(null);
 useEffect(()=>{
  if(!path||path===pathname)return;
  const progressTimer=window.setTimeout(()=>setProgress(path),durations.progressDelay*1000);
  const skeletonTimer=window.setTimeout(()=>setSkeleton(path),durations.skeletonDelay*1000);
  return ()=>{
   window.clearTimeout(progressTimer);window.clearTimeout(skeletonTimer);
   setProgress(null);setSkeleton(null);
  };
 },[path,pathname]);
 if(!path||path===pathname)return null;
 return <>
  {progress===path&&<div ref={markLoadingSurface} className="lemma-route-progress" aria-hidden="true" data-loading-surface="route-progress"/>}
  {skeleton===path&&<div ref={markLoadingSurface} className="lemma-route-preview" role="status" data-loading-surface="route-skeleton">
   <span className="v7-sr-only">Opening screen…</span><RouteSkeleton path={path}/>
  </div>}
 </>;
}
