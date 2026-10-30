import {useEffect,useState} from 'react';
import {useReducedMotion} from 'motion/react';
import {useCalm} from '../useCalm';
/** Animation stops when hidden or when the visitor requests less motion. */
export function useIllustrationMotion(){
 const calm=useCalm(), reduce=!!useReducedMotion() || calm;
 const [visible,setVisible]=useState(()=>typeof document==='undefined'||document.visibilityState==='visible');
 useEffect(()=>{const change=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change)},[]);
 return !reduce&&visible;
}
