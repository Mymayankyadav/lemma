import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import ConceptPin from '../../../src/features/atlas/v6/ConceptPin';
import AtlasImpactPreview from '../../../src/features/atlas/v6/ImpactPreview';
import {checkAtlasLink,describeAtlasMergeImpact,type AtlasEditNode}
 from '../../../src/features/atlas/v6/impact';
const nodes:AtlasEditNode[]=[
 {id:'a',parentId:null,prerequisiteIds:[]},
 {id:'b',parentId:'a',prerequisiteIds:['a']},
 {id:'c',parentId:'b',prerequisiteIds:['b']},
 {id:'d',parentId:null,prerequisiteIds:[]},
];
describe('N86 Atlas editor safety and merge impact',()=>{
 it('rejects self links and parent cycles with a reason',()=>{
  expect(checkAtlasLink(nodes,'a','a','parent')).toEqual({ok:false,reason:expect.any(String)});
  expect(checkAtlasLink(nodes,'a','c','parent')).toMatchObject({ok:false});
  expect(checkAtlasLink(nodes,'d','a','parent')).toEqual({ok:true});
 });
 it('checks prerequisite cycles independently of the parent tree',()=>{
  expect(checkAtlasLink(nodes,'a','c','prerequisite')).toMatchObject({ok:false});
  expect(checkAtlasLink(nodes,'c','d','prerequisite')).toEqual({ok:true});
  expect(checkAtlasLink(nodes,'c','missing','prerequisite')).toMatchObject({ok:false});
 });
 it('offers an explicit, non-destructive impact count before merging',()=>{
  expect(describeAtlasMergeImpact(nodes,'b','d',[{leftId:'b',rightId:'c'}]))
   .toEqual({childConcepts:1,incomingPrerequisites:1,
    outgoingPrerequisites:1,relatedConcepts:1});
  expect(()=>describeAtlasMergeImpact(nodes,'a','a')).toThrow();
  expect(nodes[1].parentId).toBe('a');
 });
});

describe('N86 existing owner-authorized map pin write path',()=>{
 it('submits finite coordinates once and only closes after success',async()=>{
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),onSave=vi.fn(async()=>{}),onClose=vi.fn();
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<ConceptPin id="concept-1" name="Compactness"
    x={null} y={null} onSave={onSave} onClose={onClose}/>));
   const x=host.querySelector('[aria-label="Map X coordinate"]') as HTMLInputElement;
   const y=host.querySelector('[aria-label="Map Y coordinate"]') as HTMLInputElement;
   await act(async()=>{
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
    set.call(x,'1.5');x.dispatchEvent(new Event('input',{bubbles:true}));
    set.call(y,'-2');y.dispatchEvent(new Event('input',{bubbles:true}));
   });
   await act(async()=>host.querySelector('form')!.dispatchEvent(
    new Event('submit',{bubbles:true,cancelable:true})));
   expect(onSave).toHaveBeenCalledWith('concept-1',1.5,-2);
   expect(onSave).toHaveBeenCalledTimes(1);
   expect(onClose).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>root.unmount());host.remove()}
 });
 it('unpins through the existing API rather than direct DML and surfaces errors',async()=>{
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),onClose=vi.fn();
  const onSave=vi.fn(async()=>{
   throw Error('Owner mutation refused');
  });
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<ConceptPin id="concept-1" name="Algebra"
    x={1} y={2} onSave={onSave} onClose={onClose}/>));
   await act(async()=>[...host.querySelectorAll('button')].find(x=>
    x.textContent==='Unpin')!.click());
   expect(onSave).toHaveBeenCalledWith('concept-1',null,null);
   expect(onClose).not.toHaveBeenCalled();
   expect(host.querySelector('[role="alert"]')?.textContent).toContain('Owner mutation refused');
  }finally{await act(async()=>root.unmount());host.remove()}
 });
});

describe('N86 no fake concept mutations in preview',()=>{
 it('shows exact existing graph merge impact and a concrete cycle reason',async()=>{
  const graph={
   subjects:[],concepts:[
    {id:'a',name:'A',parentId:null},{id:'b',name:'B',parentId:'a'},
    {id:'c',name:'C',parentId:'b'},{id:'d',name:'D',parentId:null},
   ],links:[{fromId:'a',toId:'b',kind:'prereq'},
    {fromId:'b',toId:'c',kind:'prereq'},
    {fromId:'b',toId:'d',kind:'related'}],
  } as never;
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),onClose=vi.fn();
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<AtlasImpactPreview graph={graph}
    sourceId="a" onClose={onClose}/>));
   expect(host.textContent).toContain('Preview only');
   expect(host.textContent).toContain('parent cycle');
   expect(host.querySelector('[aria-label="Merge impact preview"]')).toBeTruthy();
   expect(host.textContent).toContain('Incoming prerequisites');
   expect([...host.querySelectorAll('button')].some(b=>/merge|save/i.test(b.textContent??'')))
    .toBe(false);
   await act(async()=>[...host.querySelectorAll('button')].find(b=>
    b.textContent==='Close preview')!.click());
   expect(onClose).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>root.unmount());host.remove()}
 });
});
