import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import type {AtlasGraph} from '../../../src/data/types';
import {atlasSummary,buildAtlasModel,checkpointName,kitSubject,searchStars,starCounts} from '../../../src/features/atlas/v7/model';

const concept=(id:string,status:AtlasGraph['concepts'][number]['status'],extra:Partial<AtlasGraph['concepts'][number]>={}):AtlasGraph['concepts'][number]=>
 ({id,slug:id,name:id,blurb:null,subjectId:'s1',status,pinX:null,pinY:null,checkpointRefs:[],dueCards:0,...extra});

describe('v7 Atlas model (PLAN §6.12 Done when)',()=>{
 it('shows the seed as 82 stars in three constellations, 9 of them demonstrated',async()=>{
  const model=buildAtlasModel(await new DemoAdapter().getAtlas());
  expect(model.stars).toHaveLength(82);
  expect(model.clusters.map(cluster=>cluster.name)).toEqual(['Analysis','Topology','Linear Algebra']);
  expect(model.clusters.map(cluster=>cluster.subject)).toEqual(['Analysis','Topology','Algebra']);
  expect(model.counts).toEqual({concepts:82,connections:26,demonstrated:9});
  expect(atlasSummary(model)).toBe('82 concepts, 26 connections, 9 demonstrated');
 });
 it('finds 7 concepts for "comp" and counts Compactness correctly',async()=>{
  const model=buildAtlasModel(await new DemoAdapter().getAtlas());
  const hits=searchStars(model,'comp').map(i=>model.stars[i].label);
  expect(hits).toHaveLength(7);
  expect(hits).toContain('Compactness');
  expect(hits.slice(0,5).every(name=>name.toLowerCase().startsWith('comp'))).toBe(true);
  const compactness=model.index.get('concept-compactness')!;
  expect(model.stars[compactness].state).toBe('in_progress');
  expect(starCounts(model,compactness)).toBe('Checkpoint 4 · 9 cards due · 6 neighbours');
 });
 it('derives up next, star sizes and subject identity from the graph only',()=>{
  const graph:AtlasGraph={subjects:[{id:'s1',name:'Topology'} as AtlasGraph['subjects'][number]],
   concepts:[concept('a','demonstrated'),concept('b','not_started'),concept('c','not_started'),concept('d','in_progress',{dueCards:12,checkpointRefs:[{projectSlug:'p',code:'CP2'}]})],
   links:[{fromId:'a',toId:'b',kind:'prereq'},{fromId:'d',toId:'c',kind:'prereq'},{fromId:'a',toId:'d',kind:'related'},{fromId:'a',toId:'missing',kind:'prereq'}]};
  const model=buildAtlasModel(graph);
  expect(model.stars.map(star=>star.state)).toEqual(['demonstrated','up_next','not_started','in_progress']);
  expect(model.edges).toHaveLength(3);
  const diameters=model.stars.map(star=>star.radius*2);
  expect(Math.max(...diameters)).toBeCloseTo(14);
  expect(Math.min(...diameters)).toBeGreaterThanOrEqual(6);
  expect(model.neighbours[0]).toEqual([1,3]);
  expect(kitSubject('Linear Algebra')).toBe('Algebra');
  expect(kitSubject('Real analysis')).toBe('Analysis');
  expect(kitSubject('Astronomy')).toBe('Other');
  expect(checkpointName('CP12')).toBe('Checkpoint 12');
 });
});
