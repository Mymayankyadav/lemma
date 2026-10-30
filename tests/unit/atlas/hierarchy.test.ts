import {describe,it,expect} from 'vitest';
import {atlasHierarchy} from '../../../src/features/atlas/hierarchy';
import {atlasMinimapBounds,minimapPoint,minimapViewport,minimapWorldPoint} from '../../../src/features/atlas/AtlasMinimap';
import type {AtlasGraph} from '../../../src/data/types';

const graph:AtlasGraph={
 subjects:[
  {id:'s2',name:'Topology',glyph:'T',hue:'violet',position:2},
  {id:'s1',name:'Algebra',glyph:'A',hue:'amber',position:1},
 ],
 concepts:[
  {id:'c2',slug:'b',name:'Subgroups',topic:'Groups',blurb:null,subjectId:'s1',status:'in_progress',pinX:null,pinY:null,checkpointRefs:[],dueCards:2},
  {id:'c1',slug:'a',name:'Actions',topic:'Groups',blurb:null,subjectId:'s1',status:'demonstrated',pinX:null,pinY:null,checkpointRefs:[],dueCards:0},
  {id:'c3',slug:'c',name:'Compactness',topic:null,blurb:null,subjectId:'s2',status:'revisit',pinX:null,pinY:null,checkpointRefs:[],dueCards:1},
 ],
 links:[],
};
describe('Atlas hierarchy',()=>{
 it('sorts subjects, groups topics and preserves each concept exactly once',()=>{
  const groups=atlasHierarchy(graph);
  expect(groups.map(s=>s.name)).toEqual(['Algebra','Topology']);
  expect(groups[0].topics[0].name).toBe('Groups');
  expect(groups[0].topics[0].concepts.map(c=>c.name)).toEqual(['Actions','Subgroups']);
  expect(groups[0].demonstrated).toBe(1);
  expect(groups[0].topics[0].active).toBe(1);
  expect(groups[1].topics[0].name).toBe('General');
  expect(groups.flatMap(s=>s.topics.flatMap(t=>t.concepts)).map(c=>c.id).sort()).toEqual(['c1','c2','c3']);
 });
 it('never invents a subject for orphaned concepts',()=>{
  expect(atlasHierarchy({...graph,concepts:[...graph.concepts,{...graph.concepts[0],id:'orphan',subjectId:'missing'}]}).flatMap(s=>s.topics.flatMap(t=>t.concepts))).toHaveLength(3);
 });
});
describe('Atlas minimap camera geometry',()=>{
 const nodes=[{x:-100,y:-80},{x:120,y:160}];
 it('roundtrips world coordinates through the 104px minimap',()=>{
  const b=atlasMinimapBounds(nodes);
  for(const node of nodes){
   const mini=minimapPoint(node,b);
   const back=minimapWorldPoint(mini.x,mini.y,b);
   expect(back.x).toBeCloseTo(node.x,7);
   expect(back.y).toBeCloseTo(node.y,7);
  }
 });
 it('scales the visible camera rectangle with zoom',()=>{
  const b=atlasMinimapBounds(nodes);
  const wide=minimapViewport({x:0,y:0,k:1},390,844,b);
  const close=minimapViewport({x:0,y:0,k:2},390,844,b);
  expect(close.width).toBeCloseTo(wide.width/2);
  expect(close.height).toBeCloseTo(wide.height/2);
 });
});
