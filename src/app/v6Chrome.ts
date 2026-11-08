import {useEffect} from 'react';

/** N110 (mockup `--lemma-bottom-chrome`): the fixed bottom navigation and the focus dock
 * publish their measured heights, so the dock sits on the navigation and page content,
 * fixed page actions and scroll targets clear both. */
export function measureV6BottomChrome(root:HTMLElement=document.documentElement){
 const nav=document.querySelector<HTMLElement>('nav[data-ui=main-navigation]');
 const dock=document.querySelector<HTMLElement>('#cr-mobile-dock');
 const height=(node:HTMLElement|null)=>node&&getComputedStyle(node).display!=='none'?node.getBoundingClientRect().height:0;
 const navHeight=height(nav),dockHeight=height(dock);
 root.style.setProperty('--lemma-nav-height',navHeight+'px');
 root.style.setProperty('--lemma-bottom-chrome',(navHeight+dockHeight)+'px');
 return {navHeight,dockHeight};
}

export function useV6BottomChrome(enabled:boolean,pathname:string){
 useEffect(()=>{
  const root=document.documentElement;
  if(!enabled)return;
  let frame=0;
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>measureV6BottomChrome(root));};
  schedule();
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
  const watch=()=>{observer?.disconnect();
   for(const node of document.querySelectorAll('nav[data-ui=main-navigation],#cr-mobile-dock'))observer?.observe(node);};
  watch();
  // The dock mounts and unmounts as focus starts and ends.
  const mutations=typeof MutationObserver==='undefined'?null:new MutationObserver(()=>{watch();schedule();});
  mutations?.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);
  return()=>{
   cancelAnimationFrame(frame);observer?.disconnect();mutations?.disconnect();
   window.removeEventListener('resize',schedule);
   root.style.removeProperty('--lemma-nav-height');root.style.removeProperty('--lemma-bottom-chrome');
  };
 },[enabled,pathname]);
}
