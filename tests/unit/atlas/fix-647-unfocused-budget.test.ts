import {describe,expect,it} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {arcsFor,budgetArcs,budgetArcsUnfocused,buildAtlasTree,visibleRows} from '../../../src/features/atlas/tree';

// FIX #647 regression-first: an unfocused 8k-link first paint must not build
// thousands of link-bearing Arc arrays merely to retain <=60 gutter marks.
// Compare the optimized result to the exact historical budget semantics.
const ids=Array.from({length:120},(_,i)=>'idea-'+i);
const concepts:AtlasGraph['concepts']=[
 {id:'field',slug:'field',name:'Field',subjectId:'math',level:'cluster',parentId:null,
  blurb:null,pinX:null,pinY:null,status:'not_started',checkpointRefs:[],dueCards:0},
 ...Array.from({length:12},(_,i)=>({
  id:'area-'+i,slug:'area-'+i,name:'Area '+i,subjectId:'math',level:'galaxy' as const,parentId:'field',
  blurb:null,pinX:null,pinY:null,status:'not_started' as const,checkpointRefs:[],dueCards:0,
 })),
 ...ids.map((id,i)=>({
  id,slug:id,name:'Idea '+i,subjectId:'math',level:'planet' as const,parentId:'area-'+(i%12),
  blurb:null,pinX:null,pinY:null,status:'not_started' as const,checkpointRefs:[],dueCards:0,
 })),
];
const graph:AtlasGraph={
 subjects:[{id:'math',name:'Mathematics',glyph:'∫',hue:'amber',position:0}],
 concepts,
 links:Array.from({length:8000},(_,i)=>({
  fromId:ids[i%120],toId:ids[(i*37+11)%120],
  kind:i%3===0?'related' as const:'prereq' as const,
 })),
};
const tree=buildAtlasTree(graph);
const kinds=new Set<'prereq'|'related'>(['prereq','related']);
const project=(result:ReturnType<typeof budgetArcs>)=>({
 hidden:result.hidden,
 visible:result.visible.map(({key,from,to,kind,count})=>({key,from,to,kind,count})),
});

describe('FIX #647 unfocused Atlas first-paint CPU path',()=>{
 it('preserves exact folded-bundle ranking, counts, directions and stable ties',()=>{
  const open=new Set(['field',...Array.from({length:6},(_,i)=>'area-'+i)]);
  const rows=visibleRows(tree,open);
  const historical=budgetArcs(tree,rows,open,arcsFor(tree,rows,kinds),null);
  expect(historical.hidden).toBeGreaterThan(0);
  expect(historical.visible.length).toBeGreaterThan(0);
  expect(project(budgetArcsUnfocused(tree,rows,open,kinds))).toEqual(project(historical));
 });
 it('preserves the all-open hidden count without allocating per-link arrays',()=>{
  const open=new Set(['field',...Array.from({length:12},(_,i)=>'area-'+i)]);
  const rows=visibleRows(tree,open);
  const historical=budgetArcs(tree,rows,open,arcsFor(tree,rows,kinds),null);
  expect(historical.hidden).toBeGreaterThan(60);
  expect(project(budgetArcsUnfocused(tree,rows,open,kinds))).toEqual(project(historical));
 });
 it('retains all arcs and their ordering when there are fewer than 60',()=>{
  const few=buildAtlasTree({...graph,links:graph.links.slice(0,12)});
  const open=new Set(['field',...Array.from({length:6},(_,i)=>'area-'+i)]);
  const rows=visibleRows(few,open);
  const historical=budgetArcs(few,rows,open,arcsFor(few,rows,kinds),null);
  expect(project(budgetArcsUnfocused(few,rows,open,kinds))).toEqual(project(historical));
 });
});
