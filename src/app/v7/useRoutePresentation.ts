import {useLayoutEffect,useRef,type RefObject} from 'react';

const primaryPaths=new Set(['/','/projects','/review','/calendar','/insights']);
const immersive=(path:string)=>/^\/(?:focus|pad(?:\/.*)?|review\/run|p\/[^/]+(?:\/cp\/[^/]+)?\/tutor)$/.test(path);
function routeRole(from:string,to:string,navigation:string){
 if(immersive(from)||immersive(to))return 'immersive';
 if(primaryPaths.has(from)&&primaryPaths.has(to))return 'tab';
 return navigation==='POP'?'pop':'push';
}

/** Preserve the reading position of an individual history entry, including when its content arrives late. */
export function useRoutePresentation(shell:RefObject<HTMLDivElement|null>,path:string,key:string,navigation:string){
 const positions=useRef(new Map<string,number>());
 const previousPath=useRef(path);
 useLayoutEffect(()=>{
  const prior=history.scrollRestoration;
  history.scrollRestoration='manual';
  return ()=>{history.scrollRestoration=prior;};
 },[]);
 useLayoutEffect(()=>{
  const root=shell.current;
  if(!root)return;
  const from=previousPath.current,changed=from!==path;
  previousPath.current=path;
  if(changed){
   root.dataset.travel=navigation==='POP'?'back':'forward';
   delete root.dataset.routeMotion;
   // Restart the entrance when React Router reuses the same page element for another path.
   void root.offsetWidth;
   root.dataset.routeMotion=routeRole(from,path,navigation);
  }
  const saved=navigation==='POP'?positions.current.get(key):undefined;
  const target=saved??(changed?0:undefined);
  let restoring=target!==undefined&&target>0;
  let observer:ResizeObserver|undefined;
  const stop=()=>{restoring=false;observer?.disconnect();};
  const restore=()=>{
   if(target===undefined)return;
   if(target>document.documentElement.scrollHeight-window.innerHeight+1)return;
   if(Math.abs(window.scrollY-target)>1)window.scrollTo({top:target,behavior:'instant'});
   stop();
  };
  if(restoring&&typeof ResizeObserver!=='undefined'){
   observer=new ResizeObserver(restore);
   observer.observe(root);
  }
  restore();
  const remember=()=>{
   if(restoring)return;
   const entries=positions.current;
   entries.set(key,window.scrollY);
   if(entries.size>64)entries.delete(entries.keys().next().value!);
  };
  remember();
  window.addEventListener('scroll',remember,{passive:true});
  const release=['pointerdown','wheel','keydown'] as const;
  if(restoring)for(const event of release)window.addEventListener(event,stop,{passive:true,capture:true});
  return ()=>{
   stop();
   window.removeEventListener('scroll',remember);
   for(const event of release)window.removeEventListener(event,stop,true);
  };
 },[shell,key,path,navigation]);
}
