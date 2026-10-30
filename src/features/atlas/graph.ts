import {forceSimulation,forceLink,forceManyBody,forceCollide,forceX,forceY} from 'd3-force';
import {polygonHull} from 'd3-polygon';
import type {AtlasGraph} from '../../data/types';
export type AtlasConcept=AtlasGraph['concepts'][number];
export interface Point{x:number;y:number}
export interface AtlasNode extends AtlasConcept{ x:number;y:number;fx?:number;fy?:number }
export interface AtlasEdge{fromId:string;toId:string;kind:'prereq'|'related'}
export interface AtlasLayout{nodes:AtlasNode[];edges:AtlasEdge[];byId:Map<string,AtlasNode>;centers:Map<string,Point>}
function hash(value:string){
 let state=2166136261;for(const char of value){state^=char.codePointAt(0)??0;state=Math.imul(state,16777619)}
 return state>>>0;
}
/** Stable 300-tick force layout: positions depend only on the graph, never on rendering order or random seeds. */
export function layoutAtlas(graph:AtlasGraph):AtlasLayout{
 const centers=new Map<string,Point>();
 const count=Math.max(1,graph.subjects.length);
 graph.subjects.forEach((subject,i)=>{const a=2*Math.PI*i/count-Math.PI/2;centers.set(subject.id,{x:Math.cos(a)*160,y:Math.sin(a)*160})});
 const nodes:AtlasNode[]=graph.concepts.map(c=>{
  const centre=centers.get(c.subjectId)??{x:0,y:0},seed=hash(c.id+'|'+c.slug);
  const theta=((seed%10000)/10000)*2*Math.PI,r=20+((seed>>>10)%50);
  const pinned=c.pinX!==null&&c.pinY!==null;
  return {...c,x:pinned?c.pinX!:centre.x+Math.cos(theta)*r,y:pinned?c.pinY!:centre.y+Math.sin(theta)*r,...pinned?{fx:c.pinX!,fy:c.pinY!}:{}};
 });
 const edges=graph.links.filter(l=>nodes.some(n=>n.id===l.fromId)&&nodes.some(n=>n.id===l.toId)).map(l=>({...l}));
 // d3-force mutates a private link copy; retaining immutable IDs keeps React rendering stable.
 const links=edges.map(e=>({source:e.fromId,target:e.toId}));
 const simulation=forceSimulation(nodes)
  .force('link',forceLink<AtlasNode>(links).id(node=>node.id).distance(70).strength(0.5))
  .force('charge',forceManyBody().strength(-160))
  .force('collide',forceCollide(26))
  .force('x',forceX<AtlasNode>(n=>centers.get(n.subjectId)?.x??0).strength(0.10))
  .force('y',forceY<AtlasNode>(n=>centers.get(n.subjectId)?.y??0).strength(0.10))
  .stop();
 for(let i=0;i<300;i++)simulation.tick();
 simulation.stop();
 const byId=new Map(nodes.map(n=>[n.id,n]));
 return {nodes,edges,byId,centers};
}
function loop(points:Point[]):string{
 if(points.length<3)return '';
 const n=points.length;let path=`M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
 for(let i=0;i<n;i++){
  const prev=points[(i-1+n)%n],curr=points[i],next=points[(i+1)%n],after=points[(i+2)%n];
  const c1={x:curr.x+(next.x-prev.x)/6,y:curr.y+(next.y-prev.y)/6};
  const c2={x:next.x-(after.x-curr.x)/6,y:next.y-(after.y-curr.y)/6};
  path+=` C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${next.x.toFixed(2)},${next.y.toFixed(2)}`;
 }
 return path+' Z';
}
export interface Nebula{path:string;label:Point}
export function nebula(nodes:readonly Point[],padding=28):Nebula|null{
 if(!nodes.length)return null;
 let hull=polygonHull(nodes.map(n=>[n.x,n.y] as [number,number]))?.map(p=>({x:p[0],y:p[1]}))??[];
 if(hull.length<3){
  const center={x:nodes.reduce((n,p)=>n+p.x,0)/nodes.length,y:nodes.reduce((n,p)=>n+p.y,0)/nodes.length};
  hull=Array.from({length:16},(_,i)=>{const a=i*2*Math.PI/16;return {x:center.x+Math.cos(a)*54,y:center.y+Math.sin(a)*54}});
 }
 const cx=hull.reduce((n,p)=>n+p.x,0)/hull.length,cy=hull.reduce((n,p)=>n+p.y,0)/hull.length;
 const expanded=hull.map(p=>{const dx=p.x-cx,dy=p.y-cy,length=Math.hypot(dx,dy)||1;return {x:p.x+dx/length*padding,y:p.y+dy/length*padding}});
 return {path:loop(expanded),label:{x:Math.min(...expanded.map(p=>p.x))+8,y:Math.min(...expanded.map(p=>p.y))-4}};
}
export function fitAtlas(nodes:readonly Point[],w:number,h:number,margin=24){
 if(!nodes.length)return {x:w/2,y:h/2,k:1};
 const minX=Math.min(...nodes.map(n=>n.x)),maxX=Math.max(...nodes.map(n=>n.x));
 const minY=Math.min(...nodes.map(n=>n.y)),maxY=Math.max(...nodes.map(n=>n.y));
 const k=Math.max(0.2,Math.min(2,Math.min((w-2*margin)/Math.max(maxX-minX,100),(h-2*margin)/Math.max(maxY-minY,100))));
 return {x:w/2-k*(minX+maxX)/2,y:h/2-k*(minY+maxY)/2,k};
}

/** Fit within the unobstructed area between Atlas's header and detail tray. */
export function fitAtlasViewport(nodes: readonly Point[], width: number, height: number) {
 const top = Math.min(205, height * 0.28);
 const bottom = Math.min(132, height * 0.21);
 const availableHeight = Math.max(100, height - top - bottom);
 const fit = fitAtlas(nodes, width, availableHeight, 24);
 return {...fit, y: fit.y + top};
}

/** Keep important labels readable without drawing two labels over one another. */
export function visibleAtlasLabels(nodes: readonly AtlasNode[], selectedId: string | null): Set<string> {
 const priorities: Record<AtlasNode['status'], number> = {
  revisit: 0, in_progress: 1, demonstrated: 2, not_started: 3,
 };
 const ordered = [...nodes].sort((a, b) =>
  Number(b.id === selectedId) - Number(a.id === selectedId) ||
  priorities[a.status] - priorities[b.status] ||
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
 const occupied: {left: number; right: number; top: number; bottom: number}[] = [];
 const visible = new Set<string>();
 for (const node of ordered) {
  const selected = node.id === selectedId;
  const width = node.name.length * (selected ? 8.4 : 7.5) + 12;
  const rect = {left: node.x - width / 2, right: node.x + width / 2,
   top: node.y + 9, bottom: node.y + 31};
  if (!selected && occupied.some(other =>
   rect.left < other.right && rect.right > other.left &&
   rect.top < other.bottom && rect.bottom > other.top)) continue;
  visible.add(node.id);
  occupied.push(rect);
 }
 return visible;
}

/** At overview scale show a few high-priority ideas per subject; expanding the camera
 * progressively reveals the rest without overwhelming a phone-sized screen.
 */
export function visibleOrbitLabels(nodes:readonly AtlasNode[],selectedId:string|null,scale:number):Set<string>{
 const collisionSafe=visibleAtlasLabels(nodes,selectedId);
 if(scale>=0.9)return collisionSafe;
 const result=new Set<string>();
 const counts=new Map<string,number>();
 const priority:Record<AtlasNode['status'],number>={revisit:0,in_progress:1,demonstrated:2,not_started:3};
 const ordered=[...nodes].filter(n=>collisionSafe.has(n.id)).sort((a,b)=>
  priority[a.status]-priority[b.status]||a.name.localeCompare(b.name));
 for(const node of ordered){
  const count=counts.get(node.subjectId)??0;
  if(count>=2&&node.id!==selectedId)continue;
  result.add(node.id);
  counts.set(node.subjectId,count+1);
 }
 if(selectedId)result.add(selectedId);
 return result;
}
