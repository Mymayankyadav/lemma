import {useEffect,useRef,useState} from 'react';
import {captions,figures,type Figure} from './draw';
const visited=new Set<string>();
const appearance=()=>[document.documentElement.dataset.theme,document.documentElement.dataset.effects].join(':');
/** A fixed, pointer-free construction. Calm/reduced motion always paints its final frame. */
export function Construction({figure,visitKey}:{figure:Figure;visitKey:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [settings,setSettings]=useState(appearance);
 const mode=settings.split(':')[0],enabled=mode==='euclid'||mode==='euclid-night';
 useEffect(()=>{
  const refresh=()=>setSettings(appearance());
  window.addEventListener('lemma-ui-change',refresh);
  return()=>window.removeEventListener('lemma-ui-change',refresh);
 },[]);
 useEffect(()=>{
  if(!enabled||!canvas.current)return;
  const el=canvas.current,ctx=el.getContext('2d');if(!ctx)return;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let raf=0,started:number|null=null;
  let animate=document.documentElement.dataset.effects!=='calm'&&!media.matches&&!visited.has(visitKey);
  function frame(now:number){
   if(!ctx)return;
   if(started===null)started=now;
   const ratio=Math.min(window.devicePixelRatio||1,3),w=window.innerWidth,h=window.innerHeight;
   el.width=Math.round(w*ratio);el.height=Math.round(h*ratio);
   el.style.width=w+'px';el.style.height=h+'px';
   ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
   const css=getComputedStyle(document.documentElement);
   const elapsed=Math.min(1,(now-started)/1400);
   const p=animate?(elapsed<.5?2*elapsed*elapsed:1-Math.pow(-2*elapsed+2,2)/2):1;
   figures[figure](ctx,w,h,{ink:css.getPropertyValue('--ink').trim(),accent:css.getPropertyValue('--accent').trim()},p);
   el.dataset.progress=String(p);
   if(p<1)raf=requestAnimationFrame(frame);else visited.add(visitKey);
  }
  const finish=()=>{cancelAnimationFrame(raf);animate=false;raf=requestAnimationFrame(frame)};
  raf=requestAnimationFrame(frame);
  window.addEventListener('resize',finish);media.addEventListener('change',finish);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',finish);media.removeEventListener('change',finish)};
 },[figure,visitKey,settings,enabled]);
 if(!enabled)return null;
 return <div aria-hidden="true" data-construction={figure} className="euclid-construction pointer-events-none fixed inset-0 z-0 overflow-hidden">
  <canvas ref={canvas} className="absolute inset-0"/>
  <span className="absolute left-[56%] top-[calc(32%+70px)] font-[var(--font-display)] text-caption italic tracking-wide text-[var(--ink-3)] opacity-50">{captions[figure]}</span>
 </div>;
}
export default Construction;
