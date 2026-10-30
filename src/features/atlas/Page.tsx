import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,Check,ChevronRight,Compass,LockKeyhole,Minus,Plus,RotateCcw,PinOff,Waypoints,X} from 'lucide-react';
import {select} from 'd3-selection';
import {zoom,zoomIdentity} from 'd3-zoom';
import type {ZoomBehavior,ZoomTransform} from 'd3-zoom';
import {useAtlas,usePinConcept} from '../../data/hooks';
import type {AtlasGraph} from '../../data/types';
import {useToast} from '../../ui/Toast';
import {Button} from '../../ui/Button';
import {Segmented} from '../../ui/Segmented';
import {AtlasListViews} from './AtlasListViews';
import {AtlasMinimap} from './AtlasMinimap';
import {OrbitRings,orbitFitPoints,atlasOrbitGroups} from './OrbitRings';
import {Chip} from '../../ui/Chip';
import {EmptyState} from '../../ui/EmptyState';
import {Skeleton} from '../../ui/Skeleton';
import {fitAtlasViewport,visibleOrbitLabels} from './graph';
import {layoutOrbitGraph} from './orbitsLayout';
import type {AtlasNode,Point} from './graph';

type Filter='all'|'revisit'|'demonstrated';
type AtlasMode='orbits'|'branches'|'outline';
interface Drag{pointerId:number;id:string;startX:number;startY:number;original:Point;moved:boolean}
const names:Record<AtlasNode['status'],string>={
 demonstrated:'Demonstrated',revisit:'Re-check due',in_progress:'In progress',not_started:'Not started',
};
function stars(count:number,seed:number){
 return Array.from({length:count},(_,i)=>{
  const x=(((i*131+seed*97)%997)/997)*100;
  const y=(((i*317+seed*41)%991)/991)*100;
  const radius=i%13===0?1.3:i%7===0?0.85:0.45;
  return {id:i,x,y,radius,opacity:0.12+(i%9)/55};
 });
}
function Starfield(){
 const reduce=!!useReducedMotion();
 const first=useMemo(()=>stars(76,1),[]),second=useMemo(()=>stars(48,4),[]);
 return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
  <div className="absolute inset-0 opacity-50" style={{background:'radial-gradient(ellipse at 10% -10%,rgba(247,181,56,.08),transparent 54%),radial-gradient(ellipse at 90% 75%,rgba(164,149,255,.08),transparent 55%)'}}/>
  <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
   <motion.g animate={reduce?{}:{y:[0,-1.5,0]}} transition={{duration:26,repeat:Infinity,ease:'easeInOut'}}>
    {first.map(s=><circle key={s.id} cx={s.x} cy={s.y} r={s.radius*.16} fill="var(--ink)" opacity={s.opacity}/>)}
   </motion.g>
   <motion.g animate={reduce?{}:{y:[0,1.3,0]}} transition={{duration:34,repeat:Infinity,ease:'easeInOut'}}>
    {second.map(s=><circle key={s.id} cx={s.x} cy={s.y} r={s.radius*.15} fill="var(--amber-hi)" opacity={s.opacity*.5}/>)}
   </motion.g>
  </svg>
 </div>;
}
function star(cx:number,cy:number,r=7){
 const parts:string[]=[];
 for(let i=0;i<10;i++){
  const angle=Math.PI*i/5-Math.PI/2,rad=i%2===0?r:r*.46;
  parts.push((i?'L':'M')+(cx+Math.cos(angle)*rad).toFixed(2)+','+(cy+Math.sin(angle)*rad).toFixed(2));
 }
 return parts.join(' ')+' Z';
}
function WorldNode({node,selected,dim,reduce,showLabel,position,zoomScale,onDown,onMove,onUp,onCancel,onSelect}:{
 node:AtlasNode;selected:boolean;dim:boolean;reduce:boolean;showLabel:boolean;position:Point;zoomScale:number;
 onDown:(event:ReactPointerEvent<SVGGElement>,node:AtlasNode)=>void;
 onMove:(event:ReactPointerEvent<SVGGElement>,node:AtlasNode)=>void;
 onUp:(event:ReactPointerEvent<SVGGElement>,node:AtlasNode)=>void;
 onCancel:(event:ReactPointerEvent<SVGGElement>)=>void;
 onSelect:(id:string)=>void;
}){
 const {x,y}=position,status=node.status;
 return <g data-node={node.id} role="button" aria-label={node.name+', '+names[status]}
  aria-pressed={selected} tabIndex={0} style={{cursor:'pointer',touchAction:'none',outline:'none',transition:reduce?'none':'opacity .4s'}}
  opacity={dim?.18:1}
  onPointerDown={e=>onDown(e,node)} onPointerMove={e=>onMove(e,node)} onPointerUp={e=>onUp(e,node)}
  onPointerCancel={onCancel}
  onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(node.id)}}}>
  <circle cx={x} cy={y} r={22/zoomScale} fill="transparent" stroke="none"/>
  {selected&&<motion.circle cx={x} cy={y} r={22} fill="none" stroke="var(--amber)" strokeOpacity=".4" strokeWidth={1.3}
    animate={reduce?{}:{r:[17,26,17],opacity:[.7,.15,.7]}} transition={{duration:3,repeat:Infinity}}/>}
  {status==='revisit'&&<motion.circle cx={x} cy={y} r={11} fill="none" stroke="var(--amber)"
    strokeWidth={1.2} strokeDasharray="3 3" animate={reduce?{}:{r:[11,22],opacity:[.8,0]}} transition={{duration:2.4,repeat:Infinity,delay:node.id.length%5*.13}}/>}
  {status==='in_progress'&&<><circle cx={x} cy={y} r={7} fill="var(--obsidian)" stroke="var(--amber)" strokeWidth={2}/>
   <circle cx={x} cy={y} r={2.8} fill="var(--amber)"/></>}
  {(status==='demonstrated'||status==='revisit')&&<>
   <circle cx={x} cy={y} r={selected?13:9} fill="var(--amber)" opacity=".10" filter="url(#atlas-glow)"/>
   <path d={star(x,y,status==='demonstrated'||selected?7:5.5)} fill="url(#atlas-star)" stroke="var(--amber-hi)" strokeWidth=".45"/>
  </>}
  {status==='not_started'&&<circle cx={x} cy={y} r={selected?6:4.5} fill="var(--obsidian)" stroke="var(--ink-4)" strokeWidth={1.35}/>}
  {selected&&<circle cx={x} cy={y} r={10} fill="none" stroke="var(--amber-hi)" strokeWidth={1} strokeOpacity={0.9}/>}
  {showLabel&&<text x={x} y={y+23/zoomScale} textAnchor="middle" fontFamily="var(--font-ui)" fontSize={(selected?13:11.5)/zoomScale}
   fontWeight={selected?600:500} fill={selected?'var(--ink)':'var(--ink-2)'}
   stroke="var(--obsidian)" strokeWidth={3/zoomScale} paintOrder="stroke" pointerEvents="none">{node.name}</text>}
 </g>;
}
function FilterPill({label,count,active,onClick,icon:Icon}:{label:string;count:number;active:boolean;onClick:()=>void;icon?:typeof Check}){
 return <button type="button" onClick={onClick} aria-pressed={active}
  className={'flex min-h-11 shrink-0 items-center gap-1.5 rounded-chip border px-3 text-label font-medium backdrop-blur-xl '+
   (active?'border-amber bg-amber text-amber-ink':'border-edge-2 bg-glass text-ink-2')}>
  {Icon&&<Icon size={14} aria-hidden="true"/>}{label} {count}
 </button>;
}
export default function Page(){
 const navigate=useNavigate(),[params,setParams]=useSearchParams(),toast=useToast(),reduce=!!useReducedMotion();
 const query=useAtlas(),pin=usePinConcept(),svg=useRef<SVGSVGElement>(null),zoomRef=useRef<ZoomBehavior|null>(null);
 const [view,setView]=useState<ZoomTransform>({x:0,y:0,k:1});
 const viewRef=useRef(view),userMoved=useRef(false),drag=useRef<Drag|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),longPressed=useRef<string|null>(null);
 const [positions,setPositions]=useState<Record<string,Point>>({}),[selectedId,setSelectedId]=useState<string|null>(null);
 const [filter,setFilter]=useState<Filter>('all'),[menuId,setMenuId]=useState<string|null>(null);
 const [orbitFocus,setOrbitFocus]=useState<{subjectId:string;topicId?:string}|null>(null);
 const focus=params.get('focus');
 const mode:AtlasMode=params.get('view')==='branches'?'branches':params.get('view')==='outline'?'outline':'orbits';
 const changeMode=(next:string)=>{const p=new URLSearchParams(params);if(next==='orbits')p.delete('view');else p.set('view',next);setParams(p,{replace:true})};
 const graph=query.data;
 const layout=useMemo(()=>graph?layoutOrbitGraph(graph):null,[graph]);
 const nodeList=layout?.nodes??[],selected=nodeList.find(n=>n.id===selectedId)??null;
 const byId=layout?.byId;
 const labels=useMemo(()=>visibleOrbitLabels(nodeList.map(n=>({...n,...positions[n.id]})),selectedId,view.k),[nodeList,positions,selectedId,view.k]);
 const countAll=nodeList.length,countRevisit=nodeList.filter(n=>n.status==='revisit').length,
   countDone=nodeList.filter(n=>n.status==='demonstrated').length;
 useEffect(()=>{viewRef.current=view},[view]);
 const handleFit=useCallback(()=>{
  const element=svg.current,model=layout;
  if(!element||!model||!zoomRef.current||!graph)return;
  const size=element.getBoundingClientRect();
  const nodes=model.nodes.map(n=>({...n,...positions[n.id]}));
  const t=fitAtlasViewport([...nodes,...orbitFitPoints(graph,nodes)],size.width,size.height);
  userMoved.current=false;
  zoomRef.current.transform(select(element),zoomIdentity.translate(t.x,t.y).scale(t.k));
 },[layout,positions,graph]);
 const focusOrbit=(subjectId:string,topicId?:string)=>{
  const el=svg.current;
  if(!el||!zoomRef.current||!graph)return;
  const group=atlasOrbitGroups(graph,nodeList.map(n=>({...n,...positions[n.id]}))).find(g=>g.id===subjectId);
  const target=topicId?group?.topics.find(t=>t.id===topicId):group;
  if(!target)return;
  const bounds=el.getBoundingClientRect();
  const availableHeight=Math.max(120,bounds.height-340);
  const k=Math.min(2.2,Math.max(.2,Math.min((bounds.width-48)/(2*target.radius),availableHeight/(2*target.radius))));
  userMoved.current=true;
  zoomRef.current.transform(select(el),zoomIdentity.translate(
   bounds.width/2-target.x*k,bounds.height*.47-target.y*k
  ).scale(k));
  setOrbitFocus({subjectId,topicId});
 };
 const navigateMinimap=useCallback((point:Point)=>{
  const element=svg.current;
  if(!element||!zoomRef.current)return;
  const box=element.getBoundingClientRect(),k=viewRef.current.k;
  userMoved.current=true;
  zoomRef.current.transform(select(element),zoomIdentity.translate(box.width/2-point.x*k,box.height/2-point.y*k).scale(k));
 },[]);
 const handleZoom=useCallback((factor:number)=>{
  if(!svg.current||!zoomRef.current)return;
  userMoved.current=true;
  zoomRef.current.scaleBy(select(svg.current),factor);
 },[]);
 useEffect(()=>{
  const element=svg.current,model=layout;
  if(!element||!model||!graph)return;
  const fitPoints=[...model.nodes,...orbitFitPoints(graph,model.nodes)];
  const behavior=zoom<SVGSVGElement,unknown>().scaleExtent([.2,3])
   .filter(event=>!(event.target instanceof Element&&event.target.closest('[data-node]')) &&
       ((event as MouseEvent).button===undefined||(event as MouseEvent).button===0))
   .on('zoom',event=>{if('sourceEvent' in event && event.sourceEvent)userMoved.current=true;setView(event.transform)});
  zoomRef.current=behavior;
  const selection=select(element);
  selection.call(behavior);
  selection.on('dblclick.zoom',null);
  const box=element.getBoundingClientRect();
  const fitted=fitAtlasViewport(fitPoints,box.width,box.height);
  behavior.transform(selection,zoomIdentity.translate(fitted.x,fitted.y).scale(fitted.k));
  const resize=new ResizeObserver(()=>{
   // Preserve the user's zoom when rotating; fit only if no interaction has yet occurred.
   if(!svg.current||!zoomRef.current)return;
   const b=svg.current.getBoundingClientRect();
   if(b.width&&b.height&&!userMoved.current) {
    const f=fitAtlasViewport(fitPoints,b.width,b.height);
    zoomRef.current.transform(select(svg.current),zoomIdentity.translate(f.x,f.y).scale(f.k));
   }
  });
  resize.observe(element);
  return()=>{resize.disconnect();selection.on('.zoom',null);zoomRef.current=null};
 },[layout,mode,graph]);
 useEffect(()=>{
  if(!layout||!focus||mode!=='orbits')return;
  const found=layout.nodes.find(n=>n.slug===focus);
  if(!found)return;
  setSelectedId(found.id);
  const el=svg.current;
  if(!el||!zoomRef.current)return;
  const b=el.getBoundingClientRect(),k=Math.min(1.65,Math.max(.75,viewRef.current.k));
  zoomRef.current.transform(select(el),zoomIdentity.translate(b.width/2-found.x*k,b.height*.46-found.y*k).scale(k));
 },[focus,layout,mode]);
 const clearTimer=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null}};
 const selectNode=(id:string)=>{
  setSelectedId(id);setMenuId(null);
  const concept=byId?.get(id);
  if(concept&&params.get('focus')!==concept.slug){
   const next=new URLSearchParams(params);next.set('focus',concept.slug);setParams(next,{replace:true});
  }
 };
 const hideSelection=()=>{
  setSelectedId(null);setMenuId(null);
  if(params.has('focus')){const next=new URLSearchParams(params);next.delete('focus');setParams(next,{replace:true})}
 };
 function positionFrom(event:ReactPointerEvent<SVGGElement>):Point {
  const rect=svg.current?.getBoundingClientRect();
  const offsetX=(event.clientX-(rect?.left??0)-viewRef.current.x)/viewRef.current.k;
  const offsetY=(event.clientY-(rect?.top??0)-viewRef.current.y)/viewRef.current.k;
  return {x:offsetX,y:offsetY};
 }
 function onNodeDown(event:ReactPointerEvent<SVGGElement>,node:AtlasNode){
  if(event.pointerType==='mouse'&&event.button!==0)return;
  event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
  longPressed.current=null;
  drag.current={pointerId:event.pointerId,id:node.id,startX:event.clientX,startY:event.clientY,
    original:positions[node.id]??{x:node.x,y:node.y},moved:false};
  clearTimer();
  if(node.pinX!==null&&node.pinY!==null){
   timer.current=setTimeout(()=>{
    if(drag.current?.id===node.id&&!drag.current.moved){longPressed.current=node.id;setMenuId(node.id);setSelectedId(node.id)}
   },650);
  }
 }
 function onNodeMove(event:ReactPointerEvent<SVGGElement>,node:AtlasNode){
  const state=drag.current;
  if(!state||state.id!==node.id||state.pointerId!==event.pointerId)return;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY;
  if(Math.hypot(dx,dy)<5&&!state.moved)return;
  state.moved=true;clearTimer();
  event.preventDefault();event.stopPropagation();
  const orig=state.original;
  setPositions(p=>({...p,[node.id]:{x:orig.x+dx/viewRef.current.k,y:orig.y+dy/viewRef.current.k}}));
 }
 function onNodeUp(event:ReactPointerEvent<SVGGElement>,node:AtlasNode){
  const state=drag.current;
  if(!state||state.id!==node.id||state.pointerId!==event.pointerId)return;
  clearTimer();drag.current=null;event.stopPropagation();
  if(state.moved){
   const point={x:state.original.x+(event.clientX-state.startX)/viewRef.current.k,
    y:state.original.y+(event.clientY-state.startY)/viewRef.current.k};
   setPositions(p=>({...p,[node.id]:point}));
   pin.mutate({id:node.id,x:point.x,y:point.y},{
    onSuccess:()=>toast('Position pinned',{tone:'success'}),
    onError:(e)=>{setPositions(p=>{const next={...p};delete next[node.id];return next});toast(e.message||'Could not pin concept',{tone:'danger'})}
   });
  } else if(longPressed.current!==node.id) selectNode(node.id);
  longPressed.current=null;
 }
 function onNodeCancel(){clearTimer();drag.current=null;longPressed.current=null}
 function unpinNode(node:AtlasNode){
  setMenuId(null);
  pin.mutate({id:node.id,x:null,y:null},{
   onSuccess:()=>{setPositions(p=>{const next={...p};delete next[node.id];return next});toast('Concept unpinned',{tone:'success'})},
   onError:e=>toast(e.message||'Could not unpin concept',{tone:'danger'})
  });
 }
 const filtered=(node:AtlasNode)=>filter!=='all'&&node.status!==filter&&! (selectedId===node.id);
 if(query.isPending)return <main className="relative flex min-h-dvh flex-col gap-5 overflow-hidden bg-obsidian p-6 text-ink"><Starfield/>
  <div className="relative flex items-center gap-3"><Skeleton w={44} h={44}/><Skeleton w={90} h={30}/></div>
  <Skeleton h={50}/><Skeleton h="65%" radius={28}/></main>;
 if(query.error||!graph)return <main className="relative min-h-dvh bg-obsidian p-6 text-ink"><button className="min-h-11 text-amber" onClick={()=>navigate(-1)}>Back</button>
  <EmptyState art="plug" title="Couldn't open Atlas" body="Check your connection and retry."
   action={{label:'Try again',onClick:()=>{void query.refetch()}}}/></main>;
 return <main className="relative h-dvh min-h-[580px] overflow-hidden bg-obsidian text-ink" aria-label="Atlas">
  <Starfield/>
  {nodeList.length&&mode==='orbits'?<svg ref={svg} width="100%" height="100%" role="group"
    aria-label={'Interactive knowledge graph with '+nodeList.length+' concepts. Drag nodes to pin; pinch or use zoom buttons to explore.'}
    className="absolute inset-0 h-full w-full touch-none"
    onClick={event=>{if(event.target===event.currentTarget){hideSelection();setOrbitFocus(null)}}}>
   <defs>
    <radialGradient id="atlas-star"><stop offset="0%" stopColor="#FFF1C9"/><stop offset="45%" stopColor="#F7B538"/><stop offset="100%" stopColor="#D98E1C"/></radialGradient>
    <filter id="atlas-glow" x="-160%" y="-160%" width="420%" height="420%"><feGaussianBlur stdDeviation="7"/></filter>
    {graph.subjects.map(subject=><radialGradient key={subject.id} id={'nebula-'+subject.id}>
     <stop offset="0%" stopColor={'var(--'+subject.hue+')'} stopOpacity=".14"/>
     <stop offset="100%" stopColor={'var(--'+subject.hue+')'} stopOpacity="0"/>
    </radialGradient>)}
   </defs>
   <motion.g transform={'translate('+view.x+' '+view.y+') scale('+view.k+')'}
    initial={reduce?false:{opacity:0}} animate={{opacity:1}} transition={{duration:reduce?.15:1}}>
    {layout?.edges.map((edge,index)=>{
     const from=byId?.get(edge.fromId),to=byId?.get(edge.toId);
     if(!from||!to)return null;
     const a=positions[from.id]??from,b=positions[to.id]??to,highlighted=to.id===selectedId;
     return <motion.line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
      stroke={highlighted?'var(--amber)':'var(--ink)'} strokeOpacity={highlighted?.65:.15}
      strokeWidth={highlighted?1.5:1} strokeDasharray={edge.kind==='related'?'2 5':highlighted?'5 4':undefined}
      animate={highlighted&&!reduce?{strokeDashoffset:[10,0]}:{}} transition={{duration:1.4,repeat:Infinity,ease:'linear'}}
      pointerEvents="none"/>;
    })}
    {nodeList.map(node=><WorldNode key={node.id} node={node} position={positions[node.id]??node}
     zoomScale={view.k} selected={selectedId===node.id} dim={filtered(node)} reduce={reduce} showLabel={labels.has(node.id)}
     onSelect={selectNode} onDown={onNodeDown} onMove={onNodeMove} onUp={onNodeUp} onCancel={onNodeCancel}/>)}
    <OrbitRings graph={graph} nodes={nodeList.map(n=>({...n,...positions[n.id]}))} scale={view.k} onFocus={focusOrbit}/>
   </motion.g>
  </svg>:!nodeList.length?<div className="absolute inset-0 flex items-center justify-center"><EmptyState art="compass" title="Your Atlas is empty"
   body="Concepts will appear as you develop your study plans."/></div>:null}
  {nodeList.length&&mode!=='orbits'&&<AtlasListViews key={mode} graph={graph} mode={mode} filter={filter} selectedId={selectedId} onSelect={selectNode}/>}
  <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-obsidian via-obsidian/85 to-transparent px-5 pb-9 pt-[calc(20px+env(safe-area-inset-top))]">
   <div className="pointer-events-auto flex items-center gap-3">
    <button type="button" onClick={()=>navigate(-1)} aria-label="Back" className="glass flex size-11 items-center justify-center rounded-ctl text-ink-2"><ArrowLeft size={22}/></button>
    <h1 className="min-w-0 flex-1 text-title-s font-semibold tracking-tight">Atlas</h1>
    <button type="button" onClick={handleFit} aria-label="Fit all concepts" className="glass flex size-11 items-center justify-center rounded-ctl text-amber"><Waypoints size={22}/></button>
   </div>
   <div className="pointer-events-auto mt-3"><Segmented label="Atlas view" value={mode} onChange={changeMode}
    options={[{value:'orbits',label:'Orbits'},{value:'branches',label:'Branches'},{value:'outline',label:'Outline'}]}/></div>
   <div className="pointer-events-auto mt-3 flex gap-2 overflow-x-auto pb-2">
    <FilterPill label="All" count={countAll} active={filter==='all'} onClick={()=>setFilter('all')}/>
    <FilterPill label="Revisit" count={countRevisit} active={filter==='revisit'} icon={RotateCcw} onClick={()=>setFilter('revisit')}/>
    <FilterPill label="Demonstrated" count={countDone} active={filter==='demonstrated'} icon={Check} onClick={()=>setFilter('demonstrated')}/>
   </div>
  </header>
  {mode==='orbits'&&orbitFocus&&<nav aria-label="Atlas breadcrumb" className="glass absolute left-4 top-[212px] z-10 flex max-w-[calc(100%-32px)] items-center gap-2 overflow-x-auto rounded-ctl border border-edge px-3 py-1.5 text-label">
   <button type="button" className="min-h-9 shrink-0 text-amber" onClick={()=>{setOrbitFocus(null);handleFit()}}>All</button>
   <span aria-hidden="true" className="text-ink-3">›</span>
   <button type="button" className="min-h-9 shrink-0 text-amber" onClick={()=>focusOrbit(orbitFocus.subjectId)}>
    {graph.subjects.find(s=>s.id===orbitFocus.subjectId)?.name}
   </button>
   {orbitFocus.topicId&&<>
    <span aria-hidden="true" className="text-ink-3">›</span>
    <span className="min-w-0 truncate text-ink">{atlasOrbitGroups(graph,nodeList).find(g=>g.id===orbitFocus.subjectId)?.topics.find(t=>t.id===orbitFocus.topicId)?.name}</span>
   </>}
  </nav>}
  {mode==='orbits'&&nodeList.length>0&&!selected&&<AtlasMinimap nodes={nodeList.map(n=>({...n,...positions[n.id]}))} camera={view}
   width={svg.current?.clientWidth??390} height={svg.current?.clientHeight??844} onNavigate={navigateMinimap}/>}
  {mode==='orbits'&&<div className="glass absolute right-4 top-[46%] z-10 flex flex-col gap-0.5 rounded-ctl border border-edge-2 p-1">
   <button type="button" aria-label="Zoom in" onClick={()=>handleZoom(1.35)} className="flex size-11 items-center justify-center rounded-s text-ink"><Plus size={20}/></button>
   <button type="button" aria-label="Zoom out" onClick={()=>handleZoom(1/1.35)} className="flex size-11 items-center justify-center rounded-s text-ink"><Minus size={20}/></button>
   <button type="button" aria-label="Fit graph" onClick={handleFit} className="flex size-11 items-center justify-center rounded-s text-amber"><Compass size={19}/></button>
  </div>}
  <motion.div initial={reduce?false:{y:20,opacity:0}} animate={{y:0,opacity:1}} transition={{duration:reduce?.15:.55}}
   className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto max-w-[650px] rounded-t-sheet border border-edge-2 bg-glass-strong px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5 shadow-[var(--e-float)] backdrop-blur-[22px]">
   {!selected?<div className="flex min-h-11 items-center justify-center gap-2 text-body text-ink-3">
    <Waypoints size={17} className="text-amber"/>{nodeList.length?'Tap an idea':'Create a plan to grow your Atlas'}
   </div>:<>
    <div className="flex items-start gap-2">
     <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-2">
       <Chip tone={selected.status==='demonstrated'?'success':selected.status==='revisit'||selected.status==='in_progress'?'amber':'quiet'}>{names[selected.status]}</Chip>
       <span className="text-label text-ink-3">{graph.subjects.find(x=>x.id===selected.subjectId)?.name??'Mathematics'}</span>
      </div>
      <h2 className="text-title font-semibold">{selected.name}</h2>
     </div>
     <button type="button" onClick={hideSelection} aria-label="Close concept details" className="flex size-11 shrink-0 items-center justify-center rounded-ctl bg-fill-1 text-ink-2"><X size={20}/></button>
    </div>
    {selected.blurb&&<p className="mt-3 line-clamp-3 font-math text-headline leading-relaxed text-ink-soft">{selected.blurb}</p>}
    <div className="mt-4 flex flex-wrap items-center gap-2">
     {selected.checkpointRefs.slice(0,3).map(ref=><Chip key={ref.projectSlug+ref.code} tone="quiet">{ref.code}</Chip>)}
     <Chip tone="quiet">{selected.dueCards} due</Chip>
     {selected.pinX!==null&&selected.pinY!==null&&<Chip tone="quiet" icon={LockKeyhole}>Pinned</Chip>}
     {menuId===selected.id&&<button type="button" onClick={()=>unpinNode(selected)} disabled={pin.isPending}
       className="flex min-h-11 items-center gap-2 rounded-chip border border-amber-line bg-amber-tint px-3 text-label text-amber"><PinOff size={16}/>Unpin</button>}
    </div>
    <div className="mt-5 flex items-center gap-2">
     {selected.checkpointRefs[0]?<Link to={'/p/'+selected.checkpointRefs[0].projectSlug+'/cp/'+selected.checkpointRefs[0].code}
       className="lit flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-btn px-3 text-body font-semibold">
       Open checkpoint<ChevronRight size={18}/></Link>:
      <Button size="m" className="flex-1" disabled>Not in a checkpoint</Button>}
     <Link to={'/review/run?concept='+encodeURIComponent(selected.slug)}
      className="ghost flex min-h-[52px] items-center justify-center gap-1 rounded-btn px-4 text-label">
      Review {selected.dueCards}</Link>
    </div>
   </>}
  </motion.div>
 </main>;
}
