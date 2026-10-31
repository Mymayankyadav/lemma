import {describe,expect,it} from 'vitest';
import {atlasFoldDepth} from '../../../src/features/atlas/depthOf';
import {expandedToDepth} from '../../../src/features/atlas/tree';
import type {AtlasNode,AtlasTree} from '../../../src/features/atlas/tree';

function fixture(count=4):AtlasTree{
 const nodes=new Map<string,AtlasNode>();
 for(let i=0;i<count;i++){
  const id='n'+i;
  nodes.set(id,{id,depth:i%4,children:i%5===4?[]:['child']} as AtlasNode);
 }
 return {roots:['n0'],nodes,links:[]};
}

function reference(tree:AtlasTree,open:Set<string>):1|2|3|99|null{
 for(const d of [1,2,3] as const){
  const set=expandedToDepth(tree,d);
  if(set.size===open.size&&[...set].every(id=>open.has(id)))return d;
 }
 return [...tree.nodes.values()].filter(n=>n.children.length).every(n=>open.has(n.id))?99:null;
}

describe('LOOK-4b Atlas fold-depth preset',()=>{
 it('preserves every preset, custom selection and saved stray leaf/unknown IDs',()=>{
  const tree=fixture();
  const ids=[...tree.nodes.keys(),'unknown'];
  for(let mask=0;mask<(1<<ids.length);mask++){
   const open=new Set(ids.filter((_,i)=>Boolean(mask&(1<<i))));
   expect(atlasFoldDepth(tree,open)).toBe(reference(tree,open));
  }
  for(const depth of [1,2,3] as const)
   expect(atlasFoldDepth(tree,expandedToDepth(tree,depth))).toBe(depth);
 });
 it('does not construct multiple 8,000-node Sets to identify an extreme outline preset',()=>{
  const tree=fixture(8000);
  for(const depth of [1,2,3] as const){
   const open=expandedToDepth(tree,depth);
   expect(atlasFoldDepth(tree,open)).toBe(depth);
  }
  const all=new Set([...tree.nodes.values()].filter(n=>n.children.length).map(n=>n.id));
  expect(atlasFoldDepth(tree,all)).toBe(99);
  all.delete('n0');
  expect(atlasFoldDepth(tree,all)).toBe(null);
 });
});
