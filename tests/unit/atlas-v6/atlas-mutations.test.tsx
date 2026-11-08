import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {getApi} from '../../../src/data';
import AtlasEditor from '../../../src/features/atlas/v6/AtlasEditor';
import AtlasImpactPreview from '../../../src/features/atlas/v6/ImpactPreview';
import type {AtlasGraph} from '../../../src/data/types';
vi.mock('../../../src/data',()=>({getApi:vi.fn()}));
const s='11111111-1111-4111-8111-111111111111';
const a='22222222-2222-4222-8222-222222222222';
const b='33333333-3333-4333-8333-333333333333';
const impact={childConcepts:1,incomingPrerequisites:2,outgoingPrerequisites:0,
 relatedConcepts:1,notesAndCards:0,checkpointRefs:0};
const graph:AtlasGraph={
 subjects:[{id:s,name:'Analysis',glyph:'∑',hue:'cyan',position:0}],
 concepts:[a,b].map((id,i)=>({id,subjectId:s,name:['Compactness','Open cover'][i],
  slug:id,blurb:null,parentId:null,status:'not_started',dueCards:0,
  pinX:null,pinY:null,checkpointRefs:[],version:i+1})),
 links:[],
};
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const calls={
 createAtlasConcept:vi.fn(async()=>({id:a,version:1,actionNo:null})),
 updateAtlasConcept:vi.fn(async()=>({id:a,version:2,actionNo:null})),
 reparentAtlasConcept:vi.fn(async()=>({id:a,version:2,actionNo:null})),
 getAtlas:vi.fn(async()=>graph),
 previewAtlasMerge:vi.fn(async()=>({sourceVersion:1,keepVersion:2,impact})),
 mergeAtlasConcept:vi.fn(async()=>({id:b,version:3,actionNo:4})),
 linkAtlasConcept:vi.fn(async()=>({id:a,version:2,actionNo:5})),
 unlinkAtlasConcept:vi.fn(async()=>({id:a,version:2,actionNo:5})),
};
async function value(label:string,next:string){
 const input=host.querySelector<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(
  '[aria-label="'+label+'"]')!;
 await act(async()=>{
  const type=input instanceof HTMLInputElement?HTMLInputElement:
   input instanceof HTMLSelectElement?HTMLSelectElement:HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(type.prototype,'value')!.set!.call(input,next);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
async function click(label:string){
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label)!;
 expect(button).toBeTruthy();
 await act(async()=>{button.click();await Promise.resolve()});
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(getApi).mockReturnValue(calls as never);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks()});
describe('N105.2 v6 Atlas mutation controls',()=>{
 it('creates an idea with stable subject and user-entered content',async()=>{
  const saved=vi.fn(async()=>{}),closed=vi.fn();
  await act(async()=>root.render(<AtlasEditor graph={graph} concept={null}
   onSaved={saved} onClose={closed}/>));
  await value('Idea name','New theorem');
  await value('Idea description','Proof outline');
  await act(async()=>host.querySelector('form')!.dispatchEvent(
   new Event('submit',{bubbles:true,cancelable:true})));
  expect(calls.createAtlasConcept).toHaveBeenCalledWith({
   subjectId:s,name:'New theorem',blurb:'Proof outline'});
  expect(saved).toHaveBeenCalledTimes(1);
 });
 it('requires a current version and saves typed edits',async()=>{
  const saved=vi.fn(async()=>{});
  await act(async()=>root.render(<AtlasEditor graph={graph}
   concept={graph.concepts[0]} onSaved={saved} onClose={()=>{}}/>));
  await value('Idea name','Compact sets');
  await click('Save idea');
  expect(calls.updateAtlasConcept).toHaveBeenCalledWith(a,1,{
   name:'Compact sets',blurb:null});
  expect(saved).toHaveBeenCalled();
 });
 it('requires a current preview then sends atomic merge with both versions',async()=>{
  const saved=vi.fn(async()=>{}),close=vi.fn();
  await act(async()=>root.render(<AtlasImpactPreview
   graph={graph} sourceId={a} onSaved={saved} onClose={close}/>));
  await value('Atlas edit action','merge');
  expect(host.querySelector('button[disabled]')?.textContent).toContain('Confirm merge');
  await click('Preview merge');
  expect(calls.previewAtlasMerge).toHaveBeenCalledWith(a,b);
  expect(host.textContent).toContain('Incoming prerequisites');
  await click('Confirm merge');
  expect(calls.mergeAtlasConcept).toHaveBeenCalledWith(a,1,b,2);
  expect(saved).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
 });
});
