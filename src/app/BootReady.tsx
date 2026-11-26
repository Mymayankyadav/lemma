import {useEffect} from 'react';
import {surfaceBetaEnabled} from './surfaceBeta';

/** Reveal the first live shell or a recoverable boot state behind the HTML splash. */
export default function BootReady(){
 useEffect(()=>{
  const splash=document.querySelector<HTMLElement>('.lemma-splash');
  if(!splash)return;
  if(!surfaceBetaEnabled()){splash.remove();return;}
  splash.dataset.ready='true';
  const remove=()=>splash.remove();
  splash.addEventListener('transitionend',remove,{once:true});
  const timer=window.setTimeout(remove,250);
  return ()=>{splash.removeEventListener('transitionend',remove);window.clearTimeout(timer);};
 },[]);
 return null;
}
