import {forceCollide,forceLink,forceManyBody,forceSimulation,forceX,forceY,type SimulationNodeDatum} from 'd3-force';

/**
 * Seeded force layout for the v7 Atlas (PLAN §6.12 "Layout"). The same input always
 * yields the same positions, so the map looks the same every time; pinned concepts
 * keep their stored coordinates. Runs in a worker (layout.worker.ts) and, where
 * workers are unavailable (tests, old browsers), on the main thread.
 */
export interface LayoutInput{
 ids:string[]; clusters:number[]; clusterCount:number; radii:number[];
 edges:[from:number,to:number,prereq:0|1][]; pins:([number,number]|null)[]; seed:string;
}
export interface LayoutResult{
 key:string; x:number[]; y:number[]; centres:[number,number][];
 bounds:{minX:number;minY:number;maxX:number;maxY:number};
}
export const LAYOUT_VERSION=1;
const TICKS=320;

/** FNV-1a: a short, stable cache key for the data that shapes the layout. */
export function layoutKey(input:LayoutInput):string{
 let hash=2166136261;
 const feed=(text:string)=>{for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);};
 feed('v'+LAYOUT_VERSION+'|'+input.seed+'|'+input.clusterCount);
 for(let i=0;i<input.ids.length;i++){feed('|'+input.ids[i]+':'+input.clusters[i]+':'+input.radii[i].toFixed(2));const pin=input.pins[i];if(pin)feed('@'+pin[0]+','+pin[1]);}
 for(const [from,to,prereq] of input.edges)feed('|'+from+'>'+to+(prereq?'p':'r'));
 return (hash>>>0).toString(36)+'-'+input.ids.length;
}
/** mulberry32, seeded from the layout seed. */
export function seededRandom(seed:string):()=>number{
 let a=2166136261;
 for(let i=0;i<seed.length;i++)a=Math.imul(a^seed.charCodeAt(i),16777619);
 return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
}

interface Node extends SimulationNodeDatum{cluster:number; radius:number}
interface LinkDatum{source:number|Node; target:number|Node; prereq:boolean; crossing:boolean}

export function layoutAtlas(input:LayoutInput):LayoutResult{
 const random=seededRandom(input.seed),count=input.ids.length;
 const ring=Math.max(140,Math.sqrt(Math.max(count,1))*34);
 // Constellations sit on a ring (one at the centre when there is only one).
 const centres:[number,number][]=Array.from({length:Math.max(input.clusterCount,1)},(_,i)=>{
  if(input.clusterCount<=1)return [0,0];
  const angle=-Math.PI/2+i*2*Math.PI/input.clusterCount;
  return [Math.cos(angle)*ring,Math.sin(angle)*ring];
 });
 const nodes:Node[]=input.ids.map((_,i)=>{
  const [cx,cy]=centres[input.clusters[i]]??[0,0],angle=random()*2*Math.PI,distance=Math.sqrt(random())*ring*.45;
  const pin=input.pins[i];
  const node:Node={cluster:input.clusters[i],radius:input.radii[i],x:cx+Math.cos(angle)*distance,y:cy+Math.sin(angle)*distance};
  if(pin){node.x=node.fx=pin[0];node.y=node.fy=pin[1];}
  return node;
 });
 const links:LinkDatum[]=input.edges.map(([from,to,prereq])=>({source:from,target:to,prereq:prereq===1,crossing:input.clusters[from]!==input.clusters[to]}));
 const simulation=forceSimulation(nodes).randomSource(random).stop()
  .force('link',forceLink<Node,LinkDatum>(links).distance(link=>link.prereq?42:64).strength(link=>link.crossing?.03:link.prereq?.45:.18))
  .force('charge',forceManyBody<Node>().strength(-52).distanceMax(ring))
  .force('x',forceX<Node>(node=>centres[node.cluster]?.[0]??0).strength(.11))
  .force('y',forceY<Node>(node=>centres[node.cluster]?.[1]??0).strength(.11))
  .force('collide',forceCollide<Node>(node=>node.radius+11).iterations(2));
 simulation.tick(TICKS);
 const x=nodes.map(node=>Math.round((node.x??0)*100)/100),y=nodes.map(node=>Math.round((node.y??0)*100)/100);
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(let i=0;i<count;i++){minX=Math.min(minX,x[i]);minY=Math.min(minY,y[i]);maxX=Math.max(maxX,x[i]);maxY=Math.max(maxY,y[i]);}
 if(!count){minX=minY=-1;maxX=maxY=1;}
 // Each constellation's label and tint follow where its stars actually settled.
 const sums=centres.map(()=>[0,0,0]);
 for(let i=0;i<count;i++){const sum=sums[input.clusters[i]];if(sum){sum[0]+=x[i];sum[1]+=y[i];sum[2]++;}}
 const settled=sums.map((sum,i):[number,number]=>sum[2]?[sum[0]/sum[2],sum[1]/sum[2]]:centres[i]);
 return {key:layoutKey(input),x,y,centres:settled,bounds:{minX,minY,maxX,maxY}};
}
