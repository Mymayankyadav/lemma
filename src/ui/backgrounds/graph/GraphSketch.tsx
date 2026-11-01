import {lazy,Suspense,useEffect,useState} from 'react';

const ReviewCurve=lazy(()=>import('./ReviewCurve'));

type Sketch='today'|'paths'|'review'|'insights'|'unit';
/** A static, pointer-free engineering-pad sketch. Nothing animates or tracks the pointer. */
const pathFrom=(points:[number,number][])=>points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
function sample(fn:(x:number)=>number,min:number,max:number,scale:(x:number,y:number)=>[number,number]){
 return pathFrom(Array.from({length:101},(_,i)=>{const x=min+(max-min)*i/100;return scale(x,fn(x));}));
}
type SketchFigure={path:string;label:string;second?:string;turns?:[number,number][]};
// Exact owner-approved cubic letterhead, generated once at build time.
// Avoid 101 toFixed/cubic evaluations on every fresh Today document.
const TODAY_PATH='M34.00 161.00 L36.32 152.94 L38.64 145.31 L40.96 138.11 L43.28 131.32 L45.60 124.94 L47.92 118.95 L50.24 113.35 L52.56 108.14 L54.88 103.29 L57.20 98.81 L59.52 94.68 L61.84 90.89 L64.16 87.44 L66.48 84.32 L68.80 81.51 L71.12 79.02 L73.44 76.82 L75.76 74.91 L78.08 73.29 L80.40 71.94 L82.72 70.86 L85.04 70.03 L87.36 69.45 L89.68 69.11 L92.00 69.00 L94.32 69.11 L96.64 69.43 L98.96 69.95 L101.28 70.67 L103.60 71.58 L105.92 72.66 L108.24 73.90 L110.56 75.31 L112.88 76.87 L115.20 78.57 L117.52 80.40 L119.84 82.35 L122.16 84.42 L124.48 86.60 L126.80 88.87 L129.12 91.23 L131.44 93.67 L133.76 96.18 L136.08 98.76 L138.40 101.38 L140.72 104.05 L143.04 106.76 L145.36 109.49 L147.68 112.24 L150.00 115.00 L152.32 117.76 L154.64 120.51 L156.96 123.24 L159.28 125.95 L161.60 128.62 L163.92 131.24 L166.24 133.82 L168.56 136.33 L170.88 138.77 L173.20 141.13 L175.52 143.40 L177.84 145.58 L180.16 147.65 L182.48 149.60 L184.80 151.43 L187.12 153.13 L189.44 154.69 L191.76 156.10 L194.08 157.34 L196.40 158.42 L198.72 159.33 L201.04 160.05 L203.36 160.57 L205.68 160.89 L208.00 161.00 L210.32 160.89 L212.64 160.55 L214.96 159.97 L217.28 159.14 L219.60 158.06 L221.92 156.71 L224.24 155.09 L226.56 153.18 L228.88 150.98 L231.20 148.49 L233.52 145.68 L235.84 142.56 L238.16 139.11 L240.48 135.32 L242.80 131.19 L245.12 126.71 L247.44 121.86 L249.76 116.65 L252.08 111.05 L254.40 105.06 L256.72 98.68 L259.04 91.89 L261.36 84.69 L263.68 77.06 L266.00 69.00';
// Each route has its own immutable letterhead. Construct only the active
// curve: eagerly sampling every unrelated route (hundreds of toFixed/exp
// operations) delayed the first real Today goal under strict 4x CPU.
const sketchFactories:Record<Sketch,()=>SketchFigure>={
 today:()=>({path:TODAY_PATH,label:'y = x³ − 3x',turns:[[92,69],[208,161]]}),
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
