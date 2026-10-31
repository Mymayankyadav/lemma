import {describe,expect,it} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {arcCountFor,arcsFor,budgetArcs,buildAtlasTree,initialExpanded,visibleRows,type Arc,type AtlasTree} from '../../../src/features/atlas/tree';

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
 const kinds=new Set<AtlasTree['links'][number]['kind']>(['prereq','related']);
 expect(arcCountFor(graph,rows,kinds)).toBe(arcsFor(graph,rows,kinds).length);
 expect(arcCountFor(graph,rows,kinds)).toBe(2);
});

// FIX #519: the count-only 8k-link first-paint path must retain exact
// directional prerequisite and symmetric related bundling after optimization.
it('counts 8,000 mixed dense links exactly without materializing arc bundles',()=>{
 const ids=Array.from({length:160},(_,i)=>'idea-'+i);
 const graph:AtlasGraph={
  subjects:[{id:'math',name:'Mathematics',glyph:'∫',hue:'amber',position:0}],
  concepts:ids.map(id=>({id,slug:id,name:id,subjectId:'math',level:'planet' as const,
   parentId:null,blurb:null,pinX:null,pinY:null,status:'not_started' as const,
   checkpointRefs:[],dueCards:0})),
  links:Array.from({length:8000},(_,i)=>({
   fromId:ids[i%ids.length],toId:ids[(i*31+7)%ids.length],
   kind:i%3===0?'related' as const:'prereq' as const,
  })),
 };
 const dense=buildAtlasTree(graph);
 const rows=visibleRows(dense,new Set(dense.roots));
 const kinds=new Set<'prereq'|'related'>(['prereq','related']);
 const expected=arcsFor(dense,rows,kinds).length;
 expect(expected).toBeGreaterThan(100);
 expect(arcCountFor(dense,rows,kinds)).toBe(expected);
},30_000);
