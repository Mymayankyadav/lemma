import {describe,expect,it} from 'vitest';
import {arcCountFor,arcsFor,budgetArcs,initialExpanded,visibleRows,type Arc,type AtlasTree} from '../../../src/features/atlas/tree';

// FIX #519: the first render must already use the effective expanded set.
// Waiting for an effect used to construct and draw the 8,000-link Atlas twice
// on a 4× CPU-throttled mobile route transition.
const tree={
 roots:['field'],
 nodes:new Map([
  ['field',{id:'field',parentId:null,children:['idea'],status:'not_started',synthetic:true,level:'cluster'}],
  ['idea',{id:'idea',parentId:'field',children:[],status:'not_started',synthetic:false,level:'planet'}],
 ]),
 links:[],
} as unknown as AtlasTree;

describe('FIX #519 Atlas first paint',()=>{
 it('opens the default field and its first idea synchronously',()=>{
  const open=initialExpanded(tree);
  expect([...open]).toEqual(['field']);
  expect(visibleRows(tree,open).map(row=>row.id)).toEqual(['field','idea']);
 });
 it('restores valid saved folds and ignores stale idea IDs',()=>{
  expect([...initialExpanded(tree,['field','removed'])]).toEqual(['field']);
  expect([...initialExpanded(tree,['removed'])]).toEqual(['field']);
 });
});

// Arc ranking remains visually stable after deferring the sort until the
// bounded set is known: long arcs are behind shorter nested arcs.
it('keeps long arcs first and preserves hidden counts without drawing 8,000 arcs',()=>{
 const arcs:Arc[]=[
  {key:'short',from:0,to:1,kind:'prereq',count:1,links:[]},
  {key:'long',from:0,to:8,kind:'prereq',count:2,links:[]},
  {key:'medium',from:1,to:5,kind:'prereq',count:3,links:[]},
 ];
 const rows=[{id:'field',depth:0,match:false},{id:'idea',depth:1,match:false}];
 expect(budgetArcs(tree,rows,new Set(['field']),arcs,null,3).visible.map(a=>a.key))
  .toEqual(['long','medium','short']);
 const large=Array.from({length:100},(_,i)=>({...arcs[0],key:'arc-'+i}));
 expect(budgetArcs(tree,rows,new Set(['field']),large,null,60))
  .toEqual({visible:[],hidden:100});
});

it('counts bundled arcs exactly when the unfocused graph is hidden',()=>{
 const graph={...tree,links:[
  {fromId:'field',toId:'idea',kind:'prereq'},
  {fromId:'field',toId:'idea',kind:'prereq'},
  {fromId:'idea',toId:'field',kind:'related'},
  {fromId:'field',toId:'idea',kind:'related'},
 ]} as unknown as AtlasTree;
 const rows=visibleRows(graph,new Set(['field']));
 const kinds=new Set(['prereq','related'] as const);
 expect(arcCountFor(graph,rows,kinds)).toBe(arcsFor(graph,rows,kinds).length);
 expect(arcCountFor(graph,rows,kinds)).toBe(2);
});
