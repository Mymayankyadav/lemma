import {useCallback,useLayoutEffect,useRef,type MouseEvent,type RefObject} from 'react';
import {hasOpenLayer,restoreLayerFocus} from '../../ui/v7/layers';
import {routeLink} from './routeIntent';
import {v7ScreenFor,V7_DETAIL_SCREENS} from '../v7Kit';

type Origin={url:string;label:string;link:WeakRef<HTMLAnchorElement>;tab:boolean;keyboard:boolean};
const labelFor=(link:HTMLAnchorElement)=>link.getAttribute('aria-label')??link.textContent?.trim()??'';

export function useRouteLinkFocus(root:RefObject<HTMLDivElement|null>,path:string,key:string,navigation:string,beta:boolean){
 const from=useRef({path,key}),pending=useRef<Origin|null>(null);
 const origins=useRef(new Map<string,Origin>());
 const announcement=useRef<HTMLDivElement>(null);
 const announce=(text:string)=>{if(announcement.current)announcement.current.textContent=text;};
 const prepareKeyboardNavigation=useCallback(()=>{
  if(beta&&document.activeElement instanceof HTMLElement&&document.activeElement.classList.contains('v7-tab'))document.activeElement.blur();
 },[beta]);
 useLayoutEffect(()=>{
  const previous=from.current,origin=pending.current;
  from.current={path,key};pending.current=null;
  if(!beta){origins.current.clear();announce('');return;}
  if(previous.path===path||hasOpenLayer())return;
  announce('');
  if(navigation==='POP'){
   const saved=origins.current.get(key);
   if(!saved||!root.current)return;
   const shell=root.current;
   const restore=()=>{
    if(hasOpenLayer())return false;
    const known=saved.link.deref();
    const link=known?.isConnected?known:[...shell.querySelectorAll<HTMLAnchorElement>('a[href]')]
     .find(candidate=>candidate.hash===saved.url&&labelFor(candidate)===saved.label&&candidate.getClientRects().length>0);
    if(!link?.getClientRects().length)return false;
    restoreLayerFocus(link);
    return true;
   };
   if(restore())return;
   const observer=new MutationObserver(()=>{if(restore())cancel();});
   const timeout=window.setTimeout(cancel,1500);
   function cancel(){
    observer.disconnect();window.clearTimeout(timeout);
    window.removeEventListener('pointerdown',cancel,true);window.removeEventListener('keydown',cancel,true);
   }
   observer.observe(shell,{childList:true,subtree:true});
   window.addEventListener('pointerdown',cancel,true);window.addEventListener('keydown',cancel,true);
   return cancel;
  }
  if(!origin||origin.url.split(/[?]/,1)[0]!=='#'+path)return;
  const entries=origins.current;
  entries.set(previous.key,origin);
  if(entries.size>24)entries.delete(entries.keys().next().value!);
  const screen=v7ScreenFor(path);
  const detail=screen&&V7_DETAIL_SCREENS.has(screen);
  const trigger=origin.link.deref();
  if((detail||origin.tab&&origin.keyboard)&&trigger===document.activeElement)trigger?.blur();
  else if(origin.tab&&!origin.keyboard)announce(origin.label);
 },[root,path,key,navigation,beta]);
 return {
  announcement,
  remember(event:MouseEvent){
   if(!beta||event.button!==0||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
   const link=routeLink(event.target);
   if(link)pending.current={url:link.hash,label:labelFor(link),link:new WeakRef(link),tab:link.classList.contains('v7-tab'),keyboard:event.detail===0};
   return link;
  },
  prepareKeyboardNavigation,
 };
}
