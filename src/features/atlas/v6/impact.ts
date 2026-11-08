// N86: pure Atlas edit safety rules, shared by create/edit/reparent/link/merge UI.
// This does not write to the database; authoritative APIs must recheck cycles.
export interface AtlasEditNode {
 id:string;parentId:string|null;prerequisiteIds:readonly string[];
}
export type CycleCheck={ok:true}|{ok:false;reason:string};
export function checkAtlasLink(
 nodes:readonly AtlasEditNode[],
 sourceId:string,targetId:string,
 kind:'parent'|'prerequisite',
):CycleCheck {
 const known=new Map(nodes.map(n=>[n.id,n]));
 if(sourceId===targetId)return {ok:false,reason:'A concept cannot link to itself.'};
 if(!known.has(sourceId)||!known.has(targetId))
  return {ok:false,reason:'A referenced concept is unavailable.'};
 // A parent link points child->parent. A prerequisite link points dependent->requirement.
 // Reject when adding the arrow would complete a path back to the source.
 const visit=(start:string,visited=new Set<string>()):boolean=>{
  if(start===sourceId)return true;
  if(visited.has(start))return false;
  visited.add(start);
  const node=known.get(start);
  if(!node)return false;
  const edges=kind==='parent'?(node.parentId?[node.parentId]:[]):node.prerequisiteIds;
  return edges.some(next=>visit(next,visited));
 };
 if(visit(targetId))return {ok:false,reason:kind==='parent'?
  'Moving here would create a parent cycle.':
  'This prerequisite would create a dependency cycle.'};
 return {ok:true};
}
export interface AtlasMergeImpact {
 childConcepts:number;incomingPrerequisites:number;outgoingPrerequisites:number;
 relatedConcepts:number;
}
export function describeAtlasMergeImpact(
 nodes:readonly AtlasEditNode[],fromId:string,toId:string,
 related:readonly {leftId:string;rightId:string}[]=[],
):AtlasMergeImpact{
 if(fromId===toId||!nodes.some(n=>n.id===fromId)||!nodes.some(n=>n.id===toId))
  throw Error('Merge requires two distinct existing concepts');
 const source=nodes.find(n=>n.id===fromId)!;
 return {
  childConcepts:nodes.filter(n=>n.parentId===fromId).length,
  incomingPrerequisites:nodes.filter(n=>n.id!==fromId&&n.prerequisiteIds.includes(fromId)).length,
  outgoingPrerequisites:source.prerequisiteIds.filter(id=>id!==toId).length,
  relatedConcepts:related.filter(link=>link.leftId===fromId||link.rightId===fromId).length,
 };
}
