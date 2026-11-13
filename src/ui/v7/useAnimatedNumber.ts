import {useEffect,useReducer,useRef} from 'react';
import {interpolateNumber,motionV1} from './motion';
import {motionReduced} from './effects';

/**
 * V20 · a figure that counts to its new value when it changes (Motion v1 base duration, easing out), so a change the
 * learner caused is seen to happen. The first value once `live` (loaded) shows at once, and so does every value while
 * not live. With reduced motion (the system setting or Reduce effects) `interpolateNumber` jumps to the new value.
 */
export function useAnimatedNumber(value:number,live=true,duration=motionV1.base*1000):number{
 // The value at rest (null until the first live value) and the value mid-count (null at rest).
 const rest=useRef<number|null>(live?value:null),counting=useRef<number|null>(null);
 const [,redraw]=useReducer((n:number)=>n+1,0);
 useEffect(()=>{
  if(!live){rest.current=null;counting.current=null;return;}
  const from=counting.current??rest.current;
  const reduced=motionReduced(),whole=Number.isInteger(value)&&(from===null||Number.isInteger(from));
  if(from===null||from===value||reduced||typeof requestAnimationFrame!=='function'){
   rest.current=from===null?value:interpolateNumber(from,value,0,true);counting.current=null;redraw();return;
  }
  let frame=0,start:number|null=null;
  const step=(now:number)=>{
   start??=now;
   const progress=duration>0?Math.min(1,(now-start)/duration):1,next=interpolateNumber(from,value,1-Math.pow(1-progress,3));
   if(progress<1){counting.current=whole?Math.round(next):next;frame=requestAnimationFrame(step);}
   else{counting.current=null;rest.current=value;}
   redraw();
  };
  frame=requestAnimationFrame(step);
  return()=>cancelAnimationFrame(frame);
 },[value,live,duration]);
 if(!live||rest.current===null)return value;
 return counting.current??rest.current;
}
