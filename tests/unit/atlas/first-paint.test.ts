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
 const kinds=new Set<AtlasTree['links'][number]['kind']>(['prereq','related']);
 expect(arcCountFor(graph,rows,kinds)).toBe(arcsFor(graph,rows,kinds).length);
 expect(arcCountFor(graph,rows,kinds)).toBe(2);
});

// Regression for reopened #519: a 100-row first paint must not mount all
// 100 KaTeX/Markdown row subtrees before the first interactive Atlas frame.
// The complete 44px scroll extent and keyboard overscan remain available.
import {atlasWindow} from '../../../src/features/atlas/window';

describe('FIX #519b cold Atlas viewport budget',()=>{
 it('bounds the initial 100-row render to the visible viewport plus overscan',()=>{
  const window=atlasWindow(100,0,740);
  expect(window.virtual).toBe(true);
  expect(window.first).toBe(0);
  expect(window.last-window.first).toBeLessThanOrEqual(Math.ceil(740/44)+8);
  expect(window.height).toBe(100*44);
 });
 it('keeps the bottom row reachable and the full scroll extent',()=>{
  const window=atlasWindow(2500,2500*44-740,740);
  expect(window.virtual).toBe(true);
  expect(window.last).toBe(2500);
  expect(window.first).toBeLessThan(2500-1);
  expect(window.height).toBe(2500*44);
 });
 it('keeps small outlines fully accessible without virtualization',()=>{
  expect(atlasWindow(40,0,740)).toEqual({virtual:false,first:0,last:40,height:undefined});
 });
});
