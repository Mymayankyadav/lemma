import {useEffect,useState} from 'react';
export function isCalm(): boolean { return typeof document === 'undefined' || document.documentElement.dataset.effects !== 'rich'; }
export function useCalm(): boolean {
 const [calm,setCalm]=useState(isCalm);
 useEffect(()=>{const refresh=()=>setCalm(isCalm());window.addEventListener('lemma-ui-change',refresh);return()=>window.removeEventListener('lemma-ui-change',refresh);},[]);
 return calm;
}
