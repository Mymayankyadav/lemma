import type {AtlasGraph} from '../../data/types';
import type {AtlasLayout,AtlasNode,Point} from './graph';
import {atlasHierarchy} from './hierarchy';

function ideaRadius(count:number){return count<=1?0:Math.max(38,count*13)}
function topicOrbitRadius(count:number,maxIdeaRadius:number){
 return count<=1?0:Math.max(115,maxIdeaRadius+65);
}
/** Stable two-column Euclid construction: subject -> topic ring -> idea ring.
 * Each subject gets its own cell, preventing the force graph's overlapping halos.
 */
export function layoutOrbitGraph(graph:AtlasGraph):AtlasLayout{
 const groups=atlasHierarchy(graph);
 const dimensions=groups.map(group=>{
  const maxIdea=Math.max(0,...group.topics.map(t=>ideaRadius(t.concepts.length)));
  const orbit=topicOrbitRadius(group.topics.length,maxIdea);
  return {group,maxIdea,orbit,radius:Math.max(135,orbit+maxIdea+60)};
 });
 const maxRadius=Math.max(135,...dimensions.map(d=>d.radius));
 const columns=2,step=2*maxRadius+75,rows=Math.ceil(dimensions.length/columns);
 const centers=new Map<string,Point>(),nodes:AtlasNode[]=[];
 dimensions.forEach(({group,orbit},index)=>{
  const col=index%columns,row=Math.floor(index/columns);
  const center={x:(col-.5)*step,y:(row-(rows-1)/2)*step};
  centers.set(group.id,center);
  group.topics.forEach((topic,topicIndex)=>{
   const angle=2*Math.PI*topicIndex/group.topics.length-Math.PI/2;
   const topicCenter={x:center.x+Math.cos(angle)*orbit,y:center.y+Math.sin(angle)*orbit};
   const radius=ideaRadius(topic.concepts.length);
   topic.concepts.forEach((concept,ideaIndex)=>{
    const a=2*Math.PI*ideaIndex/topic.concepts.length-Math.PI/2;
    const pinned=concept.pinX!==null&&concept.pinY!==null;
    const x=pinned?concept.pinX!:topicCenter.x+Math.cos(a)*radius;
    const y=pinned?concept.pinY!:topicCenter.y+Math.sin(a)*radius;
    nodes.push({...concept,x,y,...pinned?{fx:x,fy:y}:{}});
   });
  });
 });
 const byId=new Map(nodes.map(node=>[node.id,node]));
 const edges=graph.links.filter(edge=>byId.has(edge.fromId)&&byId.has(edge.toId)).map(edge=>({...edge}));
 return {nodes,byId,edges,centers};
}
