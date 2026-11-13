import {useEffect,useImperativeHandle,useRef,useState,type Ref} from 'react';
import type {LayoutResult} from './layout';
import type {LayoutSource} from './layoutClient';
import {subjectToken,type AtlasModel} from './model';
import {AtlasScene,MAX_ZOOM,MIN_ZOOM,type Camera,type Insets,type ScenePalette} from './scene';

export interface AtlasMapHandle{recentre():void; zoomBy(factor:number):void; flyTo(index:number):void}
interface Props{
 focusCluster?:number|null;highlighted?:readonly number[]|null;
 model:AtlasModel; layout:LayoutResult; source:LayoutSource; selected:number|null; reduced:boolean; insets:Insets;
 onSelect:(index:number|null)=>void; ref?:Ref<AtlasMapHandle>;
}
const FLY_MS=700,ZOOM_MS=200,DOUBLE_TAP_MS=300,TAP_SLOP=6;

function readPalette(element:Element,model:AtlasModel):ScenePalette{
 const css=getComputedStyle(element),token=(name:string)=>css.getPropertyValue(name).trim();
 const night=document.documentElement.dataset.theme==='graph-night';
 return {night,sky:token('--v7-role-surface-sunken'),grid:token('--v7-role-border-subtle'),dust:token('--v7-role-text-primary'),
  text:token('--v7-role-text-primary'),textSecondary:token('--v7-role-text-secondary'),mark:token('--v7-role-border-default'),
  link:token('--v7-role-border-default'),selection:token('--v7-role-selection-fg'),focus:token('--v7-role-focus-ring'),
  warning:token('--v7-role-status-warning'),sans:token('--v7-sans')||'sans-serif',
  subjects:model.clusters.reduce<string[]>((list,cluster)=>{list[cluster.index]=token(subjectToken(cluster.subject));return list;},[])};
}
const ease=(t:number)=>1-Math.pow(1-t,3);

/** The Atlas sky: canvas only, hidden from assistive technology (the List view is the accessible path). */
export default function AtlasMap({model,layout,source,selected,reduced,insets,onSelect,ref,focusCluster=null,highlighted=null}:Props){
 const wrap=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),scene=useRef<AtlasScene|null>(null);
 const frame=useRef(0),animation=useRef<{from:Camera;to:Camera;start:number;duration:number}|null>(null);
 const [zoom,setZoom]=useState(1);
 const latest=useRef({onSelect,reduced});latest.current={onSelect,reduced};
 const paint=()=>{
  if(frame.current)return;
  frame.current=requestAnimationFrame(now=>{
   frame.current=0;const current=scene.current;if(!current)return;
   const motion=animation.current;
   if(motion){
    const t=Math.min(1,(now-motion.start)/motion.duration),e=ease(t);
    current.camera={x:motion.from.x+(motion.to.x-motion.from.x)*e,y:motion.from.y+(motion.to.y-motion.from.y)*e,k:motion.from.k*Math.pow(motion.to.k/motion.from.k,e)};
    if(t<1)paint();else animation.current=null;
   }
   current.draw();setZoom(Math.round(current.camera.k*100)/100);
  });
 };
 const moveTo=(to:Camera,duration:number)=>{
  const current=scene.current;if(!current)return;
  if(latest.current.reduced||duration<=0){animation.current=null;current.camera=to;}
  else animation.current={from:{...current.camera},to,start:performance.now(),duration};
  paint();
 };
 useImperativeHandle(ref,()=>({
  recentre:()=>{const current=scene.current;if(current)moveTo(focusCluster!==null?current.clusterCamera(focusCluster):current.fitCamera(),ZOOM_MS*2);},
  zoomBy:factor=>{const current=scene.current,box=wrap.current?.getBoundingClientRect();if(current&&box)moveTo(current.zoomCamera(box.width/2,box.height/2,factor),ZOOM_MS);},
  flyTo:index=>{const current=scene.current;if(current)moveTo(current.focusCamera(index),FLY_MS);},
 }));
 // One scene per model and layout; theme and size changes only update it.
 useEffect(()=>{
  const element=canvas.current,box=wrap.current;if(!element||!box)return;
  const created=new AtlasScene(element,model,layout,readPalette(box,model));
  scene.current=created;created.setInsets(insets);created.select(selected);created.labelCluster=focusCluster;created.highlighted=highlighted?new Set(highlighted):null;
  const measure=()=>{const rect=box.getBoundingClientRect();created.setSize(rect.width,rect.height,Math.min(2,window.devicePixelRatio||1));};
  measure();created.camera=selected!==null?created.focusCamera(selected,1.4):focusCluster!==null?created.clusterCamera(focusCluster):created.fitCamera();paint();
  const resize=new ResizeObserver(()=>{measure();paint();});resize.observe(box);
  const theme=new MutationObserver(()=>{created.setPalette(readPalette(box,model));paint();});
  theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-contrast']});
  return ()=>{resize.disconnect();theme.disconnect();cancelAnimationFrame(frame.current);frame.current=0;scene.current=null;};
  // Selection and insets are applied by their own effects below.
 },[model,layout,focusCluster]);
 useEffect(()=>{if(scene.current){scene.current.highlighted=highlighted?new Set(highlighted):null;paint();}},[highlighted]);
 useEffect(()=>{scene.current?.setInsets(insets);paint();},[insets.top,insets.right,insets.bottom,insets.left]);
 useEffect(()=>{scene.current?.select(selected);paint();},[selected]);
 // Pointer gestures: drag to pan, pinch to zoom, tap to select, double tap to zoom in.
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  const pointers=new Map<number,{x:number;y:number}>();
  let start:{x:number;y:number;time:number}|null=null,moved=false,lastTap:{x:number;y:number;time:number}|null=null,pinch:{distance:number;x:number;y:number}|null=null;
  const local=(event:PointerEvent|WheelEvent)=>{const rect=element.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};};
  const pinchState=()=>{const [a,b]=[...pointers.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
  const down=(event:PointerEvent)=>{
   element.setPointerCapture?.(event.pointerId);animation.current=null;
   const point=local(event);pointers.set(event.pointerId,point);
   if(pointers.size===1){start={...point,time:performance.now()};moved=false;}
   if(pointers.size===2){pinch=pinchState();moved=true;}
  };
  const move=(event:PointerEvent)=>{
   const previous=pointers.get(event.pointerId),current=scene.current;if(!previous||!current)return;
   const point=local(event);pointers.set(event.pointerId,point);
   if(pointers.size===2&&pinch){
    const next=pinchState(),camera=current.zoomCamera(next.x,next.y,next.distance/Math.max(1,pinch.distance));
    camera.x-=(next.x-pinch.x)/camera.k;camera.y-=(next.y-pinch.y)/camera.k;current.camera=camera;pinch=next;paint();return;
   }
   if(start&&Math.hypot(point.x-start.x,point.y-start.y)>TAP_SLOP)moved=true;
   if(moved){current.camera={...current.camera,x:current.camera.x-(point.x-previous.x)/current.camera.k,y:current.camera.y-(point.y-previous.y)/current.camera.k};paint();}
  };
  const up=(event:PointerEvent)=>{
   const point=local(event),wasTap=pointers.size===1&&!moved;
   pointers.delete(event.pointerId);if(pointers.size<2)pinch=null;
   if(!wasTap||!scene.current)return;
   const now=performance.now();
   if(lastTap&&now-lastTap.time<DOUBLE_TAP_MS&&Math.hypot(point.x-lastTap.x,point.y-lastTap.y)<24){
    lastTap=null;moveTo(scene.current.zoomCamera(point.x,point.y,2),ZOOM_MS);return;
   }
   lastTap={...point,time:now};
   latest.current.onSelect(scene.current.hitTest(point.x,point.y));
  };
  const cancel=(event:PointerEvent)=>{pointers.delete(event.pointerId);pinch=null;};
  const wheel=(event:WheelEvent)=>{
   const current=scene.current;if(!current)return;event.preventDefault();animation.current=null;
   const point=local(event);current.camera=current.zoomCamera(point.x,point.y,Math.exp(-event.deltaY*(event.ctrlKey?.01:.0015)));paint();
  };
  element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);
  element.addEventListener('pointerup',up);element.addEventListener('pointercancel',cancel);
  element.addEventListener('wheel',wheel,{passive:false});
  return ()=>{element.removeEventListener('pointerdown',down);element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',cancel);element.removeEventListener('wheel',wheel);};
  // Handlers read the live scene through refs, so they are bound once.
 },[]);
 return <div ref={wrap} className="v7-atlas-sky" data-stars={model.stars.length} data-clusters={model.clusters.length}
  data-demonstrated={model.counts.demonstrated} data-layout={source} data-zoom={zoom.toFixed(2)} data-zoom-range={MIN_ZOOM+'-'+MAX_ZOOM}
  data-motion={reduced?'reduced':'full'} data-selected={selected===null?'':model.stars[selected].id}>
  <canvas ref={canvas} aria-hidden="true"/>
 </div>;
}
