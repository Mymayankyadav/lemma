import {useLayoutEffect,useRef,type RefObject} from 'react';
import {isImmersiveWorkspace} from './routeKinds';

const primaryPaths=new Set(['/','/projects','/review','/calendar','/insights']);
function routeRole(from:string,to:string,navigation:string){
 if(isImmersiveWorkspace(to))return 'immersive';
 if(isImmersiveWorkspace(from))return 'immersive-exit';
 if(primaryPaths.has(from)&&primaryPaths.has(to))return 'tab';
 return navigation==='POP'?'pop':'push';
}

/** Preserve the reading position of an individual history entry, including when its content arrives late. */
export function useRoutePresentation(shell:RefObject<HTMLDivElement|null>,path:string,key:string,navigation:string,beta:boolean){
 const positions=useRef(new Map<string,number>());
 const previous=useRef<{path:string;motion?:ReturnType<typeof routeRole>;alternate:boolean;travel?:'back'|'forward'}>({path,alternate:false});
 const changed=previous.current.path!==path;
 const motion=beta?(changed?routeRole(previous.current.path,path,navigation):previous.current.motion):undefined;
 // Alternate animation names for reused screens without measuring the committed page.
 const alternate=changed?!previous.current.alternate:previous.current.alternate;
 const travel=changed?(navigation==='POP'?'back':'forward'):previous.current.travel;
 const scrollTop=useRef(0);
 useLayoutEffect(()=>{
  const prior=history.scrollRestoration;
  history.scrollRestoration='manual';
  return ()=>{history.scrollRestoration=prior;};
 },[]);
 useLayoutEffect(()=>{
  const root=shell.current;
  if(!root)return;
  previous.current={path,motion,alternate,travel};
  const saved=navigation==='POP'?positions.current.get(key):undefined;
  const target=saved??(changed?0:undefined);
  let restoring=target!==undefined&&target>0;
  let observer:ResizeObserver|undefined;
  const stop=()=>{restoring=false;observer?.disconnect();};
  const restore=()=>{
   if(target===undefined)return;
   if(target===0){
    if(scrollTop.current!==0)window.scrollTo({top:0,behavior:'instant'});
   }else{
    if(target>document.documentElement.scrollHeight-window.innerHeight+1)return;
    window.scrollTo({top:target,behavior:'instant'});
   }
   scrollTop.current=target;
   stop();
  };
  if(restoring&&typeof ResizeObserver!=='undefined'){
   observer=new ResizeObserver(restore);
   observer.observe(root);
  }
  restore();
  const store=()=>{
   if(restoring)return;
   const entries=positions.current;
   entries.set(key,scrollTop.current);
   if(entries.size>64)entries.delete(entries.keys().next().value!);
  };
  const remember=()=>{scrollTop.current=window.scrollY;store();};
  store();
  window.addEventListener('scroll',remember,{passive:true});
  const release=['pointerdown','wheel','keydown'] as const;
  if(restoring)for(const event of release)window.addEventListener(event,stop,{passive:true,capture:true});
  return ()=>{
   stop();
   window.removeEventListener('scroll',remember);
   for(const event of release)window.removeEventListener(event,stop,true);
  };
 },[shell,key,path,navigation,motion,alternate,travel]);
 return {motion,alternate,travel};
}
