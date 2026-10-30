import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {MouseEvent as ReactMouseEvent} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {select} from 'd3-selection';
import {zoom,zoomIdentity} from 'd3-zoom';
import type {ZoomBehavior,ZoomTransform} from 'd3-zoom';
import {ArrowLeft,ChevronRight,Compass,Minus,MoreHorizontal,Plus,Search,X,MessageCircle} from 'lucide-react';
import {useAtlas} from '../../data/hooks';
import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import type {Body,Camera,Cosmos} from './cosmos';
import {ancestry,area,buildCosmos,childrenOf,fit,isOnScreen,levelLabel,miniProjection,projectedViewport} from './cosmos';

type Filter='all'|'revisit'|'demonstrated';
type Point={x:number;y:number};
const statusName={demonstrated:'Demonstrated',revisit:'Re-check due',in_progress:'In progress',not_started:'Not started'};
const labelClass='pointer-events-none absolute z-[2] max-w-[148px] -translate-x-1/2 text-center text-[12px] leading-tight text-ink';
function showStatus(body:Body){
 return body.level==='planet'||body.level==='moon';
}
function Geometry({body,scale,selected}:{body:Body;scale:number;selected:boolean}){
 const {radius:r,level,status}=body;
 const outline=showStatus(body)?status==='revisit'?'var(--hard)':status==='not_started'?'var(--ink-3)':'var(--amber)':'var(--ink-2)';
 const fill=status==='demonstrated'?'var(--amber)':'var(--obsidian)';
 const progress=body.total?body.done/body.total:0;
 const clusterArc=Math.max(r*.7,r-6/scale),smallArc=Math.max(r*.7,r-4/scale);
 return <g>
  {level==='cluster'&&<><circle r={r} fill="var(--amber)" fillOpacity=".035" stroke="var(--edge-3)" strokeWidth={1/scale} strokeDasharray={`${12/scale} ${14/scale}`}/>
   <circle r={clusterArc} fill="none" stroke="var(--amber)" strokeWidth={Math.min(3/scale,r*.2)} strokeDasharray={`${2*Math.PI*clusterArc*progress} ${2*Math.PI*clusterArc}`} transform="rotate(-90)"/></>}
  {level==='galaxy'&&<><circle r={r} fill="var(--amber)" fillOpacity=".04" stroke="var(--edge-3)" strokeWidth={1/scale}/>
   <path d={`M ${-r*.6} 0 Q ${-r*.35} ${-r*.8} ${r*.1} ${-r*.25} Q ${r*.8} ${r*.25} ${r*.55} ${r*.65}`}
    fill="none" stroke="var(--amber)" strokeOpacity=".55" strokeWidth={5/scale} strokeLinecap="round"/>
   <path d={`M ${r*.6} 0 Q ${r*.35} ${r*.8} ${-r*.1} ${r*.25} Q ${-r*.8} ${-r*.25} ${-r*.55} ${-r*.65}`}
    fill="none" stroke="var(--ink-3)" strokeWidth={2/scale} strokeDasharray={`${4/scale} ${4/scale}`}/></>}
  {level==='system'&&<><circle r={r} fill="var(--amber)" fillOpacity=".035" stroke="var(--edge-3)" strokeWidth={1/scale}/>
   <ellipse rx={r*.9} ry={r*.3} fill="none" stroke="var(--amber)" strokeOpacity=".45" strokeWidth={1.5/scale} transform="rotate(-25)"/>
   <path d={`M 0 ${-r*.36} L ${r*.12} ${-r*.1} L ${r*.37} 0 L ${r*.12} ${r*.1} L 0 ${r*.36} L ${-r*.12} ${r*.1} L ${-r*.37} 0 L ${-r*.12} ${-r*.1} Z`}
    fill="var(--amber)" stroke="var(--ink)" strokeWidth={1/scale}/></>}
  {(level==='planet'||level==='moon')&&<>
   <circle r={r} fill={status==='in_progress'?'var(--obsidian)':fill} stroke={outline}
    strokeWidth={(status==='revisit'||status==='in_progress'?3:1.5)/scale} strokeDasharray={status==='revisit'?`${5/scale} ${3/scale}`:undefined}/>
   {body.isStar&&<circle r={r*.34} fill="var(--amber)" opacity=".65"/>}
  </>}
  {selected&&<circle r={r+6/scale} fill="none" stroke="var(--amber)" strokeWidth={2/scale}/>}
  {(level==='galaxy'||level==='system')&&<circle r={smallArc} fill="none" stroke="var(--amber)" strokeWidth={Math.min(2/scale,r*.2)}
   strokeDasharray={`${2*Math.PI*smallArc*progress} ${2*Math.PI*smallArc}`} transform="rotate(-90)"/>}
 </g>;
}
function BodyMark({body,view,selected,dim,onSelect,onEnter}:{
 body:Body;view:Camera;selected:boolean;dim:boolean;onSelect:(id:string)=>void;onEnter:(id:string)=>void;
}){
 return <g data-body={body.id} data-level={body.level} transform={`translate(${body.x} ${body.y})`}
  role="button" tabIndex={0} aria-label={plainMath(body.name)+', '+levelLabel(body.level)}
  aria-pressed={selected} opacity={dim?.2:1} style={{cursor:'pointer',outline:'none'}}
  onClick={event=>{event.stopPropagation();onSelect(body.id)}}
  onDoubleClick={event=>{event.stopPropagation();if(body.children.length)onEnter(body.id);else onSelect(body.id)}}
  onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(body.id)}}}>
  <circle r={Math.max(body.radius,22/view.k)} fill="transparent" stroke="none" data-hit-area="44"/>
  <Geometry body={body} scale={view.k} selected={selected}/>
 </g>;
}
function Minimap({model,parentId,view,width,height,onNavigate}:{
 model:Cosmos;parentId:string|null;view:Camera;width:number;height:number;onNavigate:(point:Point)=>void;
}){
 const siblings=childrenOf(model,parentId);
 const projection=miniProjection(area(siblings,12));
 const visible=projectedViewport(view,width,height,projection);
 const bounds=area(siblings,12);
 const drag=useRef<number|null>(null);
 const navigate=(element:HTMLButtonElement,clientX:number,clientY:number)=>{
  const rect=element.getBoundingClientRect(),x=(clientX-rect.left)*96/rect.width,y=(clientY-rect.top)*96/rect.height;
  onNavigate({x:(x-projection.x)/projection.k,y:(y-projection.y)/projection.k});
 };
 return <button type="button" aria-label="Move Atlas viewport" data-minimap="true"
  className="absolute bottom-[86px] right-3 z-10 size-24 touch-none overflow-hidden rounded-ctl border border-edge-2 bg-raised shadow-[var(--e-card)]"
  onPointerDown={e=>{drag.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);navigate(e.currentTarget,e.clientX,e.clientY)}}
  onPointerMove={e=>{if(drag.current===e.pointerId)navigate(e.currentTarget,e.clientX,e.clientY)}}
  onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
  onPointerCancel={()=>{drag.current=null}}>
  <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
   <defs><clipPath id="atlas-mini-clip"><rect x="0" y="0" width="96" height="96"/></clipPath></defs>
   <g clipPath="url(#atlas-mini-clip)">
    <rect width="96" height="96" fill="var(--obsidian)"/>
    {siblings.map(b=><circle key={b.id} cx={projection.x+b.x*projection.k} cy={projection.y+b.y*projection.k}
     r={Math.max(2,b.radius*projection.k)} fill="var(--amber)" fillOpacity=".2" stroke="var(--ink-3)" strokeWidth=".6"/>)}
    <rect data-minimap-viewport="true" x={visible.x} y={visible.y} width={visible.width} height={visible.height}
     fill="var(--amber)" fillOpacity=".10" stroke="var(--amber)" strokeWidth="1.2"/>
   </g>
   <title>Parent map; ${Math.round(bounds.maxX-bounds.minX)} world units wide</title>
  </svg>
 </button>;
}
export default function Page(){
 const navigate=useNavigate(),[params,setParams]=useSearchParams(),toast=useToast();
 const query=useAtlas(),graph=query.data;
 const model=useMemo(()=>graph?buildCosmos(graph):null,[graph]);
 const svg=useRef<SVGSVGElement>(null),zoomRef=useRef<ZoomBehavior|null>(null),flight=useRef<number|null>(null);
 const viewRef=useRef<Camera>({x:0,y:0,k:1}),userMoved=useRef(false);
 const [view,setView]=useState<Camera>(viewRef.current);
 const [size,setSize]=useState({width:390,height:680});
 const [parentId,setParentId]=useState<string|null>(null),[selectedId,setSelectedId]=useState<string|null>(null);
 const [filter,setFilter]=useState<Filter>('all'),[menu,setMenu]=useState(false),[searchOpen,setSearchOpen]=useState(false),[search,setSearch]=useState('');
 const current=model?.bodies.get(parentId??'')??null;
 const currentRef=useRef<string|null>(null),lastSemantic=useRef(0);
 currentRef.current=current?.id??null;
 const children=useMemo(()=>model?childrenOf(model,current?.id??null):[],[model,current?.id]);
 const displayed=useMemo(()=>children.filter(b=>isOnScreen(b,view,size.width,size.height)),[children,view,size]);
 const selected=selectedId?model?.bodies.get(selectedId):null;
 const path=model?ancestry(model,current?.id??null):[];
 const focusSlug=params.get('focus');
 const focusNode=useCallback((id:string|null,fitCamera=true,animate=true)=>{
  if(!model)return;
  const node=id?model.bodies.get(id):null;
  setParentId(node?.id??null);
  if(!fitCamera||!svg.current||!zoomRef.current)return;
  const el=svg.current,behavior=zoomRef.current;
  const nodes=childrenOf(model,node?.id??null);
  const rect=el.getBoundingClientRect(),camera=fit(area(nodes),rect.width,rect.height);
  userMoved.current=true;
  if(flight.current!==null){cancelAnimationFrame(flight.current);flight.current=null}
  const setCamera=(next:Camera)=>select(el).call(behavior.transform,
   zoomIdentity.translate(next.x,next.y).scale(next.k));
  if(!animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   setCamera(camera);return;
  }
  const start={...viewRef.current},began=performance.now();
  const frame=(now:number)=>{
   const progress=Math.min(1,(now-began)/220),ease=1-Math.pow(1-progress,3);
   setCamera({x:start.x+(camera.x-start.x)*ease,y:start.y+(camera.y-start.y)*ease,
    k:Math.exp(Math.log(start.k)+(Math.log(camera.k)-Math.log(start.k))*ease)});
   if(progress<1)flight.current=requestAnimationFrame(frame);else flight.current=null;
  };
  flight.current=requestAnimationFrame(frame);
 },[model]);
 const setSelection=useCallback((id:string|null)=>{
  setSelectedId(id);
  const next=new URLSearchParams(params);
  if(id&&model?.bodies.get(id)?.slug)next.set('focus',model.bodies.get(id)!.slug);
  else next.delete('focus');
  setParams(next,{replace:true});
 },[model,params,setParams]);
 const inspect=(id:string)=>{
  const body=model?.bodies.get(id);if(!body)return;
  setSelection(id);
  if(body.children.length)focusNode(id);
 };
 const zoomAt=useCallback((factor:number)=>{
  if(svg.current&&zoomRef.current)select(svg.current).call(zoomRef.current.scaleBy,factor);
 },[]);
 const fitUniverse=useCallback(()=>{setSelection(null);focusNode(null,true,false)},[focusNode,setSelection]);
 useEffect(()=>{
  if(!svg.current||!model)return;
  const el=svg.current;
  const behavior=zoom<SVGSVGElement,unknown>()
   .scaleExtent([1e-12,Math.max(1,el.clientWidth)/(6*7)])
   .filter(event=>event.type==='wheel'||event.type.startsWith('touch')||event.type==='dblclick'||!(event.target instanceof Element&&event.target.closest('[data-body]')))
   .on('zoom',event=>{
    const t=event.transform as ZoomTransform;
    const camera={x:t.x,y:t.y,k:t.k};viewRef.current=camera;setView(camera);
    if(event.sourceEvent){
     if(flight.current!==null){cancelAnimationFrame(flight.current);flight.current=null}
     userMoved.current=true;
     // Semantic zoom changes only the visible level, never the camera.
     if(Date.now()-lastSemantic.current>220){
      const active=currentRef.current,body=active?model.bodies.get(active):null;
      const target=childrenOf(model,active);
      const worldCenter={x:(el.clientWidth/2-camera.x)/camera.k,y:(el.clientHeight/2-camera.y)/camera.k};
      const closest=target.reduce<Body|null>((best,b)=>!best||
       Math.hypot(b.x-worldCenter.x,b.y-worldCenter.y)<Math.hypot(best.x-worldCenter.x,best.y-worldCenter.y)?b:best,null);
      if(body&&body.radius*camera.k<35){
       lastSemantic.current=Date.now();setParentId(body.parentId);
      }else if(closest&&closest.children.length&&closest.radius*camera.k>115){
       lastSemantic.current=Date.now();setParentId(closest.id);
      }
     }
    }
   });
  zoomRef.current=behavior;
  const selection=select(el).call(behavior);
  selection.on('dblclick.zoom',null);
  const resize=new ResizeObserver(()=>{
   const rect=el.getBoundingClientRect();
   if(!rect.width||!rect.height)return;
   setSize({width:rect.width,height:rect.height});
   behavior.scaleExtent([1e-12,Math.max(1,rect.width)/(6*7)]);
   if(!userMoved.current){
    const camera=fit(area(childrenOf(model,null)),rect.width,rect.height);
    selection.call(behavior.transform,zoomIdentity.translate(camera.x,camera.y).scale(camera.k));
   }
  });
  resize.observe(el);
  const rect=el.getBoundingClientRect();
  if(rect.width&&rect.height){
   setSize({width:rect.width,height:rect.height});
   const camera=fit(area(childrenOf(model,null)),rect.width,rect.height);
   selection.call(behavior.transform,zoomIdentity.translate(camera.x,camera.y).scale(camera.k));
  }
  return()=>{if(flight.current!==null)cancelAnimationFrame(flight.current);flight.current=null;resize.disconnect();selection.on('.zoom',null);zoomRef.current=null};
 },[model]);
 useEffect(()=>{
  if(!model||!focusSlug)return;
  const found=[...model.bodies.values()].find(b=>b.slug===focusSlug);
  if(!found||selectedId===found.id)return;
  setSelectedId(found.id);
  focusNode(found.parentId);
 },[model,focusSlug,focusNode,selectedId]);
 const navigateMinimap=(point:Point)=>{
  if(!svg.current||!zoomRef.current)return;
  const k=viewRef.current.k;userMoved.current=true;
  select(svg.current).call(zoomRef.current.transform,
   zoomIdentity.translate(size.width/2-point.x*k,size.height/2-point.y*k).scale(k));
 };
 const externalLinks=useMemo(()=>{
  if(!model||!selected)return [];
  return model.links.filter(l=>l.fromId===selected.id||l.toId===selected.id).map(l=>({
   ...l,other:model.bodies.get(l.fromId===selected.id?l.toId:l.fromId),direction:l.toId===selected.id?'Builds on':'Unlocks'
  })).filter(l=>!!l.other);
 },[model,selected]);
 const result=useMemo(()=>model?[...model.bodies.values()].filter(b=>b.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).slice(0,30):[],[model,search]);
 const showLabel=(b:Body)=>b.radius*view.k>=44&&b.radius*view.k<=size.width/2;
 const selectFromSearch=(b:Body)=>{setSearchOpen(false);setSearch('');focusNode(b.parentId);setSelection(b.id)};
 const onBlank=(event:ReactMouseEvent<SVGSVGElement>)=>{
  if((event.target as Element).closest('[data-body]'))return;
  if(selectedId)setSelection(null);
  else if(current)focusNode(current.parentId);
 };
 if(query.isPending)return <main aria-label="Atlas" className="h-dvh bg-obsidian p-4"><Skeleton h={52}/><div className="mt-5"><Skeleton h="65%"/></div></main>;
 if(query.error||!graph||!model)return <main aria-label="Atlas" className="h-dvh bg-obsidian p-4">
  <button type="button" className="min-h-11" onClick={()=>navigate(-1)}>Back</button>
  <EmptyState art="plug" title="Could not open Atlas" body="Check your connection." action={{label:'Try again',onClick:()=>void query.refetch()}}/></main>;
 return <main aria-label="Atlas" className="relative h-dvh min-h-[540px] overflow-hidden text-ink">
  <header className="absolute inset-x-0 top-0 z-20 border-b border-edge bg-obsidian/95 px-3 pt-[env(safe-area-inset-top)]">
   <div className="flex h-14 items-center gap-2">
    <button type="button" aria-label="Back" onClick={()=>navigate(-1)} className="flex size-11 items-center justify-center rounded-ctl"><ArrowLeft size={19}/></button>
    <h1 className="flex-1 font-serif text-title-s">Atlas</h1>
    <button type="button" aria-label="Find an idea" onClick={()=>{setSearchOpen(v=>!v);setMenu(false)}} className="flex size-11 items-center justify-center rounded-ctl"><Search size={19}/></button>
    <button type="button" aria-label="Atlas menu" aria-expanded={menu} onClick={()=>{setMenu(v=>!v);setSearchOpen(false)}} className="flex size-11 items-center justify-center rounded-ctl"><MoreHorizontal size={21}/></button>
   </div>
   {path.length>0&&<nav aria-label="Atlas breadcrumb" className="flex max-w-full items-center gap-1 overflow-x-auto pb-2 text-label">
    <button type="button" onClick={()=>{setSelection(null);focusNode(null)}} className="shrink-0 text-amber">Universe</button>
    {path.map(b=><span key={b.id} className="flex shrink-0 items-center gap-1"><ChevronRight size={13}/>
     <button type="button" onClick={()=>{setSelection(null);focusNode(b.id)}} className="max-w-36 truncate" aria-label={'Go to '+plainMath(b.name)}><Tex source={b.name}/></button>
    </span>)}
   </nav>}
   {searchOpen&&<div className="absolute inset-x-3 top-full z-30 rounded-b-ctl border border-edge-2 bg-raised p-3 shadow-[var(--e-float)]">
    <input autoFocus aria-label="Find an idea" placeholder="Find an idea" value={search} onChange={e=>setSearch(e.target.value)}
     className="min-h-11 w-full rounded-ctl border border-edge bg-obsidian px-3 text-body"/>
    <div className="max-h-60 overflow-auto">{search.trim()&&result.map(b=><button type="button" key={b.id} onClick={()=>selectFromSearch(b)}
     className="flex min-h-11 w-full flex-col justify-center border-b border-edge px-2 text-left">
     <Tex source={b.name} className="text-body"/><span className="text-caption text-ink-3">{levelLabel(b.level)}</span>
    </button>)}</div>
   </div>}
   {menu&&<div className="absolute right-3 top-full z-30 min-w-[190px] rounded-ctl border border-edge-2 bg-raised p-2 shadow-[var(--e-float)]">
    {(['all','revisit','demonstrated'] as Filter[]).map(f=><button key={f} type="button" aria-pressed={filter===f} onClick={()=>{setFilter(f);setMenu(false)}}
     className="block min-h-11 w-full rounded-s px-3 text-left text-body">{f==='all'?'All ideas':f==='revisit'?'Revisit':'Demonstrated'} {filter===f?'✓':''}</button>)}
   </div>}
  </header>
  <div className="absolute inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] top-[calc(56px+env(safe-area-inset-top))]" data-atlas-stage="true">
   <svg ref={svg} width="100%" height="100%" role="group" aria-label="Interactive knowledge cosmos"
    className="absolute inset-0 h-full w-full touch-none" onClick={onBlank}
    onDoubleClick={e=>{if(e.target===e.currentTarget)zoomAt(1.8)}}>
    <g data-atlas-camera="true" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
     {selected&&externalLinks.filter(l=>l.other&&children.some(b=>b.id===l.other!.id)&&children.some(b=>b.id===selected.id)).map(l=>{
      const other=l.other!;const midpoint={x:(other.x+selected.x)/2,y:(other.y+selected.y)/2-Math.hypot(other.x-selected.x,other.y-selected.y)*.18};
      return <path key={l.fromId+'|'+l.toId} data-selected-link="true" d={`M${selected.x},${selected.y} Q${midpoint.x},${midpoint.y} ${other.x},${other.y}`}
       fill="none" stroke="var(--amber)" strokeWidth={1.5/view.k} strokeDasharray={`${5/view.k} ${4/view.k}`} pointerEvents="none"/>;
     })}
     {displayed.map(b=><BodyMark key={b.id} body={b} view={view} selected={selectedId===b.id}
      dim={selectedId!==b.id&&filter!=='all'&&b.status!==filter} onSelect={inspect} onEnter={id=>focusNode(id)}/>)}
     {displayed.flatMap(b=>b.children.slice(0,30).map(childId=>model.bodies.get(childId)!).filter(Boolean)
       .filter(child=>isOnScreen(child,view,size.width,size.height)&&child.radius*view.k<44))
       .map(dot=><circle key={'small-'+dot.id} data-descendant="true" cx={dot.x} cy={dot.y} r={Math.max(1,Math.min(dot.radius,4/view.k))}
        fill="var(--amber)" fillOpacity=".36" pointerEvents="none"/>)}
    </g>
   </svg>
   <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    {displayed.filter(showLabel).map(b=><div key={b.id} data-atlas-label={b.id} className={labelClass}
     style={{left:view.x+b.x*view.k,top:view.y+b.y*view.k+Math.max(12,b.radius*view.k)+6,
      display:showLabel(b)?'block':'none'}}>
     <Tex source={b.name} className="text-label font-semibold"/>
     {(b.level==='cluster'||b.level==='galaxy'||b.level==='system')&&<div className="text-caption text-ink-3">{b.done} of {b.total} ideas</div>}
    </div>)}
   </div>
   {children.length===0&&<div className="pointer-events-none absolute inset-0 flex items-center justify-center text-ink-3">No ideas here</div>}
   {!selected&&children.length>0&&<>
    <div className="absolute bottom-[86px] right-[114px] z-10 flex flex-col rounded-ctl border border-edge bg-raised shadow-[var(--e-card)]">
     <button type="button" aria-label="Zoom in" onClick={()=>zoomAt(1.4)} className="flex size-11 items-center justify-center"><Plus size={18}/></button>
     <button type="button" aria-label="Zoom out" onClick={()=>zoomAt(1/1.4)} className="flex size-11 items-center justify-center"><Minus size={18}/></button>
     <button type="button" aria-label="Fit graph" onClick={fitUniverse} className="flex size-11 items-center justify-center"><Compass size={18}/></button>
    </div>
    <Minimap model={model} parentId={current?.id??null} view={view} width={size.width} height={size.height} onNavigate={navigateMinimap}/>
   </>}
  </div>
  {selected&&<section data-atlas-details="true" aria-label="Idea details"
   className="absolute inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 mx-auto max-h-[49dvh] max-w-[600px] overflow-y-auto rounded-t-sheet border border-edge-2 bg-raised px-4 pb-4 pt-2 shadow-[var(--e-float)]"
   onTouchStart={e=>{(e.currentTarget as HTMLElement).dataset.touchY=String(e.touches[0].clientY)}}
   onTouchEnd={e=>{const start=Number(e.currentTarget.dataset.touchY);if(e.changedTouches[0].clientY-start>90)setSelection(null)}}>
   <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-edge-3"/>
   <div className="flex items-start gap-2">
    <div className="min-w-0 flex-1"><div className="text-caption text-ink-3">{levelLabel(selected.level)} · {statusName[selected.status]}</div>
     <h2 className="font-serif text-title-s"><Tex source={selected.name}/></h2></div>
    <button type="button" aria-label="Close concept details" onClick={()=>setSelection(null)} className="flex size-11 shrink-0 items-center justify-center"><X size={20}/></button>
   </div>
   {selected.blurb&&<Tex source={selected.blurb} className="mt-2 text-body text-ink-soft"/>}
   {selected.total>0&&<p className="mt-2 text-caption text-ink-3">{selected.done} of {selected.total} ideas demonstrated</p>}
   <div className="mt-2 flex flex-wrap gap-2 text-label text-ink-2">
    {selected.checkpointRefs.map(ref=><Link key={ref.projectSlug+ref.code} className="rounded-s border border-edge px-2 py-2" to={'/p/'+ref.projectSlug+'/cp/'+ref.code}>Checkpoint {ref.code}</Link>)}
    {selected.dueCards>0&&<span className="px-2 py-2">{selected.dueCards} cards due</span>}
   </div>
   {selected.children.length>0&&<div className="mt-3"><div className="text-caption font-semibold text-ink-3">Explore within</div>
    <div className="grid grid-cols-2 gap-1">{childrenOf(model,selected.id).map(child=><button type="button" key={child.id}
     className="min-h-11 truncate rounded-ctl border border-edge px-2 text-left text-label" onClick={()=>inspect(child.id)}>
     <Tex source={child.name}/></button>)}</div>
   </div>}
   {externalLinks.length>0&&<div className="mt-3"><div className="text-caption font-semibold text-ink-3">Connections</div>
    {externalLinks.slice(0,8).map(l=><button key={l.fromId+l.toId} type="button"
     className="flex min-h-11 w-full items-center gap-2 border-b border-edge text-left text-label"
     onClick={()=>{const target=l.other!;focusNode(target.parentId);setSelection(target.id)}}>
     <span className="shrink-0 text-ink-3">{l.direction}</span><span className="min-w-0 flex-1 truncate"><Tex source={l.other!.name}/></span><ChevronRight size={14}/></button>)}
   </div>}
   <Link to={'/review/run?concept='+encodeURIComponent(selected.slug)} className="mt-3 flex min-h-11 items-center justify-center rounded-btn border border-edge-2 text-body">Review {selected.dueCards}</Link>
   <button type="button" className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-btn border border-edge-2 text-body"
    onClick={()=>{void navigator.clipboard.writeText('Quiz me in chat on '+selected.name).then(()=>toast('Quiz prompt copied')).catch(()=>toast('Could not copy prompt'))}}>
    <MessageCircle size={16}/>Quiz me in chat</button>
  </section>}
  {model.roots.length===0&&<div className="absolute inset-0 z-10 flex items-center justify-center"><EmptyState art="compass" title="Your Atlas is empty" body="Ideas appear here as your plans grow."/></div>}
 </main>;
}
