import type {AtlasTree} from './tree';

/**
 * Identify which fold-depth preset is active in one pass over branch nodes.
 *
 * Comparing against expandedToDepth(tree, 1/2/3) used to allocate three
 * whole-tree Sets and then scan them again on every expanded-state change.
 * Count the exact preset memberships instead, including stray saved IDs in
 * open.size so the behaviour remains identical for old persisted state.
 */
export function atlasFoldDepth(tree:AtlasTree,open:ReadonlySet<string>):1|2|3|99|null{
 const expected=[0,0,0],matched=[0,0,0];
 let allBranchesOpen=true;
 for(const node of tree.nodes.values()){
  if(!node.children.length)continue;
  const isOpen=open.has(node.id);
  if(!isOpen)allBranchesOpen=false;
  for(let i=0;i<3;i++){
   if(node.depth<i){
    expected[i]++;
    if(isOpen)matched[i]++;
   }
  }
 }
 for(let i=0;i<3;i++){
  if(expected[i]===open.size&&matched[i]===expected[i])
   return (i+1) as 1|2|3;
 }
 return allBranchesOpen?99:null;
}
