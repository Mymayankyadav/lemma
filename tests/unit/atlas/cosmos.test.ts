import {describe,it,expect} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {area,buildCosmos,childrenOf,fit,miniProjection,projectedViewport} from '../../../src/features/atlas/cosmos';

function fixture(count=500):AtlasGraph{
 const subjects=[
  {id:'analysis',name:'Analysis',glyph:'∫' as const,hue:'amber' as const,position:0},
  {id:'algebra',name:'Algebra',glyph:'G' as const,hue:'cyan' as const,position:1},
  {id:'zz-selftest',name:'zz-selftest',glyph:'S' as const,hue:'amber' as const,position:2},
 ];
 return {subjects,concepts:Array.from({length:count},(_,i)=>({
  id:'idea-'+i,slug:'idea-'+i,name:'Theorem '+i,subjectId:i%2?'analysis':'algebra',
  level:'planet' as const,topic:'Topic '+Math.floor(i/6),parentId:null,isStar:i%6===0,blurb:null,
  pinX:null,pinY:null,status:i%3===0?'demonstrated' as const:'not_started' as const,
  checkpointRefs:[],dueCards:0,
 })).concat([{id:'bad',slug:'bad',name:'Test idea',subjectId:'zz-selftest',level:'planet' as const,
  topic:'Internal',parentId:null,isStar:false,blurb:null,pinX:null,pinY:null,
  status:'not_started' as const,checkpointRefs:[],dueCards:0}]),links:[]};
}
describe('v3 Atlas cosmos',()=>{
 it('keeps subjects as roots, synthesises legacy topics and hides system data',()=>{
  const model=buildCosmos(fixture(22));
  expect(model.roots).toHaveLength(2);
  expect(model.bodies.has('bad')).toBe(false);
  expect(childrenOf(model,null)).toHaveLength(2);
  expect([...model.bodies.values()].filter(b=>b.level==='planet')).toHaveLength(22);
  expect(model.roots.map(id=>model.bodies.get(id)!.total).reduce((a,b)=>a+b,0)).toBe(22);
 });
 it('uses one projection scale and keeps the visible rectangle geometrically exact',()=>{
  const nodes=childrenOf(buildCosmos(fixture(26)),null),bounds=area(nodes);
  const camera=fit(bounds,390,680),projection=miniProjection(bounds);
  const rectangle=projectedViewport(camera,390,680,projection);
  expect(rectangle.width/rectangle.height).toBeCloseTo(390/680,10);
  expect(projection.k).toBeGreaterThan(0);
  expect(rectangle.x).toBeGreaterThanOrEqual(-1);
  expect(rectangle.y).toBeGreaterThanOrEqual(-1);
 });
 it('constructs a 500-idea forest without rendering a 500-node overview',()=>{
  const start=performance.now();
  const model=buildCosmos(fixture());
  expect(model.roots).toHaveLength(2);
  expect([...model.bodies.values()].filter(b=>b.level==='planet')).toHaveLength(500);
  expect(childrenOf(model,null)).toHaveLength(2);
  expect(childrenOf(model,model.roots[0]).length).toBeGreaterThan(0);
  expect(performance.now()-start).toBeLessThan(1500);
 });
 it('keeps an explicit five-level hierarchy intact',()=>{
  const graph=fixture(0);
  graph.concepts.push(...[
   {id:'c',slug:'c',name:'Field',subjectId:'analysis',level:'cluster' as const,parentId:null},
   {id:'g',slug:'g',name:'Course',subjectId:'analysis',level:'galaxy' as const,parentId:'c'},
   {id:'s',slug:'s',name:'Topic',subjectId:'analysis',level:'system' as const,parentId:'g'},
   {id:'p',slug:'p',name:'Theorem',subjectId:'analysis',level:'planet' as const,parentId:'s'},
   {id:'m',slug:'m',name:'Lemma',subjectId:'analysis',level:'moon' as const,parentId:'p'},
  ].map(c=>({...c,blurb:null,pinX:null,pinY:null,status:'demonstrated' as const,checkpointRefs:[],dueCards:0})));
  const m=buildCosmos(graph);
  expect(childrenOf(m,null)[0].id).toBe('c');
  expect(['c','g','s','p'].map(id=>childrenOf(m,id)[0].id)).toEqual(['g','s','p','m']);
  expect(m.bodies.get('c')!.done).toBe(2);
 });
});
