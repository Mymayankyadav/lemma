import type {Point} from './graph';

interface Camera{x:number;y:number;k:number}
interface Bounds{minX:number;minY:number;spanX:number;spanY:number}
const SIZE=104,PAD=9;
export function atlasMinimapBounds(nodes:readonly Point[]):Bounds{
 const minX=Math.min(0,...nodes.map(n=>n.x)),maxX=Math.max(0,...nodes.map(n=>n.x));
 const minY=Math.min(0,...nodes.map(n=>n.y)),maxY=Math.max(0,...nodes.map(n=>n.y));
 return {minX:minX-35,minY:minY-35,spanX:Math.max(100,maxX-minX+70),spanY:Math.max(100,maxY-minY+70)};
}
export function minimapPoint(point:Point,b:Bounds){
 return {x:PAD+(point.x-b.minX)/b.spanX*(SIZE-2*PAD),
  y:PAD+(point.y-b.minY)/b.spanY*(SIZE-2*PAD)};
}
export function minimapViewport(camera:Camera,width:number,height:number,b:Bounds){
 const a=minimapPoint({x:-camera.x/camera.k,y:-camera.y/camera.k},b);
 const z=minimapPoint({x:(width-camera.x)/camera.k,y:(height-camera.y)/camera.k},b);
 return {x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y};
}
export function minimapWorldPoint(x:number,y:number,b:Bounds){
 return {x:b.minX+(x-PAD)/(SIZE-2*PAD)*b.spanX,
  y:b.minY+(y-PAD)/(SIZE-2*PAD)*b.spanY};
}
export function AtlasMinimap({nodes,camera,width,height,onNavigate}:{nodes:readonly (Point&{id:string;status:string})[];
 camera:Camera;width:number;height:number;onNavigate:(point:Point)=>void}){
 const bounds=atlasMinimapBounds(nodes),viewport=minimapViewport(camera,width,height,bounds);
 return <button type="button" aria-label="Move Atlas viewport" title="Tap to move the Atlas camera"
  className="glass absolute bottom-[155px] right-4 z-10 flex size-[104px] items-center justify-center rounded-ctl border border-edge-2"
  onClick={event=>{
   const box=event.currentTarget.getBoundingClientRect();
   onNavigate(minimapWorldPoint((event.clientX-box.left)/box.width*SIZE,(event.clientY-box.top)/box.height*SIZE,bounds));
  }}>
  <svg width={SIZE} height={SIZE} viewBox="0 0 104 104" aria-hidden="true" className="pointer-events-none">
   <rect x="1" y="1" width="102" height="102" rx="8" fill="var(--obsidian)" fillOpacity=".6"/>
   {nodes.map(node=>{const p=minimapPoint(node,bounds);return <circle key={node.id} cx={p.x} cy={p.y}
    r={node.status==='revisit'?2.5:1.8} fill={node.status==='not_started'?'var(--ink-4)':'var(--amber)'}/>})}
   <rect x={viewport.x} y={viewport.y} width={Math.max(0,viewport.width)} height={Math.max(0,viewport.height)}
    rx="2" fill="var(--amber)" fillOpacity=".08" stroke="var(--amber)" strokeWidth="1.5"/>
  </svg>
 </button>;
}
