import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Row} from '../../../src/features/atlas/Outline';
import {arcCountFor,arcsFor,budgetArcs,initialExpanded,visibleRows,isPlainAtlasLabel,type Arc,type AtlasTree} from '../../../src/features/atlas/tree';

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
 it('clamps a stale deep scroll position when folding to a shorter outline',()=>{
  const window=atlasWindow(50,2500*44,740);
  expect(window.virtual).toBe(true);
  expect(window.first).toBeLessThan(50);
  expect(window.last).toBe(50);
  expect(window.last-window.first).toBeGreaterThan(0);
 });
 it('keeps small outlines fully accessible without virtualization',()=>{
  expect(atlasWindow(40,0,740)).toEqual({virtual:false,first:0,last:40,height:undefined});
 });
 it('keeps a moderate Atlas fully navigable but still virtualizes 2,500 rows',()=>{
  // The ordinary three-field demo has enough expanded rows to put a field
  // below the first phone viewport. All fields must remain in the tree DOM.
  expect(atlasWindow(110,0,740,150)).toEqual({virtual:false,first:0,last:110,height:undefined});
  const huge=atlasWindow(2500,0,740,150);
  expect(huge.virtual).toBe(true);
  expect(huge.last-huge.first).toBeLessThanOrEqual(Math.ceil(740/44)+8);
  expect(huge.height).toBe(2500*44);
 });
});

// Atlas's extreme first paint is mostly ordinary names ("Idea 123: Definition").
// These must avoid full Markdown/KaTeX parsing, but real TeX and Markdown must
// still use the rich renderer and never appear as raw source.
it('uses a safe plain-label fast path without bypassing mathematics',()=>{
 expect(isPlainAtlasLabel('Idea 123: Definition')).toBe(true);
 expect(isPlainAtlasLabel('Mathematics project 12')).toBe(true);
 expect(isPlainAtlasLabel(String.raw`Topology of $\\mathbb{R}^n$`)).toBe(false);
 expect(isPlainAtlasLabel('**Important**')).toBe(false);
 expect(isPlainAtlasLabel('<img src=x>')).toBe(false);
});

it('renders plain Atlas rows without Markdown while preserving real KaTeX rows',()=>{
 const node={...tree.nodes.get('idea')!,depth:1,glyph:null,total:1,done:0,revisit:0,due:0,rank:0};
 const props={node,open:false,tone:'none' as const,match:false,onToggle:()=>{},onSelect:()=>{}};
 const plain=renderToStaticMarkup(createElement(Row,{...props,node:{...node,name:'Idea 123: Definition'}}));
 expect(plain).toContain('Idea 123: Definition');
 expect(plain).not.toContain('lemma-tex-inline');
 const math=renderToStaticMarkup(createElement(Row,{...props,node:{...node,name:String.raw`Topology of $\\mathbb{R}^n$`}}));
 expect(math).toContain('class="katex"');
 expect(math).not.toContain('Topology of $');
});
