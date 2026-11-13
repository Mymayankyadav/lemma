import {useEffect,type RefObject} from 'react';

/**
 * N161: on a phone the Calendar ruler rests on the tab bar as part of the dock. It reads where the bar really starts
 * (the bar's height varies with text size) and tells the shell its own height, so the page's bottom padding keeps
 * the whole day above it. Wide screens ignore both values (ruler.css applies them only below 700 px).
 */
export function useDockedRuler(ref:RefObject<HTMLElement|null>):void{
 useEffect(()=>{
  const node=ref.current,dock=document.querySelector<HTMLElement>('.v7-dock');
  if(!node||!dock||typeof ResizeObserver==='undefined')return;
  const shell=node.closest<HTMLElement>('.v7-shell');
  const place=()=>{
   node.style.setProperty('--v7-dock-top',Math.max(0,Math.round(window.innerHeight-dock.getBoundingClientRect().top))+'px');
   shell?.style.setProperty('--v7-dock-ruler',Math.ceil(node.getBoundingClientRect().height)+'px');
  };
  place();
  const observer=new ResizeObserver(place);observer.observe(dock);observer.observe(node);window.addEventListener('resize',place);
  return ()=>{observer.disconnect();window.removeEventListener('resize',place);node.style.removeProperty('--v7-dock-top');shell?.style.removeProperty('--v7-dock-ruler');};
 });
}
