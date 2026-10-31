import './math.css';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {renderMarkdown} from '../lib/render';
export interface MathTextProps {
 source:string; variant?:'card'|'answer'|'body'; cloze?:{ord:number;revealed:boolean};
 className?:string; interactiveMath?:boolean;
}
const variants={card:'font-math text-card leading-[1.3] text-ink',answer:'font-math text-card leading-[1.45] text-ink-soft',body:'text-body-l leading-relaxed text-ink'};
const largeEnvironment=/\\begin\{(aligned|align|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|array)\}([\s\S]*?)\\end\{\1\}/g;
function mathsToDisplay(source:string){
 return source.replace(/\\\(([\s\S]*?)\\\)|(?<!\$)\$([^\n$]+)\$(?!\$)/g,(all,bracket:string|undefined,dollar:string|undefined)=>{
  const tex=bracket??dollar??'';
  return tex.length>40?'\\['+tex+'\\]':all;
 });
}
function shortenMaths(source:string,expanded:boolean){
 let largest=0;
 const text=source.replace(largeEnvironment,(full,env:string,body:string)=>{
  const lines=body.split(/\\\\/);
  largest=Math.max(largest,lines.length);
  if(expanded||lines.length<=8)return full;
  return '\\begin{'+env+'}'+lines.slice(0,8).join('\\\\')+'\\end{'+env+'}';
 });
 return {text,largest};
}
/** Card-scale maths remains at least 16px and offers a full-size, pinch-zoomable inspection view. */
export function MathText({source,variant='body',cloze,className='',interactiveMath=false}:MathTextProps){
 const root=useRef<HTMLDivElement>(null),touch=useRef<{distance:number;zoom:number}|null>(null);
 const [expanded,setExpanded]=useState(false),[mathHtml,setMathHtml]=useState<string|null>(null),[zoom,setZoom]=useState(1);
 const shortened=useMemo(()=>shortenMaths(source,expanded||!interactiveMath),[source,expanded,interactiveMath]);
 const html=useMemo(()=>renderMarkdown(interactiveMath?mathsToDisplay(shortened.text):source,{cloze}),
  [source,shortened.text,interactiveMath,cloze?.ord,cloze?.revealed]);
 useEffect(()=>{
  if(!interactiveMath||!root.current)return;
  const parent=root.current;
  const buttons:HTMLButtonElement[]=[];
  for(const element of Array.from(parent.querySelectorAll<HTMLElement>('.katex-display'))){
   const frame=document.createElement('div');
   frame.className='lemma-math-frame';
   element.parentNode?.insertBefore(frame,element);
   frame.appendChild(element);
   const button=document.createElement('button');
   button.type='button';button.className='lemma-math-expand';
   button.textContent='⤢';button.setAttribute('aria-label','View maths full screen');
   button.addEventListener('click',()=>{setMathHtml(element.outerHTML);setZoom(1)});
   frame.appendChild(button);buttons.push(button);
  }
  return ()=>{for(const button of buttons)button.remove()};
 },[html,interactiveMath]);
 useEffect(()=>{
  if(!mathHtml)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setMathHtml(null)}};
  document.addEventListener('keydown',key);
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  return ()=>{document.removeEventListener('keydown',key);document.body.style.overflow=old};
 },[mathHtml]);
 const distance=(touches:TouchList)=>Math.hypot(
  touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY
 );
 const zoomTo=(value:number)=>setZoom(Math.max(1,Math.min(4,value)));
 return <>
  <div ref={root} className={'lemma-math prose-invert min-w-0 max-w-none wrap-break-word '+variants[variant]+' '+className}
   dangerouslySetInnerHTML={{__html:html}}/>
  {interactiveMath&&shortened.largest>8&&!expanded&&
   <button type="button" className="mt-2 min-h-11 text-label font-semibold text-amber" onClick={()=>setExpanded(true)}>
    Show all {shortened.largest} lines
   </button>}
  {interactiveMath&&shortened.largest>8&&expanded&&
   <button type="button" className="mt-2 min-h-11 text-label font-semibold text-amber" onClick={()=>setExpanded(false)}>Show first 8 lines</button>}
  {interactiveMath&&mathHtml&&createPortal(
   <div role="dialog" aria-modal="true" aria-label="Full screen maths" className="lemma-math-modal">
    <div className="lemma-math-modal-toolbar">
     <span className="text-label text-ink-2">Maths · pinch or zoom to inspect</span>
     <button type="button" aria-label="Zoom out" className="lemma-math-modal-button" onClick={()=>zoomTo(zoom-.25)}>−</button>
     <button type="button" aria-label="Zoom in" className="lemma-math-modal-button" onClick={()=>zoomTo(zoom+.25)}>+</button>
     <button type="button" aria-label="Close maths" className="lemma-math-modal-button" onClick={()=>setMathHtml(null)}>×</button>
    </div>
    <div className="lemma-math-modal-content" onTouchStart={e=>{
      if(e.touches.length===2)touch.current={distance:distance(e.touches),zoom};
     }} onTouchMove={e=>{
      if(e.touches.length===2&&touch.current){
       e.preventDefault();zoomTo(touch.current.zoom*distance(e.touches)/touch.current.distance);
      }
     }} onTouchEnd={()=>{touch.current=null}}>
     <div className="lemma-math-modal-formula" style={{transform:'scale('+zoom+')'}}
      dangerouslySetInnerHTML={{__html:mathHtml}}/>
    </div>
   </div>,document.body)}
 </>;
}
export default MathText;
