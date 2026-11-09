import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import FocusNotices from '../../../src/features/focus/FocusNotices';
import {setThoughtApiForTests} from '../../../src/data/parked-thoughts';
import {setStudyEventApiForTests} from '../../../src/data/study-events';
import type {ThoughtApi} from '../../../src/data/parked-thoughts';
import type {StudyEventApi} from '../../../src/data/study-events';

const ENTRY='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mocks=()=>{
 const createThought=vi.fn(async()=>({record:{id:'thought'},actionNo:null}));
 const recordEvent=vi.fn(async()=>({record:{id:'event'},actionNo:null}));
 const listEvents=vi.fn(async()=>({items:[],total:4,nextCursor:null}));
 setThoughtApiForTests({mode:'live',createThought} as unknown as ThoughtApi);
 setStudyEventApiForTests({mode:'live',listEvents,recordEvent} as unknown as StudyEventApi);
 return {createThought,recordEvent,listEvents};
};
async function render(){
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 await act(async()=>root.render(<FocusNotices entryId={ENTRY}/>));
 await vi.waitFor(()=>expect(host.querySelector('output')?.textContent).toBe('4'));
 return {host,async cleanup(){await act(async()=>root.unmount());host.remove();}};
}
function button(host:ParentNode,text:string){
 const found=Array.from(host.querySelectorAll('button')).find(x=>x.textContent?.trim()===text);
 if(!found)throw Error('Missing '+text);return found;
}
async function click(element:HTMLElement){await act(async()=>element.click());}
async function value(field:HTMLTextAreaElement|HTMLInputElement,text:string){
 const setter=Object.getOwnPropertyDescriptor(
  field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,
  'value')!.set!;
 await act(async()=>{setter.call(field,text);field.dispatchEvent(new Event('input',{bubbles:true}));});
}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});});
afterEach(()=>{setThoughtApiForTests(null);setStudyEventApiForTests(null);document.body.innerHTML='';});

describe('N71 v6 Focus parked thoughts, drift and notices',()=>{
 it('shows only owner-scoped active notice count and keeps it through remount',async()=>{
  const api=mocks(),v=await render();
  try{
   expect(api.listEvents).toHaveBeenCalledWith({entryId:ENTRY,kind:['notice'],limit:1});
   expect(v.host.textContent).toContain('Drift is recorded, not deducted');
   expect(v.host.querySelector('[aria-label="Focus notice count"]')?.textContent).toBe('4');
  }finally{await v.cleanup();}
  const reloaded=await render();
  try{expect(reloaded.host.querySelector('output')?.textContent).toBe('4');}
  finally{await reloaded.cleanup();}
 });
 it('parks a thought linked to the current entry without touching study time',async()=>{
  const api=mocks(),v=await render();
  try{
   await click(button(v.host,'Park a thought'));
   const dialog=v.host.querySelector('dialog')!;
   expect(dialog.open).toBe(true);
   await value(dialog.querySelector('textarea')!,'  Review a proof step  ');
   await click(button(dialog,'Save thought'));
   expect(api.createThought).toHaveBeenCalledTimes(1);
   expect(api.createThought).toHaveBeenCalledWith({text:'Review a proof step',studyEntryId:ENTRY});
   expect(api.recordEvent).not.toHaveBeenCalled();
   expect(dialog.open).toBe(false);
  }finally{await v.cleanup();}
 });
 it('records a positive whole-minute drift without deductions or a false notice',async()=>{
  const api=mocks(),v=await render();
  try{
   await click(button(v.host,'Noticed a distraction'));
   const dialog=v.host.querySelector('dialog')!;
   await value(dialog.querySelector('input')!,'0');
   await click(button(dialog,'Record drift'));
   expect(api.recordEvent).not.toHaveBeenCalled();
   expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('1–100000');
   await value(dialog.querySelector('input')!,'3');
   await click(button(dialog,'Record drift'));
   expect(api.recordEvent).toHaveBeenCalledWith({entryId:ENTRY,kind:'drift',durationMinutes:3});
   expect(api.createThought).not.toHaveBeenCalled();
   expect(v.host.querySelector('output')?.textContent).toBe('4');
  }finally{await v.cleanup();}
 });
 it('Escape closes the native modal and restores keyboard focus',async()=>{
  mocks();const v=await render();
  try{
   const trigger=button(v.host,'Park a thought');
   await click(trigger);
   const dialog=v.host.querySelector('dialog')!;
   await act(async()=>dialog.dispatchEvent(new Event('cancel',{cancelable:true})));
   expect(dialog.open).toBe(false);
   expect(document.activeElement).toBe(trigger);
  }finally{await v.cleanup();}
 });
});
