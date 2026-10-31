import {describe,expect,it} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {arcsFor,budgetArcs,buildAtlasTree,focusOn,visibleRows} from '../../../src/features/atlas/tree';

const concepts=Array.from({length:100},(_,i)=>({
 id:'idea-'+i,slug:'idea-'+i,name:'Idea '+i,subjectId:'math',
 level:'planet' as const,parentId:null,blurb:null,pinX:null,pinY:null,
 status:'not_started' as const,checkpointRefs:[],dueCards:0,
}));
const graph:AtlasGraph={
 subjects:[{id:'math',name:'Mathematics',glyph:'∫',hue:'amber',position:0}],
 concepts,
 links:Array.from({length:99},(_,i)=>({fromId:'idea-'+i,toId:'idea-'+(i+1),kind:'prereq' as const})),
};
const tree=buildAtlasTree(graph);
const root=tree.roots[0];
const rows=visibleRows(tree,new Set([root]));
const arcs=arcsFor(tree,rows,new Set(['prereq']));

describe('ST-3 Atlas arc budget',()=>{
 it('preserves all connections below the 60-arc threshold',()=>{
  const result=budgetArcs(tree,rows,new Set([root]),arcs.slice(0,40),null);
  expect(result.visible).toHaveLength(40);
  expect(result.hidden).toBe(0);
 });
 it('hides the dense mesh with all branches unfolded and no selection',()=>{
  const result=budgetArcs(tree,rows,new Set([root]),arcs,null);
  expect(arcs.length).toBeGreaterThan(60);
  expect(result.visible).toHaveLength(0);
  expect(result.hidden).toBe(arcs.length);
 });
 it('keeps selected-chain links while hiding unrelated arcs',()=>{
  const focus=focusOn(tree,'idea-50');
  const result=budgetArcs(tree,rows,new Set([root]),arcs,focus);
  expect(result.visible.length).toBeGreaterThan(0);
  expect(result.visible.length).toBeLessThanOrEqual(60);
  expect(result.visible.every(arc=>arc.links.some(link=>link.kind==='prereq'))).toBe(true);
  expect(result.hidden+result.visible.length).toBe(arcs.length);
 });
 it('preserves a folded branch boundary up to the cap',()=>{
  const result=budgetArcs(tree,rows,new Set(),arcs,null);
  expect(result.visible).toHaveLength(60);
  expect(result.hidden).toBe(arcs.length-60);
 });
});
