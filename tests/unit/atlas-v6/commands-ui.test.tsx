import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import AtlasCommands from '../../../src/features/atlas/v6/AtlasCommands';
import {getApi} from '../../../src/data';
import type {AtlasGraph} from '../../../src/data/types';
vi.mock('../../../src/data',()=>({getApi:vi.fn()}));
const graph={
 subjects:[{id:'s',name:'Mathematics'}],
 concepts:[
  {id:'source',name:'Source',slug:'source',subjectId:'s',version:3,
   parentId:null,blurb:'',status:'not_started',pinX:null,pinY:null,checkpointRefs:[],dueCards:0},
  {id:'keep',name:'Kept',slug:'keep',subjectId:'s',version:4,
   parentId:null,blurb:'',status:'not_started',pinX:null,pinY:null,checkpointRefs:[],dueCards:0}
 ],links:[]
} as unknown as AtlasGraph;
const impact={childConcepts:2,incomingPrerequisites:1,outgoingPrerequisites:0,
 relatedConcepts:3,notesAndCards:5,checkpointRefs:1};
const render=async(node:React.ReactNode)=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 await act(async()=>root.render(node));
 return {host,root,close:async()=>{await act(async()=>root.unmount());host.remove()}};
};
beforeEach(()=>vi.clearAllMocks());

describe('N105.2 Atlas explicit command controls',()=>{
 it('previews the exact merge under both owner versions before enabling confirmation',async()=>{
  const previewConceptMerge=vi.fn(async()=>({
   status:'ok',actionNo:null,changed:[],sourceVersion:3,keepVersion:4,impact
  }));
  const mergeConcept=vi.fn(async()=>({
   status:'ok',actionNo:14,changed:[],concept:{id:'keep',version:5},impact
  }));
  const onSaved=vi.fn(async()=>{}),onClose=vi.fn();
  vi.mocked(getApi).mockReturnValue({previewConceptMerge,mergeConcept} as never);
  const {host,close}=await render(<AtlasCommands graph={graph}
   sourceId="source" onClose={onClose} onSaved={onSaved}/>);
  try{
   const selector=host.querySelector('[aria-label="Atlas edit operation"]') as HTMLSelectElement;
   await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(selector,'merge');
    selector.dispatchEvent(new Event('change',{bubbles:true}));
   });
   const confirm=()=>[...host.querySelectorAll('button')].find(b=>
    b.textContent?.trim()==='Confirm merge') as HTMLButtonElement;
   expect(confirm().disabled).toBe(true);
   await act(async()=>[...host.querySelectorAll('button')].find(b=>
    b.textContent==='Preview merge impact')!.click());
   expect(previewConceptMerge).toHaveBeenCalledWith('source','keep');
   expect(host.textContent).toContain('source v3, kept v4');
   expect(host.textContent).toContain('5');
   expect(confirm().disabled).toBe(false);
   await act(async()=>confirm().click());
   expect(mergeConcept).toHaveBeenCalledWith('source',3,'keep',4);
   expect(onSaved).toHaveBeenCalledTimes(1);
   expect(onClose).toHaveBeenCalledTimes(1);
  }finally{await close()}
 });
 it('does not silently submit after a failed merge preview',async()=>{
  const onSaved=vi.fn(),onClose=vi.fn();
  const previewConceptMerge=vi.fn(async()=>{throw Error('Owner version changed')});
  vi.mocked(getApi).mockReturnValue({previewConceptMerge,mergeConcept:vi.fn()} as never);
  const {host,close}=await render(<AtlasCommands graph={graph}
   sourceId="source" onClose={onClose} onSaved={onSaved}/>);
  try{
   const selector=host.querySelector('[aria-label="Atlas edit operation"]') as HTMLSelectElement;
   await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(selector,'merge');
    selector.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await act(async()=>[...host.querySelectorAll('button')].find(b=>
    b.textContent==='Preview merge impact')!.click());
   expect(host.querySelector('[role="alert"]')?.textContent).toContain('Owner version changed');
   expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
   expect(onSaved).not.toHaveBeenCalled();
  }finally{await close()}
 });
 it('creates one owner idea only after explicit form submission',async()=>{
  const createConcept=vi.fn(async()=>({status:'ok',actionNo:5,changed:[],
   concept:{id:'created',version:1}}));
  const onClose=vi.fn(),onSaved=vi.fn(async()=>{});
  vi.mocked(getApi).mockReturnValue({createConcept} as never);
  const {host,close}=await render(<AtlasCommands graph={graph}
   sourceId={null} onClose={onClose} onSaved={onSaved}/>);
  try{
   const name=host.querySelector('[aria-label="Atlas idea name"]') as HTMLInputElement;
   await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name,'Measure theory');
    name.dispatchEvent(new Event('input',{bubbles:true}));
   });
   expect(createConcept).not.toHaveBeenCalled();
   await act(async()=>host.querySelector('form')!.dispatchEvent(
    new Event('submit',{bubbles:true,cancelable:true})));
   expect(createConcept).toHaveBeenCalledWith({
    subjectId:'s',name:'Measure theory',blurb:null});
   expect(onSaved).toHaveBeenCalledTimes(1);
   expect(onClose).toHaveBeenCalledTimes(1);
  }finally{await close()}
 });
});
