import {useEffect,useRef,useState} from 'react';
import {captions,figures,type Figure} from './draw';
/** A fixed, pointer-free, ink-on-paper construction behind one screen. */
const visited=new Set<string>();
export function Construction({figure,visitKey}:{figure:Figure;visitKey:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [mode,setMode]=useState(()=>typeof document!=='undefined'?document.documentElement.dataset.theme||'euclid':'euclid');
 useEffect(()=>{
  const refresh=()=>setMode(document.documentElement.dataset.theme||'euclid');
  window.addEventListener('lemma-ui-change',refresh);
  return()=>window.removeEventListener('lemma-ui-change',refresh);
 },[]);
 const enabled=mode==='euclid'||mode==='euclid-night';
 useEffect(()=>{
  if(!enabled||!canvas.current)return;
  const el=canvas.current,ctx=el.getContext('2d');if(!ctx)return;
  let raf=0,started=0;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const animate=document.documentElement.dataset.effects!=='calm'&&!media.matches&&!visited.has(visitKey);
  visited.add(visitKey);
  const palette=()=>{
   const css=getComputedStyle(document.documentElement);
   return {ink:css.getPropertyValue('--ink').trim(),accent:css.getPropertyValue('--accent').trim()};
  };
  function frame(now:number){
   if(!ctx)return;
   if(!started)started=now;
   const ratio=Math.min(window.devicePixelRatio||1,3);
   const w=window.innerWidth,h=window.innerHeight;
   if(el.width!==Math.round(w*ratio)||el.height!==Math.round(h*ratio)){
    el.width=Math.round(w*ratio);el.height=Math.round(h*ratio);
    el.style.width=w+'px';el.style.height=h+'px';
   }
   ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
   const p=animate?Math.min(1,(now-started)/1400):1;
   figures[figure](ctx,w,h,palette(),p);
   if(p<1)raf=requestAnimationFrame(frame);
  }
  const rerender=()=>{cancelAnimationFrame(raf);started=0;raf=requestAnimationFrame(frame)};
  raf=requestAnimationFrame(frame);window.addEventListener('resize',rerender);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',rerender)};
 },[figure,visitKey,mode,enabled]);
 if(!enabled)return null;
 return <div aria-hidden="true" className="euclid-construction pointer-events-none fixed inset-0 z-0 overflow-hidden">
  <canvas ref={canvas} className="absolute inset-0"/>
  <span className="absolute left-[56%] top-[calc(32%+70px)] font-[var(--font-display)] text-[11px] italic tracking-wide text-[var(--ink-3)] opacity-50">{captions[figure]}</span>
 </div>;
}
export default Construction;
