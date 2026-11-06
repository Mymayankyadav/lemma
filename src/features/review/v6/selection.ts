import type {DeckNode,ReviewItem} from '../../../data/types';
/** One shared selection for the rendered count and the actual queue. */
export function reviewBatch(nodes:DeckNode[],items:ReviewItem[],
 selected:ReadonlySet<string>,quota:number){
 const byProject=new Map(nodes.map(n=>[n.key,n]));
 const available=items.filter(item=>{
  const node=byProject.get('project:'+item.projectSlug);
  if(!node)return false;
  const choices=node.children.filter(c=>c.due>0);
  if(choices.length&&item.checkpointCode)
   return selected.has('cp:'+item.projectSlug+':'+item.checkpointCode);
  return selected.has(node.key);
 });
 const limit=Math.max(0,Math.trunc(Number.isFinite(quota)?quota:0));
 return {allDue:nodes.reduce((n,p)=>n+Math.max(0,p.due),0),
  eligible:available.length,batch:available.slice(0,limit)};
}
export function defaultSelection(nodes:DeckNode[]):Set<string>{
 return new Set(nodes.flatMap(n=>n.due>0?[n.key,...n.children.filter(c=>c.due>0).map(c=>c.key)]:[]));
}
