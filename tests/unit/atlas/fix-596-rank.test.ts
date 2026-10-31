import {describe,expect,it} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {buildAtlasTree} from '../../../src/features/atlas/tree';

// FIX #596: a long prerequisite chain is a legal DAG. The original recursive
// rank traversal overflowed the JS call stack when ideas arrived in reverse
// dependency order, and its per-node recursion added avoidable first-paint
// work to the 4x CPU Atlas budget.
describe('FIX #596 bounded Atlas prerequisite traversal',()=>{
 it('orders 12,000 reverse-inserted prerequisite ideas without recursion overflow',()=>{
  const size=12_000;
  const concepts:AtlasGraph['concepts']=Array.from({length:size},(_,index)=>{
   const n=size-index-1;
   return {
    id:'chain-'+n,slug:'chain-'+n,name:'Idea '+n,
    subjectId:'s',level:'planet',parentId:null,topic:'Chain',
    blurb:null,pinX:null,pinY:null,status:'not_started',
    checkpointRefs:[],dueCards:0,
   };
  });
  const links:AtlasGraph['links']=Array.from({length:size-1},(_,n)=>({
   fromId:'chain-'+n,toId:'chain-'+(n+1),kind:'prereq',
  }));
  const tree=buildAtlasTree({
   subjects:[{id:'s',name:'Math',glyph:'∑',hue:'slate',position:0}],
   concepts,links,
  });
  const ordered=tree.nodes.get('atlas:topic:s:chain')!.children;
  expect(ordered).toHaveLength(size);
  expect(ordered[0]).toBe('chain-0');
  expect(ordered.at(-1)).toBe('chain-'+(size-1));
 },30_000);

 it('terminates cycles while retaining deterministic prerequisite order',()=>{
  const ids=['a','b','c'];
  const concepts:AtlasGraph['concepts']=ids.map(id=>({
   id,slug:id,name:id,subjectId:'s',level:'planet',parentId:null,topic:'Cycle',
   blurb:null,pinX:null,pinY:null,status:'not_started',checkpointRefs:[],dueCards:0,
  }));
  const tree=buildAtlasTree({
   subjects:[{id:'s',name:'Math',glyph:'∑',hue:'slate',position:0}],
   concepts,links:[
    {fromId:'a',toId:'b',kind:'prereq'},
    {fromId:'b',toId:'c',kind:'prereq'},
    {fromId:'c',toId:'a',kind:'prereq'},
   ],
  });
  const ordered=tree.nodes.get('atlas:topic:s:cycle')!.children;
  expect(ordered).toHaveLength(3);
  expect(new Set(ordered)).toEqual(new Set(ids));
 },30_000);
});
