import {lazy,Suspense,useEffect,useState} from 'react';

const ReviewCurve=lazy(()=>import('./ReviewCurve'));

type Sketch='today'|'paths'|'review'|'insights'|'unit';
/** A static, pointer-free engineering-pad sketch. Nothing animates or tracks the pointer. */
const pathFrom=(points:[number,number][])=>points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
function sample(fn:(x:number)=>number,min:number,max:number,scale:(x:number,y:number)=>[number,number]){
 return pathFrom(Array.from({length:101},(_,i)=>{const x=min+(max-min)*i/100;return scale(x,fn(x));}));
}
type SketchFigure={path:string;label:string;second?:string;turns?:[number,number][]};
// Each route has its own immutable letterhead. Construct only the active
// curve: eagerly sampling every unrelated route (hundreds of toFixed/exp
// operations) delayed the first real Today goal under strict 4x CPU.
const sketchFactories:Record<Sketch,()=>SketchFigure>={
 today:()=>({path:sample(x=>x*x*x-3*x,-2,2,(x,y)=>[150+x*58,115-y*23]),label:'y = x³ − 3x',turns:[[92,69],[208,161]]}),
 paths:()=>({path:sample(x=>1/(1+Math.exp(-x)),-5,5,(x,y)=>[150+x*25,185-y*122]),label:'Learning curve'}),
 review:()=>({path:sample(x=>Math.exp(-x/3),0,6,(x,y)=>[30+x*42,185-y*122]),second:sample(x=>Math.exp(-x/4.6),0,6,(x,y)=>[30+x*42,185-y*122]),label:'y = e⁻ˣ⁄³'}),
 insights:()=>({path:sample(x=>Math.exp(-x*x/2),-3,3,(x,y)=>[150+x*42,185-y*122]),label:'Normal density'}),
 unit:()=>({path:sample(x=>Math.sin(x),0,Math.PI*2,(a,y)=>[150+74*Math.cos(a),111-74*y]),label:'Unit circle'}),
};
const sketchCache=new Map<Sketch,SketchFigure>();
const getSketch=(kind:Sketch):SketchFigure=>{
 const cached=sketchCache.get(kind);
 if(cached)return cached;
 const figure=sketchFactories[kind]();
 sketchCache.set(kind,figure);
 return figure;
};
function kindFor(path:string):Sketch|null {
 if(path==='/')return 'today';
 if(path==='/projects'||path.startsWith('/p/'))return 'paths';
 if(path==='/review')return 'review';
 if(path==='/insights')return 'insights';
 if(path==='/settings'||path==='/sign-in')return 'unit';
 return null; // Atlas and active card review show the grid only.
}
export function GraphSketch({path}:{path:string}){
 const [theme,setTheme]=useState(()=>document.documentElement.dataset.theme);
 useEffect(()=>{
  const refresh=()=>setTheme(document.documentElement.dataset.theme);
  window.addEventListener('lemma-ui-change',refresh);
  return()=>window.removeEventListener('lemma-ui-change',refresh);
 },[]);
 const kind=kindFor(path);
 if(!kind||(theme!=='graph'&&theme!=='graph-night'))return null;
 const figure=getSketch(kind),opacity=theme==='graph-night'?.13:.12;
 return <svg aria-hidden="true" data-graph-sketch={kind} viewBox="0 0 300 220" preserveAspectRatio="xMidYMid meet"
  className="pointer-events-none absolute right-2 top-0 z-0 h-auto w-[min(34vw,150px)] overflow-hidden"
  style={{maxHeight:'120px'}}>
  <g fill="none" stroke="var(--ink)" strokeWidth="1" opacity=".12">
   <path d="M14 185H289M30 15V205"/>
   {Array.from({length:8},(_,i)=><path key={'x'+i} d={`M${30+i*35} 181v8`}/>)}
   {Array.from({length:5},(_,i)=><path key={'y'+i} d={`M26 ${45+i*35}h8`}/>)}
  </g>
  <path d={figure.path} fill="none" stroke="var(--accent)" strokeWidth="2" opacity={opacity} strokeLinecap="round"/>
  {kind==='review'&&figure.second&&<Suspense fallback={null}><ReviewCurve path={figure.second} opacity={opacity*.7}/></Suspense>}
  {figure.turns?.map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" opacity={opacity}/>)}
 </svg>;
}
