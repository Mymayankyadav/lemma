import {describe,expect,it} from 'vitest';
import {fitAtlasViewport,visibleAtlasLabels} from '../../../src/features/atlas/graph';
import type {AtlasNode} from '../../../src/features/atlas/graph';

describe('Atlas viewport fitting',()=>{
 it('keeps every point between the header and detail tray',()=>{
  const nodes=[{x:-220,y:-180},{x:260,y:230},{x:30,y:-10}];
  const {x,y,k}=fitAtlasViewport(nodes,390,844);
  expect(k).toBeGreaterThan(0.2);
  for(const node of nodes){
   expect(x+node.x*k).toBeGreaterThanOrEqual(23);
   expect(x+node.x*k).toBeLessThanOrEqual(367);
   expect(y+node.y*k).toBeGreaterThanOrEqual(145);
   expect(y+node.y*k).toBeLessThanOrEqual(716);
  }
 });
});

describe('Atlas label collision policy',()=>{
 const nodes=[
  {id:'a',name:'Compactness',status:'revisit',x:0,y:0},
  {id:'b',name:'Metric spaces',status:'in_progress',x:8,y:4},
  {id:'c',name:'Topology',status:'demonstrated',x:250,y:160},
 ] as AtlasNode[];
 it('prioritizes urgent labels and keeps distant labels',()=>{
  const labels=visibleAtlasLabels(nodes,null);
  expect([...labels].sort()).toEqual(['a','c']);
 });
 it('always shows the selected label and suppresses its neighbour',()=>{
  const labels=visibleAtlasLabels(nodes,'b');
  expect([...labels].sort()).toEqual(['b','c']);
 });
});
