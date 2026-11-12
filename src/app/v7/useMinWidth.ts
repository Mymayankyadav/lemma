import {useEffect,useState} from 'react';

/** Layout follows the same kit breakpoints as CSS, including a resized window. */
export function useMinWidth(width:number){
 const query=`(min-width: ${width}px)`;
 const [matches,setMatches]=useState(()=>typeof matchMedia==='function'&&matchMedia(query).matches);
 useEffect(()=>{
  if(typeof matchMedia!=='function')return;
  const media=matchMedia(query),change=()=>setMatches(media.matches);change();
  media.addEventListener('change',change);return()=>media.removeEventListener('change',change);
 },[query]);
 return matches;
}
