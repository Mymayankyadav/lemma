import {useStudyUi} from '../../../data/StudyUiRelease';
import {useEffect,useImperativeHandle,useRef,useState,type Ref} from 'react';
import {durations} from '../../../ui/v7/motion';
import type {LayoutResult} from './layout';
import type {LayoutSource} from './layoutClient';
import {subjectToken,type AtlasModel} from './model';
import {TYPED_LINK_STYLE,type TypedEdge} from './typedLinks';
import {AtlasScene,MAX_ZOOM,MIN_ZOOM,type Camera,type Insets,type ScenePalette} from './scene';

export interface AtlasCamera{camera:Camera;labelCluster:number|null}
export interface AtlasMapHandle{
 recentre():void;zoomBy(factor:number):void;flyTo(index:number,inspectorHeight?:number):void;flyToCluster(cluster:number):void;
 camera():AtlasCamera|null;restoreCamera(view:AtlasCamera):void;
}
interface Props{
 focusCluster?:number|null;focusSelected?:boolean;highlighted?:readonly number[]|null;
 model:AtlasModel; layout:LayoutResult; source:LayoutSource; selected:number|null; reduced:boolean; paused?:boolean; insets:Insets;
 /** N220: where floating controls cover the map; labels keep out without changing the framing. */
 labelMargin?:Insets;
 onSelect:(index:number|null)=>void; onPan?:(panning:boolean)=>void; ref?:Ref<AtlasMapHandle>;
 /** N227: Atlas V3 typed links to draw (the Layers sheet's Typed links). */
 typedLinks?:readonly TypedEdge[];
}
const DOUBLE_TAP_MS=300,TAP_SLOP=6;
const zoomDuration=()=>durations.layout*1000;
export function cameraFlight(from:Camera,to:Camera,width:number,height:number){
 const distance=Math.hypot((to.x-from.x)*from.k/Math.max(width,1),(to.y-from.y)*from.k/Math.max(height,1),Math.log2(to.k/from.k)*.25);
 const min=durations.cameraMin*1000,max=durations.cameraMax*1000;
 return {duration:distance<=1?min+60*distance:Math.min(max,min+60+(max-min-60)*(distance-1)/2),long:distance>1};
}

function readPalette(element:Element,model:AtlasModel):ScenePalette{
 const css=getComputedStyle(element),token=(name:string)=>css.getPropertyValue(name).trim();
 const night=document.documentElement.dataset.theme==='graph-night';
 return {night,sky:token('--v7-role-surface-sunken'),grid:token('--v7-role-border-subtle'),dust:token('--v7-role-text-primary'),
  text:token('--v7-role-text-primary'),textSecondary:token('--v7-role-text-secondary'),mark:token('--v7-role-border-default'),
  link:token('--v7-role-border-default'),selection:token('--v7-role-selection-fg'),focus:token('--v7-role-focus-ring'),
  warning:token('--v7-role-status-warning'),sans:token('--v7-sans')||'sans-serif',
  subjects:model.clusters.reduce<string[]>((list,cluster)=>{list[cluster.index]=token(subjectToken(cluster.subject));return list;},[]),
  kinds:Object.fromEntries(Object.entries(TYPED_LINK_STYLE).map(([kind,style])=>[kind,token(style.token)]))};
}
const ease=(t:number)=>1-Math.pow(1-t,3);

/** The Atlas sky: canvas only, hidden from assistive technology (the List view is the accessible path). */
const NO_MARGIN:Insets={top:0,right:0,bottom:0,left:0};
const NO_LINKS:readonly TypedEdge[]=[];
export default function AtlasMap({model,layout,source,selected,reduced,paused=false,insets,labelMargin=NO_MARGIN,onSelect,onPan,ref,focusCluster=null,focusSelected=true,highlighted=null,typedLinks=NO_LINKS}:Props){
 const studyRepair=useStudyUi();
 const wrap=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),scene=useRef<AtlasScene|null>(null);
 const frame=useRef(0),animation=useRef<{from:Camera;to:Camera;start:number;duration:number;fadeIn:number;fadeOut:number}|null>(null);
 const [zoom,setZoom]=useState(1);
 const latest=useRef({onSelect,onPan,reduced,paused});latest.current={onSelect,onPan,reduced,paused};
 const paint=()=>{
  if(frame.current||latest.current.paused)return;
  frame.current=requestAnimationFrame(now=>{
   frame.current=0;const current=scene.current;if(!current||latest.current.paused)return;
   const motion=animation.current;
   if(motion){
    const elapsed=Math.max(0,now-motion.start),t=Math.min(1,elapsed/motion.duration),e=ease(t);
    current.camera={x:motion.from.x+(motion.to.x-motion.from.x)*e,y:motion.from.y+(motion.to.y-motion.from.y)*e,k:motion.from.k*Math.pow(motion.to.k/motion.from.k,e)};
    current.labelOpacity=motion.fadeIn?Math.max(0,1-elapsed/motion.fadeOut,Math.min(1,(elapsed-motion.duration)/motion.fadeIn)):1;
    if(elapsed<motion.duration+motion.fadeIn)paint();
    else{animation.current=null;wrap.current?.removeAttribute('data-camera-moving');}
   }
   current.draw();wrap.current?.setAttribute('data-drawn-extent',String(current.drawnExtent()));setZoom(Math.round(current.camera.k*100)/100);
  });
 };
 const cancelFlight=()=>{
  animation.current=null;wrap.current?.removeAttribute('data-camera-moving');
  if(scene.current)scene.current.labelOpacity=1;
 };
 const moveTo=(to:Camera,fixedDuration?:number)=>{
  const current=scene.current;if(!current||latest.current.paused)return;
  const from={...current.camera},box=wrap.current?.getBoundingClientRect();
  const {duration,long}=fixedDuration!==undefined?{duration:fixedDuration,long:false}:cameraFlight(from,to,box?.width??1,box?.height??1);
  cancelFlight();
  if(latest.current.reduced||duration<=0||from.x===to.x&&from.y===to.y&&from.k===to.k)current.camera=to;
  else{
   animation.current={from,to,start:performance.now(),duration,fadeIn:long?durations.quick*1000:0,fadeOut:long?durations.instant*1000:0};
   wrap.current?.setAttribute('data-camera-moving',String(Math.round(duration)));
  }
  paint();
 };
 useImperativeHandle(ref,()=>({
  recentre:()=>{const current=scene.current;if(current)moveTo(focusCluster!==null?current.clusterCamera(focusCluster):current.fitCamera());},
  zoomBy:factor=>{const current=scene.current,box=wrap.current?.getBoundingClientRect();if(current&&box)moveTo(current.zoomCamera(box.width/2,box.height/2,factor),zoomDuration());},
  flyToCluster:cluster=>{const current=scene.current;if(current){current.labelCluster=cluster;moveTo(current.clusterCamera(cluster));}},
  flyTo:(index,inspectorHeight)=>{const current=scene.current;if(current)moveTo(inspectorHeight===undefined?current.focusCamera(index):current.revealCamera(index,inspectorHeight));},
  camera:()=>scene.current?{camera:{...scene.current.camera},labelCluster:scene.current.labelCluster}:null,
  restoreCamera:({camera,labelCluster})=>{if(scene.current)scene.current.labelCluster=labelCluster;moveTo(camera);},
 }));
 // One scene per model and layout; theme and size changes only update it.
 useEffect(()=>{
  const element=canvas.current,box=wrap.current;if(!element||!box)return;
  const created=new AtlasScene(element,model,layout,readPalette(box,model));
  created.strongEdges=studyRepair;
  scene.current=created;created.setInsets(insets);created.labelMargin=labelMargin;created.select(selected);created.labelCluster=focusCluster;created.highlighted=highlighted?new Set(highlighted):null;created.typedLinks=typedLinks;
  const measure=()=>{const rect=box.getBoundingClientRect();created.setSize(rect.width,rect.height,Math.min(2,window.devicePixelRatio||1));};
  measure();
  created.camera=focusSelected&&selected!==null?created.focusCamera(selected,1.4):focusCluster!==null?created.clusterCamera(focusCluster):created.fitCamera();
  paint();
  const resize=new ResizeObserver(()=>{if(!latest.current.paused){measure();paint();}});resize.observe(box);
  const theme=new MutationObserver(()=>{created.setPalette(readPalette(box,model));paint();});
  theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-contrast']});
  return ()=>{resize.disconnect();theme.disconnect();cancelFlight();cancelAnimationFrame(frame.current);frame.current=0;scene.current=null;};
  // Selection and insets are applied by their own effects below.
 },[model,layout,focusCluster,focusSelected,studyRepair]);
 useEffect(()=>{if(scene.current){scene.current.highlighted=highlighted?new Set(highlighted):null;paint();}},[highlighted]);
 useEffect(()=>{if(scene.current){scene.current.typedLinks=typedLinks;paint();}},[typedLinks]);
 useEffect(()=>{scene.current?.setInsets(insets);paint();},[insets.top,insets.right,insets.bottom,insets.left]);
 useEffect(()=>{if(scene.current){scene.current.labelMargin=labelMargin;paint();}},[labelMargin.top,labelMargin.right,labelMargin.bottom,labelMargin.left]);
 useEffect(()=>{scene.current?.select(selected);paint();},[selected]);
 useEffect(()=>{
  if(paused){cancelAnimationFrame(frame.current);frame.current=0;cancelFlight();return;}
  const rect=wrap.current?.getBoundingClientRect();
  if(rect)scene.current?.setSize(rect.width,rect.height,Math.min(2,window.devicePixelRatio||1));
  paint();
 },[paused]);
 useEffect(()=>{
  const motion=animation.current,current=scene.current;
  if(reduced&&current&&motion){current.camera=motion.to;cancelFlight();paint();}
 },[reduced]);
 // Pointer gestures: drag to pan, pinch to zoom, tap to select, double tap to zoom in.
 useEffect(()=>{
  const element=canvas.current;if(!element||paused)return;
  const pointers=new Map<number,{x:number;y:number}>();
  let panTimer:ReturnType<typeof setTimeout>|undefined;
  const pan=()=>{
   latest.current.onPan?.(true);
   clearTimeout(panTimer);
   panTimer=setTimeout(()=>latest.current.onPan?.(false),1500);
  };
  let start:{x:number;y:number;time:number}|null=null,moved=false,lastTap:{x:number;y:number;time:number}|null=null,pinch:{distance:number;x:number;y:number}|null=null;
  const local=(event:PointerEvent|WheelEvent)=>{const rect=element.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};};
  const pinchState=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
  const down=(event:PointerEvent)=>{
   element.setPointerCapture?.(event.pointerId);cancelFlight();paint();
   const point=local(event);pointers.set(event.pointerId,point);
   if(pointers.size===1){start={...point,time:performance.now()};moved=false;}
   if(pointers.size===2){pinch=pinchState();moved=true;}
  };
  const move=(event:PointerEvent)=>{
   const previous=pointers.get(event.pointerId),current=scene.current;if(!previous||!current)return;
   const point=local(event);pointers.set(event.pointerId,point);
   if(pointers.size===2&&pinch){
    const next=pinchState(),camera=current.zoomCamera(next.x,next.y,next.distance/Math.max(1,pinch.distance));
    camera.x-=(next.x-pinch.x)/camera.k;camera.y-=(next.y-pinch.y)/camera.k;current.camera=camera;pinch=next;pan();paint();return;
   }
   if(start&&Math.hypot(point.x-start.x,point.y-start.y)>TAP_SLOP)moved=true;
   if(moved){pan();current.camera={...current.camera,x:current.camera.x-(point.x-previous.x)/current.camera.k,y:current.camera.y-(point.y-previous.y)/current.camera.k};paint();}
  };
  const up=(event:PointerEvent)=>{
   const point=local(event),wasTap=pointers.size===1&&!moved;
   pointers.delete(event.pointerId);if(pointers.size<2)pinch=null;
   if(!wasTap||!scene.current)return;
   const now=performance.now();
   if(lastTap&&now-lastTap.time<DOUBLE_TAP_MS&&Math.hypot(point.x-lastTap.x,point.y-lastTap.y)<24){
    lastTap=null;moveTo(scene.current.zoomCamera(point.x,point.y,2),zoomDuration());return;
   }
   lastTap={...point,time:now};
   latest.current.onSelect(scene.current.hitTest(point.x,point.y));
  };
  const cancel=(event:PointerEvent)=>{pointers.delete(event.pointerId);pinch=null;};
  const wheel=(event:WheelEvent)=>{
   const current=scene.current;if(!current)return;event.preventDefault();cancelFlight();pan();
   const point=local(event);current.camera=current.zoomCamera(point.x,point.y,Math.exp(-event.deltaY*(event.ctrlKey?.01:.0015)));paint();
  };
  element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);
  element.addEventListener('pointerup',up);element.addEventListener('pointercancel',cancel);
  element.addEventListener('wheel',wheel,{passive:false});
  return ()=>{
   element.removeEventListener('pointerdown',down);element.removeEventListener('pointermove',move);
   element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',cancel);element.removeEventListener('wheel',wheel);
   for(const id of pointers.keys())if(element.hasPointerCapture(id))element.releasePointerCapture(id);
   pointers.clear();clearTimeout(panTimer);latest.current.onPan?.(false);
  };
 },[paused]);
 return <div ref={wrap} className="v7-atlas-sky" data-stars={model.stars.length} data-clusters={model.clusters.length} data-typed-links={typedLinks.length||undefined}
  data-demonstrated={model.counts.demonstrated} data-layout={source} data-zoom={zoom.toFixed(2)} data-zoom-range={MIN_ZOOM+'-'+MAX_ZOOM}
  data-paused={paused||undefined} data-motion={reduced?'reduced':'full'} data-selected={selected===null?'':model.stars[selected].id}>
  <canvas ref={canvas} aria-hidden="true"/>
 </div>;
}
