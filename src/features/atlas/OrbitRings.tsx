import type {AtlasGraph} from '../../data/types';
import type {AtlasNode,Point} from './graph';

interface Ring extends Point {id:string;name:string;radius:number;done:number;total:number}
export interface OrbitGroup extends Ring {hue:string;topics:Ring[]}
function circleFor(nodes:readonly AtlasNode[],padding:number){
 const x=nodes.reduce((n,p)=>n+p.x,0)/nodes.length;
 const y=nodes.reduce((n,p)=>n+p.y,0)/nodes.length;
 const radius=Math.max(28,Math.max(...nodes.map(n=>Math.hypot(n.x-x,n.y-y)))+padding);
 return {x,y,radius};
}
/** Circles are derived from the positioned concepts, so pinning and camera fit stay coherent. */
export function atlasOrbitGroups(graph:AtlasGraph,nodes:readonly AtlasNode[]):OrbitGroup[]{
 return graph.subjects.flatMap(subject=>{
  const members=nodes.filter(n=>n.subjectId===subject.id);
  if(!members.length)return [];
  const byTopic=new Map<string,AtlasNode[]>();
  for(const node of members){
   const name=node.topic?.trim()||'General';
   if(!byTopic.has(name))byTopic.set(name,[]);
   byTopic.get(name)!.push(node);
  }
  const topics=[...byTopic.entries()].map(([name,items])=>({
   id:subject.id+'|'+name,name,...circleFor(items,27),
   total:items.length,done:items.filter(n=>n.status==='demonstrated').length,
  }));
  const ring=circleFor(members,Math.max(48,...topics.map(t=>t.radius+8)));
  return [{id:subject.id,name:subject.name,hue:subject.hue,...ring,topics,
   total:members.length,done:members.filter(n=>n.status==='demonstrated').length}];
 });
}
function ProgressCircle({ring,scale,subject=false}:{ring:Ring;scale:number;subject?:boolean}){
 const circumference=2*Math.PI*ring.radius;
 return <g data-atlas-ring={ring.id} pointerEvents="none">
  <circle cx={ring.x} cy={ring.y} r={ring.radius} fill="var(--amber)" fillOpacity={subject ? 0.025 : 0.015}
   stroke="var(--edge-3)" strokeWidth={1/scale}/>
  <circle cx={ring.x} cy={ring.y} r={ring.radius} fill="none" stroke="var(--amber)" strokeOpacity={subject ? 0.8 : 0.65}
   strokeWidth={(subject?2:1.5)/scale} strokeDasharray={ring.total?circumference*ring.done/ring.total+' '+circumference:circumference+' '+circumference}
   transform={'rotate(-90 '+ring.x+' '+ring.y+')'}/>
 </g>;
}
export function OrbitRings({graph,nodes,scale}:{graph:AtlasGraph;nodes:readonly AtlasNode[];scale:number}){
 const groups=atlasOrbitGroups(graph,nodes);
 return <g aria-hidden="true" data-atlas-orbits="true" pointerEvents="none">
  {groups.map(group=><g key={group.id}>
   <ProgressCircle ring={group} scale={scale} subject/>
   <text x={group.x} y={group.y-group.radius-10/scale} textAnchor="middle"
    fontFamily="var(--font-ui)" fontSize={13/scale} fontWeight="700"
    fill="var(--ink)" stroke="var(--obsidian)" strokeWidth={3/scale} paintOrder="stroke">
    {group.name} · {group.done}/{group.total}
   </text>
   {group.topics.map(topic=><g key={topic.id}>
    <ProgressCircle ring={topic} scale={scale}/>
    {topic.radius*scale>=44&&<text x={topic.x} y={topic.y-topic.radius-5/scale}
     textAnchor="middle" fontFamily="var(--font-ui)" fontSize={11/scale}
     fill="var(--ink-2)" stroke="var(--obsidian)" strokeWidth={3/scale} paintOrder="stroke">{topic.name}</text>}
   </g>)}
  </g>)}
 </g>;
}
