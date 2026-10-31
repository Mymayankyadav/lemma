import {describe,it,expect} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {arcsFor,arcTone,buildAtlasTree,defaultExpanded,expandedToDepth,focusOn,neighbours,visibleRows} from '../../../src/features/atlas/tree';

const idea=(id:string,parentId:string|null,level:'galaxy'|'system'|'planet',status:'demonstrated'|'in_progress'|'not_started'|'revisit'='not_started')=>({
 id,slug:id,name:id,subjectId:'analysis',level,parentId,blurb:null,pinX:null,pinY:null,status,checkpointRefs:[],dueCards:0});
const graph:AtlasGraph={
 subjects:[{id:'analysis',name:'Analysis',glyph:'∫',hue:'amber',position:0},{id:'zz-selftest',name:'zz-selftest',glyph:'S',hue:'amber',position:1}],
 concepts:[
  idea('topology',null,'galaxy'),idea('sequences',null,'galaxy'),
  idea('open set','topology','planet','demonstrated'),idea('compactness','topology','planet','in_progress'),
  idea('cauchy','sequences','planet'),idea('completeness','sequences','planet','revisit'),
  {...idea('hidden',null,'planet'),subjectId:'zz-selftest'},
 ],
 links:[
  {fromId:'open set',toId:'compactness',kind:'prereq'},
  {fromId:'compactness',toId:'completeness',kind:'prereq'},
  {fromId:'cauchy',toId:'completeness',kind:'prereq'},
  {fromId:'open set',toId:'cauchy',kind:'related'},
 ],
};

describe('Atlas tree',()=>{
 const tree=buildAtlasTree(graph);
 it('nests ideas under one root per subject and hides self-test data',()=>{
  expect(tree.roots).toEqual(['atlas:root:analysis']);
  expect(tree.nodes.has('hidden')).toBe(false);
  expect(tree.nodes.get('topology')!.children).toEqual(['open set','compactness']);
  expect(tree.nodes.get('atlas:root:analysis')!.total).toBe(4);
  expect(tree.nodes.get('sequences')!.revisit).toBe(1);
 });
 it('orders ideas by prerequisites, not by name, so links mostly run downwards',()=>{
  expect(tree.nodes.get('sequences')!.children).toEqual(['cauchy','completeness']);
  expect(tree.nodes.get('topology')!.children[0]).toBe('open set');
 });
 it('opens the path to work in progress by default and folds to a depth',()=>{
  const open=defaultExpanded(tree);
  expect(open.has('topology')).toBe(true);
  expect(visibleRows(tree,expandedToDepth(tree,1)).map(r=>r.id)).toEqual(['atlas:root:analysis']);
 });
 it('re-attaches links to folded branches and drops links inside one branch',()=>{
  const folded=visibleRows(tree,new Set(['atlas:root:analysis']));
  const arcs=arcsFor(tree,folded,new Set(['prereq']));
  expect(arcs).toHaveLength(1);
  expect(arcs[0]).toMatchObject({from:2,to:1,count:1,kind:'prereq'});
  const all=visibleRows(tree,new Set(['atlas:root:analysis','topology','sequences']));
  expect(arcsFor(tree,all,new Set(['prereq','related']))).toHaveLength(4);
 });
 it('follows the whole chain an idea builds on and opens up',()=>{
  const focus=focusOn(tree,'compactness');
  expect([...focus.up]).toEqual(['open set']);
  expect([...focus.down]).toEqual(['completeness']);
  const rows=visibleRows(tree,new Set(['atlas:root:analysis','topology','sequences']));
  const tones=arcsFor(tree,rows,new Set(['prereq'])).map(a=>arcTone(a,focus)).sort();
  expect(tones).toEqual(['down','none','up']);
  expect(neighbours(tree,'completeness').needs.map(n=>n.id)).toEqual(['cauchy','compactness']);
 });
 it('filters to matches and the path that leads to them',()=>{
  const rows=visibleRows(tree,new Set(),n=>n.id==='cauchy');
  expect(rows.map(r=>r.id)).toEqual(['atlas:root:analysis','sequences','cauchy']);
  expect(rows.map(r=>r.match)).toEqual([false,false,true]);
 });
});

describe('Atlas tree with several fields in one subject',()=>{
 it('keeps every field as a root instead of dropping all but the first',()=>{
  const two=buildAtlasTree({subjects:[{id:'s',name:'Maths',glyph:'M',hue:'amber',position:0}],links:[],
   concepts:[{...idea('b-field',null,'galaxy'),subjectId:'s',level:'cluster'},{...idea('a-field',null,'galaxy'),subjectId:'s',level:'cluster'},
    {...idea('inside',null,'planet'),subjectId:'s',parentId:'b-field'}]});
  expect(two.roots).toEqual(['a-field','b-field']);
  expect(two.nodes.get('b-field')!.children).toEqual(['inside']);
 });
});


describe('Proposed plan synthetic checkpoint topics',()=>{
 it('keeps groups in numeric CP order beyond CP9, without changing ordinary Atlas ordering',()=>{
  const concepts=Array.from({length:40},(_,i)=>({
   ...idea('flat-idea-'+(i+1),null,'planet'),
   topic:'Taught in CP'+(i+1),
   checkpointRefs:[{projectSlug:'analysis',code:'CP'+(i+1)}],
  }));
  const tree=buildAtlasTree({subjects:graph.subjects.slice(0,1),concepts,links:[]});
  const root=tree.nodes.get('atlas:root:analysis')!;
  expect(root.children.map(id=>tree.nodes.get(id)!.name)).toEqual(
   Array.from({length:40},(_,i)=>'Taught in CP'+(i+1)),
  );
 });
});
